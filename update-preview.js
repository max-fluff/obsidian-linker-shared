'use strict';

// Previewing a link update before it touches a note, and applying only what was kept.
//
// The point of the preview is that "nothing happened" becomes a verdict you can see: links
// that drifted are listed and toggleable, links that broke are listed with no fix offered,
// and an up-to-date note says so instead of flashing a notice. Applying re-runs the same
// walk under a guard, so a note edited since the preview is skipped rather than clobbered.
//
// What counts as drift belongs to the plugin: it passes a `rewrite(plugin, text, selected)`
// returning { newText, count, changes, broken }, where `selected` null means a dry run that
// records every change under a key, and a set of keys applies just those. Keys are the
// order of appearance, so the same walk over the same text lines them up.

const { Notice, Modal, MarkdownView } = require('obsidian');
const { t } = require('./i18n');

// Rows drawn per note. Anything beyond still follows the note's own checkbox, so nothing is
// applied unseen — the count of the remainder is shown instead.
const MAX_ROWS = 50;

class UpdatePreviewModal extends Modal {
  constructor(app, entries, onApply, prefix) {
    super(app);
    this.entries = entries;
    this.onApply = onApply;
    this.prefix = prefix;
    for (const e of entries) for (const c of e.changes) c.selected = true;
  }

  cls(suffix) { return suffix ? this.prefix + '-' + suffix : this.prefix; }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass(this.cls());
    contentEl.createEl('h3', { text: t('modal.update.title') });

    const changed = this.entries.filter((e) => e.changes.length);
    const total = changed.reduce((n, e) => n + e.changes.length, 0);
    const brokenTotal = this.entries.reduce((n, e) => n + e.broken.length, 0);

    if (!total && !brokenTotal) {
      contentEl.createEl('p', { cls: this.cls('empty'), text: t('modal.update.upToDate') });
    } else {
      if (total) contentEl.createEl('p', { text: t('modal.update.summary', { links: total, files: changed.length }) });
      if (brokenTotal) contentEl.createEl('p', { cls: this.cls('attention'), text: t('modal.update.attention', { n: brokenTotal }) });
      this.entries.forEach((e) => this.renderEntry(contentEl, e));
    }

    const bar = contentEl.createDiv({ cls: this.cls('buttons') });
    if (total) {
      bar.createEl('button', { text: t('btn.apply'), cls: 'mod-cta' }).onclick = async () => {
        this.close();
        await this.onApply(this.entries);
      };
      bar.createEl('button', { text: t('btn.cancel') }).onclick = () => this.close();
    } else {
      bar.createEl('button', { text: t('btn.close'), cls: 'mod-cta' }).onclick = () => this.close();
    }
  }

  renderEntry(contentEl, e) {
    if (!e.changes.length && !e.broken.length) return;
    const head = contentEl.createDiv({ cls: this.cls('file') });
    if (e.changes.length) {
      const rowBoxes = [];
      // The note box mirrors its rows: on when any is kept, dashed when only some are.
      const label = head.createEl('label', { cls: this.cls('check') });
      const master = label.createEl('input', { type: 'checkbox' });
      master.checked = true;
      master.onchange = () => {
        e.changes.forEach((c, i) => { c.selected = master.checked; if (rowBoxes[i]) rowBoxes[i].checked = master.checked; });
        master.indeterminate = false;
      };
      label.createSpan({ text: e.label });
      const syncMaster = () => {
        const on = e.changes.filter((c) => c.selected).length;
        master.checked = on > 0;
        master.indeterminate = on > 0 && on < e.changes.length;
      };

      const table = contentEl.createEl('table', { cls: this.cls('table') });
      e.changes.slice(0, MAX_ROWS).forEach((c) => {
        const tr = table.createEl('tr');
        const cb = tr.createEl('td', { cls: this.cls('pick') }).createEl('input', { type: 'checkbox' });
        cb.checked = c.selected;
        cb.onchange = () => { c.selected = cb.checked; syncMaster(); };
        rowBoxes.push(cb);
        tr.createEl('td', { text: c.label });
        // A change that moved between files shows the path on both sides and is tinted: a
        // move is a guess (matched by name), not a plain drift within one file. Plugins
        // that can't move a target simply never set these.
        if (c.toPath) {
          tr.addClass(this.cls('moved'));
          tr.createEl('td', { cls: this.cls('move'), text: c.fromPath + ':' + c.from + ' → ' + c.toPath + ':' + c.to });
        } else {
          tr.createEl('td', { cls: this.cls('move'), text: c.from + ' → ' + c.to });
        }
      });
      if (e.changes.length > MAX_ROWS) contentEl.createEl('div', { cls: this.cls('more'), text: t('modal.andMore', { n: e.changes.length - MAX_ROWS }) });
    } else {
      head.setText(e.label);
    }
    e.broken.forEach((label) => contentEl.createDiv({ cls: this.cls('broken'), text: t('modal.update.brokenRow', { label }) }));
  }

  onClose() { this.contentEl.empty(); }
}

// Apply the changes the user kept, note by note. Each note is rebuilt from just its selected
// keys and written under a guard, so a note edited since the preview is skipped, not
// clobbered. vault.process reads and writes as one, so the guard can't race.
async function applyUpdates(plugin, entries, rewrite) {
  let files = 0, total = 0, skipped = 0;
  for (const e of entries) {
    const keys = new Set(e.changes.filter((c) => c.selected).map((c) => c.key));
    if (!keys.size) continue;
    if (e.editor) {
      if (e.editor.getValue() !== e.original) { skipped++; continue; }
      const { newText, count } = rewrite(plugin, e.original, keys);
      const cur = e.editor.getCursor();
      e.editor.setValue(newText);
      e.editor.setCursor(cur);
      files++; total += count;
    } else {
      let count = 0;
      await plugin.app.vault.process(e.file, (data) => {
        if (data !== e.original) return data;
        const out = rewrite(plugin, data, keys);
        count = out.count;
        return out.newText;
      });
      if (count) { files++; total += count; } else skipped++;
    }
  }
  let msg = t('notice.linksUpdatedVault', { n: total, files });
  if (skipped) msg += ' ' + t('notice.updateSkipped', { n: skipped });
  new Notice(msg);
}

function openUpdatePreview(plugin, entries, rewrite, prefix) {
  new UpdatePreviewModal(plugin.app, entries, (chosen) => applyUpdates(plugin, chosen, rewrite), prefix).open();
}

// An open editor is previewed and written through the editor, so cursor and undo survive;
// anything else goes through the vault.
async function updateInActiveNote(plugin, rewrite, prefix) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view && view.editor;
  const file = plugin.app.workspace.getActiveFile();
  if (editor) {
    const original = editor.getValue();
    const c = rewrite(plugin, original, null);
    openUpdatePreview(plugin, [{ editor, label: (file && file.path) || t('label.thisNote'), original, changes: c.changes, broken: c.broken }], rewrite, prefix);
    return;
  }
  if (!file) { new Notice(t('notice.linksUpdated', { n: 0 })); return; }
  const original = await plugin.app.vault.read(file);
  const c = rewrite(plugin, original, null);
  openUpdatePreview(plugin, [{ file, label: file.path, original, changes: c.changes, broken: c.broken }], rewrite, prefix);
}

async function updateInVault(plugin, rewrite, prefix) {
  const entries = [];
  for (const f of plugin.app.vault.getMarkdownFiles()) {
    const original = await plugin.app.vault.read(f);
    const c = rewrite(plugin, original, null);
    if (c.changes.length || c.broken.length) entries.push({ file: f, label: f.path, original, changes: c.changes, broken: c.broken });
  }
  openUpdatePreview(plugin, entries, rewrite, prefix);
}

module.exports = { UpdatePreviewModal, applyUpdates, openUpdatePreview, updateInActiveNote, updateInVault };
