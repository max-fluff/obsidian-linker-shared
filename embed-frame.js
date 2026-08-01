'use strict';

// The shell both sigil embeds share: a fenced block that resolves its spec, draws a header with
// a toolbar over a body, re-renders when the index changes, and can write its own block back.
// What is resolved and what is drawn is the plugin's; everything around it is here.

const obsidian = require('obsidian');
const { t } = require('./i18n');

// First non-empty line is the target; later "key: value" lines tune it, for the keys the
// plugin declares. Anything else is left alone — a spec is a note's text first.
function parseSpec(source, keys) {
  const spec = { target: '' };
  for (const k of keys) spec[k] = '';
  const re = new RegExp('^(' + keys.join('|') + ')\\s*:\\s*(.*)$', 'i');
  for (const raw of String(source == null ? '' : source).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = re.exec(line);
    if (m) spec[m[1].toLowerCase()] = m[2].trim();
    else if (!spec.target) spec.target = line;
  }
  return spec;
}

// A block body with `key: value` set: replaced where the line already stands, appended where it
// doesn't, dropped when the value is empty. The reader's other lines keep their order.
function setSpecLine(body, key, value) {
  const re = new RegExp('^\\s*' + key + '\\s*:', 'i');
  const at = body.findIndex((l) => re.test(l));
  if (!value) return body.filter((l) => !re.test(l));
  if (at < 0) return [...body, key + ': ' + value];
  const out = body.slice();
  out[at] = key + ': ' + value;
  return out;
}

// Put a block's edited body back into its note. An open editor keeps cursor and undo; in
// reading view there is none, so the file is rewritten through the vault.
async function writeEmbedBody(app, sourcePath, info, body) {
  const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
  const editor = view && view.file && view.file.path === sourcePath ? view.editor : null;
  if (editor) {
    editor.replaceRange(body.join('\n') + '\n', { line: info.lineStart + 1, ch: 0 }, { line: info.lineEnd, ch: 0 });
    return true;
  }
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!file) return false;
  let moved = false;
  await app.vault.process(file, (data) => {
    const lines = data.split('\n');
    // getSectionInfo numbered the block against the text as rendered, so an edit since then
    // would splice these lines out of whatever now sits at those numbers.
    const here = lines.slice(info.lineStart, info.lineEnd + 1).join('\n');
    if (here !== info.text.split('\n').slice(info.lineStart, info.lineEnd + 1).join('\n')) {
      moved = true;
      return data;
    }
    lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...body);
    return lines.join('\n');
  });
  return !moved;
}

// One toolbar control. Obsidian's own clickable-icon, so it reads as the app's; the label is
// both the tooltip and the accessible name.
function toolButton(parent, cls, icon, label, onClick) {
  const b = parent.createEl('button', {
    cls: 'clickable-icon ' + cls + '-embed-button',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  if (icon && typeof obsidian.setIcon === 'function') obsidian.setIcon(b, icon);
  b.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); onClick(evt); });
  return b;
}

// A block that resolves, draws and follows the index. A plugin subclasses it and fills in the
// hooks below; nothing here knows what a target or a body is.
class EmbedFrame extends obsidian.MarkdownRenderChild {
  // `cls` is the plugin's class prefix, the same one its stylesheet is written against.
  constructor(containerEl, plugin, spec, ctx, cls) {
    super(containerEl);
    this.plugin = plugin;
    this.spec = spec;
    this.ctx = ctx; // getSectionInfo finds this block back in the note, so it can be edited
    this.cls = cls;
    this.renderId = 0;
    this.lastSig = null;
  }

  // --- what a plugin fills in ---------------------------------------------------------------

  // The spec resolved to whatever renderBody needs, or { error } for an inline notice.
  resolve() { return { error: 'embed-frame: resolve() not implemented' }; }

  // Everything this embed shows, as a string. Same string means nothing changed and the
  // re-render is skipped; null means the answer isn't knowable, so never skip.
  sig() { return null; }

  headerText() { return ''; }

  // Draw into `body`. False means nothing could be drawn — the frame shows its own notice.
  async renderBody() { return false; }

  // Fill the plugin's own toolbar row, on every render: a control that reads the result of
  // one stays current.
  tools() {}

  menuItems() {}

  // The notice text for a target that resolved but could not be read.
  unreadable() { return ''; }

  release() {}

  // --- the shell ----------------------------------------------------------------------------

  onload() {
    this.containerEl.addEventListener('contextmenu', (evt) => this.onContextMenu(evt));
    this.render();
    // fs.watch -> rebuildIndex -> notifyIndexChange, so an open embed follows the file.
    this.unsub = this.plugin.onIndexChange(() => this.render());
  }

  onunload() {
    if (this.unsub) this.unsub();
    this.release();
  }

  open() {
    const entry = this.res && this.res.entry;
    if (!entry) return;
    this.plugin.withFormat(this.plugin.settings.askOnInsert, (tpl) => this.plugin.openEntry(entry, tpl));
  }

  // The right-click menu, and what ⋯ opens — see CONTRIBUTING.md on what a toolbar may carry.
  menu() {
    const menu = new obsidian.Menu();
    if (this.res.entry) menu.addItem((i) => i.setTitle(t('embed.menu.open')).setIcon('go-to-file').onClick(() => this.open()));
    menu.addItem((i) => i.setTitle(t('embed.menu.refresh')).setIcon('refresh-cw').onClick(() => this.refresh()));
    this.menuItems(menu, this.res);
    return menu;
  }

  onContextMenu(evt) {
    if (!this.res) return;
    evt.preventDefault();
    evt.stopPropagation();
    this.menu().showAtMouseEvent(evt);
  }

  refresh() { return this.render(true); }

  notice(text) {
    this.release();
    this.chrome = null;
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: this.cls + '-embed-error', text });
  }

  button(parent, icon, label, onClick) {
    return toolButton(parent, this.cls, icon, label, onClick);
  }

  // The header, the toolbar and the body, built once and kept: a plugin that holds state in
  // its own controls loses it if the row is rebuilt under it.
  frame() {
    if (this.chrome && this.chrome.body.parentElement === this.containerEl) return this.chrome;
    const el = this.containerEl;
    el.empty();
    el.addClass(this.cls + '-embed');
    const header = el.createDiv({ cls: this.cls + '-embed-header' });
    const title = header.createSpan({ cls: this.cls + '-embed-title mod-clickable' });
    title.addEventListener('click', () => this.open());
    const bar = header.createDiv({ cls: this.cls + '-embed-tools' });
    const own = bar.createDiv({ cls: this.cls + '-embed-group' });
    const common = bar.createDiv({ cls: this.cls + '-embed-group' });
    this.button(common, 'external-link', t('embed.tool.open'), () => this.open());
    this.button(common, 'refresh-cw', t('embed.tool.refresh'), () => this.refresh());
    this.button(common, 'more-horizontal', t('embed.tool.more'), (evt) => this.menu().showAtMouseEvent(evt));
    const body = el.createDiv({ cls: this.cls + '-embed-body' });
    this.chrome = { header, title, tools: own, body };
    return this.chrome;
  }

  async render(force) {
    const token = ++this.renderId;
    const res = this.resolve();
    this.res = res; // the context menu and the toolbar read it

    const sig = res.error ? 'err:' + res.error : this.sig(res);
    if (!force && sig !== null && sig === this.lastSig) return;
    this.lastSig = sig;

    if (res.error) { this.notice(res.error); return; }

    const chrome = this.frame();
    chrome.title.setText(this.headerText(res));
    this.tools(chrome.tools, res);

    const drew = await this.renderBody(chrome.body, res, () => token === this.renderId);
    if (token !== this.renderId) return;
    // A target that resolved but could not be read is worth trying again on the next rebuild,
    // where a resolve error stands until the block or the index changes.
    if (!drew) { this.notice(this.unreadable(res)); this.lastSig = null; }
  }

  setHeader(text) {
    if (this.chrome) this.chrome.title.setText(text);
  }

  // Rewrite this block's own lines in the note. `edit(body)` gets the block body, without the
  // fences, and returns what it should become, or null to leave the note alone.
  async writeBody(edit) {
    const info = this.ctx && this.ctx.getSectionInfo && this.ctx.getSectionInfo(this.containerEl);
    if (!info) return false;
    const next = edit(info.text.split('\n').slice(info.lineStart + 1, info.lineEnd));
    if (!next) return false;
    return writeEmbedBody(this.plugin.app, this.ctx.sourcePath, info, next);
  }
}

module.exports = { EmbedFrame, parseSpec, setSpecLine, writeEmbedBody, toolButton };
