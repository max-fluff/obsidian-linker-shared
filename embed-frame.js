'use strict';

// The shell both sigil embeds share: a fenced block drawn as a header with a toolbar over a
// body, re-rendered on an index change. What is resolved and drawn in it is the plugin's.

const obsidian = require('obsidian');
const { t } = require('./i18n');

// First non-empty line is the target; later "key: value" lines tune it, for the keys the
// plugin declares. A key it did not declare stays part of the target.
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

// Dropped when the value is empty; the reader's other lines keep their order.
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

// Reading view renders a note, it does not edit one, and there is no editor there to undo a
// write in. An unrecognised container counts as reading: shown, not edited, is the safer read.
const inEditor = (el) => !!(el && el.closest && el.closest('.markdown-source-view'));

function toolButton(parent, cls, icon, label, onClick) {
  const b = parent.createEl('button', {
    cls: 'clickable-icon ' + cls + '-embed-button',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  if (icon && typeof obsidian.setIcon === 'function') obsidian.setIcon(b, icon);
  b.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); onClick(evt); });
  return b;
}

class EmbedFrame extends obsidian.MarkdownRenderChild {
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

  resolve() { return { error: 'embed-frame: resolve() not implemented' }; }

  // Same string means nothing changed and the render is skipped; null means never skip.
  sig() { return null; }

  headerText() { return ''; }

  async renderBody() { return false; }

  tools() {}

  menuItems() {}

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

  editable() { return inEditor(this.containerEl); }

  notice(text) {
    this.release();
    this.chrome = null;
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: this.cls + '-embed-error', text });
  }

  button(parent, icon, label, onClick) {
    return toolButton(parent, this.cls, icon, label, onClick);
  }

  // Built once and kept: a plugin holding state in its own controls loses it to a rebuild.
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
    // Worth trying again on the next rebuild, where a resolve error stands until something changes.
    if (!drew) { this.notice(this.unreadable(res)); this.lastSig = null; }
  }

  setHeader(text) {
    if (this.chrome) this.chrome.title.setText(text);
  }

  // `edit(body)` gets the block body without its fences, and returns null to write nothing.
  async writeBody(edit) {
    const info = this.ctx && this.ctx.getSectionInfo && this.ctx.getSectionInfo(this.containerEl);
    if (!info) return false;
    const next = edit(info.text.split('\n').slice(info.lineStart + 1, info.lineEnd));
    if (!next) return false;
    return writeEmbedBody(this.plugin.app, this.ctx.sourcePath, info, next);
  }
}

module.exports = { EmbedFrame, parseSpec, setSpecLine, writeEmbedBody, toolButton, inEditor };
