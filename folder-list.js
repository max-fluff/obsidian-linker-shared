'use strict';

// Which foldable lists the reader has opened, per settings tab. Off the tab object because
// every redraw builds a new widget, and the fold has to outlive it.
const openLists = new WeakMap();

// A string-set editor: a header row, one indented row per entry, and an input with an add
// button below. Storage stays a "\n"-joined string, so this is a pure UI swap — no migration.
// Past the labels and the suggest source: `editable` makes each row an input, `fold`
// ({ owner, key }) puts the list behind a chevron that remembers it, `maxRows` is where it
// starts scrolling rather than growing.
function renderFolderList(containerEl, opts) {
  // Resolved per call, not at load: a test swaps in a recording Setting, and this module is
  // loaded long before it does.
  const { Setting, setIcon } = require('obsidian');
  const cls = opts.cls;
  const norm = opts.normalize || ((x) => x.trim());
  const read = () => (opts.get() || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const fold = opts.fold;
  const maxRows = opts.maxRows || 10;

  const opened = () => {
    let set = openLists.get(fold.owner);
    if (!set) { set = new Set(); openLists.set(fold.owner, set); }
    return set;
  };
  const isOpen = () => !fold || opened().has(fold.key);

  const host = containerEl.createDiv({ cls: `${cls}-list` });
  // Set when a commit came from the add box, so the redraw hands focus back to it and the
  // reader can type the next entry without reaching for the mouse.
  let refocus = false;

  const commit = async (next) => {
    const seen = new Set();
    const clean = [];
    for (const p of next) {
      const n = norm(p);
      if (n && !seen.has(n)) { seen.add(n); clean.push(n); }
    }
    await opts.set(clean.join('\n'));
    draw();
  };

  const drawRow = (rowsEl, entry, i) => {
    if (!opts.editable) {
      const row = new Setting(rowsEl).setName(entry);
      row.settingEl.addClass(`${cls}-folder-row`);
      row.addExtraButton((b) => b.setIcon('x').setTooltip(opts.removeLabel || '')
        .onClick(() => { const next = read(); next.splice(i, 1); commit(next); }));
      return;
    }
    const row = rowsEl.createDiv({ cls: `${cls}-folder-row ${cls}-list-row` });
    const box = row.createEl('input', { type: 'text', cls: `${cls}-list-input` });
    box.value = entry;
    // On change, not on every keystroke: a commit redraws the list, which would take the
    // cursor out of the box mid-word.
    box.addEventListener('change', () => { const next = read(); next[i] = box.value; commit(next); });
    const del = row.createEl('button', { cls: `${cls}-list-del`, attr: { 'aria-label': opts.removeLabel || '' } });
    setIcon(del, 'x');
    del.addEventListener('click', () => { const next = read(); next.splice(i, 1); commit(next); });
  };

  const draw = () => {
    host.empty();
    const entries = read();
    const open = isOpen();
    const head = new Setting(host)
      .setName(entries.length ? `${opts.name} (${entries.length})` : opts.name)
      .setDesc(opts.desc);
    if (fold) {
      head.addExtraButton((b) => b.setIcon(open ? 'chevron-up' : 'chevron-down')
        .setTooltip((open ? opts.hideLabel : opts.showLabel) || '')
        .onClick(() => { const s = opened(); if (open) s.delete(fold.key); else s.add(fold.key); draw(); }));
      if (!open) return;
    }

    const rowsEl = host.createDiv({ cls: `${cls}-folder-rows` });
    if (entries.length > maxRows) rowsEl.addClass(`${cls}-list-scroll`);
    entries.forEach((entry, i) => drawRow(rowsEl, entry, i));

    const addEl = host.createDiv({ cls: `${cls}-folder-add` });
    const input = addEl.createEl('input', { type: 'text', cls: `${cls}-folder-input`, attr: { placeholder: opts.placeholder || '' } });
    const addBtn = addEl.createEl('button', { cls: `${cls}-folder-addbtn`, attr: { 'aria-label': opts.addLabel || '' } });
    setIcon(addBtn, 'plus');

    const add = (raw) => {
      // A blank entry just clears the box; the suggest may already have added and
      // emptied it, so a trailing Enter is a harmless no-op.
      input.value = '';
      if (!norm(raw)) { input.focus(); return; }
      refocus = true;
      commit([...read(), raw]);
    };

    if (opts.attachSuggest) opts.attachSuggest(input, add);
    addBtn.addEventListener('click', () => add(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); } });
    if (refocus) { refocus = false; input.focus(); }
  };

  draw();
}

module.exports = { renderFolderList };
