'use strict';

// The three dialogs both prose linkers show: the materialize preview, its inverse, and the
// collision picker.
//
// These are the surface that edits the reader's notes, so the two plugins must agree about
// what "apply" writes. They differ only in what a match calls its target — a heading's
// `linktext`, a term's `canonical`.
//
// createProseModals(config):
//   cls          class prefix for the dialog markup
//   targetOf     (match) -> what this match links to
//   withTarget   (match, target) -> the match relinked to a different target, used when the
//                reader resolves an ambiguous word to one of its alternatives

const { Modal } = require('obsidian');
const { t } = require('../i18n');
const { inTableCell } = require('../markdown');

// The "leave it as plain text" option, kept distinct from any real target.
const SKIP = ' skip';

// How many rows a file's preview shows before it is summarised.
const MAX_ROWS = 50;

function createProseModals(config) {
  const { cls, targetOf, withTarget } = config;

  // files: [{ file, original, matches: [{ start, end, display, alts, ... }], label? }].
  // Ambiguous matches (alts present) are resolved once per surface word in a top panel — the
  // choice applies to every occurrence everywhere. plugin supplies applyLinks / wikiLink;
  // onApply receives [{ file, label, original, newText, count }].
  class MaterializePreviewModal extends Modal {
    constructor(app, files, plugin, onApply) {
      super(app);
      this.files = files;
      this.plugin = plugin;
      this.onApply = onApply;
      // One resolution group per ambiguous surface word (case-insensitive).
      this.groups = new Map();
      for (const fc of files) {
        for (const m of fc.matches) {
          if (!(m.alts && m.alts.length)) continue;
          const key = m.display.toLowerCase();
          if (!this.groups.has(key)) {
            this.groups.set(key, { display: m.display, candidates: [targetOf(m), ...m.alts], choice: targetOf(m), spans: [] });
          }
        }
      }
    }

    onOpen() {
      const { contentEl } = this;
      contentEl.createEl('h3', { text: t('modal.materialize.title') });
      const total = this.files.reduce((n, f) => n + f.matches.length, 0);
      contentEl.createEl('p', { text: t('modal.materialize.summary', { files: this.files.length, replacements: total }) });

      if (this.groups.size) {
        contentEl.createEl('p', { cls: `${cls}-section-desc`, text: t('modal.materialize.ambiguous', { n: this.groups.size }) });
        const panel = contentEl.createDiv({ cls: `${cls}-resolve-panel` });
        for (const g of this.groups.values()) {
          const row = panel.createDiv({ cls: `${cls}-resolve-row` });
          row.createSpan({ cls: `${cls}-resolve-word`, text: g.display });
          row.createSpan({ text: '→' });
          const sel = row.createEl('select', { cls: `${cls}-term-select` });
          for (const term of g.candidates) sel.createEl('option', { text: term, value: term });
          sel.createEl('option', { text: t('modal.skipOption'), value: SKIP });
          sel.value = g.choice;
          sel.onchange = () => { g.choice = sel.value === SKIP ? null : sel.value; g.spans.forEach((upd) => upd()); };
        }
      }

      this.files.forEach((fc) => {
        contentEl.createDiv({ cls: `${cls}-preview-file`, text: fc.file ? fc.file.path : (fc.label || t('label.selection')) });
        const table = contentEl.createEl('table', { cls: `${cls}-preview-table` });
        fc.matches.slice(0, MAX_ROWS).forEach((m) => {
          const inTable = inTableCell(fc.original, m.start);
          const tr = table.createEl('tr');
          tr.createEl('td', { text: m.display });
          tr.createEl('td', { text: '→' });
          const after = tr.createEl('td');
          if (m.alts && m.alts.length) {
            tr.addClass(`${cls}-ambiguous-row`);
            const g = this.groups.get(m.display.toLowerCase());
            const render = () => after.setText(g.choice == null ? t('modal.leftAsText') : this.plugin.wikiLink(g.choice, m.display, inTable));
            g.spans.push(render);
            render();
          } else {
            after.setText(this.plugin.wikiLink(targetOf(m), m.display, inTable));
          }
        });
        if (fc.matches.length > MAX_ROWS) {
          contentEl.createEl('div', { cls: `${cls}-preview-empty`, text: t('modal.andMore', { n: fc.matches.length - MAX_ROWS }) });
        }
      });

      const buttons = contentEl.createDiv({ cls: `${cls}-preview-buttons` });
      const apply = buttons.createEl('button', { text: t('btn.apply'), cls: 'mod-cta' });
      apply.onclick = async () => {
        const results = this.files.map((fc) => {
          const chosen = [];
          for (const m of fc.matches) {
            if (m.alts && m.alts.length) {
              const g = this.groups.get(m.display.toLowerCase());
              if (!g || g.choice == null) continue; // skipped — leave as plain text
              chosen.push(g.choice === targetOf(m) ? m : withTarget(m, g.choice));
            } else {
              chosen.push(m);
            }
          }
          const { newText } = this.plugin.applyLinks(fc.original, chosen);
          return { file: fc.file, label: fc.label, original: fc.original, newText, count: chosen.length };
        });
        await this.onApply(results);
        this.close();
      };
      buttons.createEl('button', { text: t('btn.cancel') }).onclick = () => this.close();
    }

    onClose() { this.contentEl.empty(); }
  }

  // The inverse: each row shows the link source → the plain text it becomes. plugin supplies
  // unlinkLinks; onApply receives [{ file, label, original, newText, count }].
  class UnlinkPreviewModal extends Modal {
    constructor(app, files, plugin, onApply) {
      super(app);
      this.files = files;
      this.plugin = plugin;
      this.onApply = onApply;
    }

    onOpen() {
      const { contentEl } = this;
      contentEl.createEl('h3', { text: t('modal.unlink.title') });
      const total = this.files.reduce((n, f) => n + f.matches.length, 0);
      contentEl.createEl('p', { text: t('modal.unlink.summary', { files: this.files.length, links: total }) });

      this.files.forEach((fc) => {
        contentEl.createDiv({ cls: `${cls}-preview-file`, text: fc.file ? fc.file.path : (fc.label || t('label.selection')) });
        const table = contentEl.createEl('table', { cls: `${cls}-preview-table` });
        fc.matches.slice(0, MAX_ROWS).forEach((m) => {
          const tr = table.createEl('tr');
          tr.createEl('td', { text: m.source });
          tr.createEl('td', { text: '→' });
          tr.createEl('td', { text: m.display });
        });
        if (fc.matches.length > MAX_ROWS) {
          contentEl.createEl('div', { cls: `${cls}-preview-empty`, text: t('modal.andMore', { n: fc.matches.length - MAX_ROWS }) });
        }
      });

      const buttons = contentEl.createDiv({ cls: `${cls}-preview-buttons` });
      const apply = buttons.createEl('button', { text: t('btn.apply'), cls: 'mod-cta' });
      apply.onclick = async () => {
        const results = this.files.map((fc) => {
          const { newText, count } = this.plugin.unlinkLinks(fc.original, fc.matches);
          return { file: fc.file, label: fc.label, original: fc.original, newText, count };
        });
        await this.onApply(results);
        this.close();
      };
      buttons.createEl('button', { text: t('btn.cancel') }).onclick = () => this.close();
    }

    onClose() { this.contentEl.empty(); }
  }

  // Pick one target from several. opts: { title, terms, onChoose }.
  class ChooseTermModal extends Modal {
    constructor(app, opts) {
      super(app);
      this.opts = opts;
    }

    onOpen() {
      const { contentEl } = this;
      contentEl.createEl('h3', { text: this.opts.title || t('modal.choose.title') });
      contentEl.createEl('p', { text: t('modal.choose.body') });
      const list = contentEl.createDiv({ cls: `${cls}-choose-list` });
      // A term is either one of ours (a plain target, opened by the caller) or one another
      // linker stood down on, which carries its own label and knows how to open itself. The
      // list makes no distinction: from the reader's side it is one word with several
      // meanings, and which plugin answers for each is machinery they aren't choosing between.
      for (const term of this.opts.terms) {
        const foreign = term && typeof term === 'object';
        const b = list.createEl('button', { cls: `${cls}-choose-item`, text: foreign ? term.label : term });
        b.onclick = async () => {
          this.close();
          if (foreign) term.open();
          else await this.opts.onChoose(term);
        };
      }
      contentEl.createDiv({ cls: `${cls}-preview-buttons` })
        .createEl('button', { text: t('btn.cancel') }).onclick = () => this.close();
    }

    onClose() { this.contentEl.empty(); }
  }

  return { MaterializePreviewModal, UnlinkPreviewModal, ChooseTermModal };
}

module.exports = { createProseModals, SKIP };
