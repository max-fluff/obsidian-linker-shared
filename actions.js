'use strict';

// One declaration, two surfaces: the context menu and the command palette. Both writers read
// the same list, so an action cannot exist on one and be missing from the other.
//
// An action declares:
//   id        stable command id
//   name      palette wording — a locale key, and static, since commands are registered once
//   title     menu wording — (ctx, grouped) => string, free to name the object it acts on
//   surface   'editor' or 'file': what `resolve` is handed
//   resolve   (plugin, editor|file) => ctx, or null where the action does not apply
//   run       (plugin, ctx) => void
//   icon      optional, menu only
//   verb      optional menu verb (see menu-verbs.js); `value` names the object it groups under
//   section   optional locale key: actions sharing one go under a submenu of this plugin's own
//   inMenu    optional (plugin) => boolean for the settings that decide what the menu offers.
//             The menu only: a setting about the menu says nothing about the palette, where
//             the reader went looking for the action by name.

const { t } = require('./i18n');

const drawn = (plugin, a) => (typeof a.inMenu !== 'function' || !!a.inMenu(plugin));

function check(a) {
  if (!a.id || !a.name || !a.title || !a.run || !a.resolve) {
    throw new Error('menu action needs id, name, title, resolve and run: ' + (a.id || '(no id)'));
  }
  return a;
}

// The palette twin of every action. Called once, from onload. A file action reads the active
// note rather than a right-clicked one — the palette has no other object to offer.
function registerActions(plugin, actions) {
  for (const a of actions.map(check)) {
    const act = (checking, target) => {
      if (!target) return false;
      const ctx = a.resolve(plugin, target);
      if (!ctx) return false;
      if (!checking) a.run(plugin, ctx);
      return true;
    };
    if (a.surface === 'editor') {
      plugin.addCommand({ id: a.id, name: t(a.name), editorCheckCallback: (checking, editor) => act(checking, editor) });
    } else {
      plugin.addCommand({ id: a.id, name: t(a.name), checkCallback: (checking) => act(checking, plugin.app.workspace.getActiveFile()) });
    }
  }
}

// The same actions written into a menu the builder is filling. `target` is the editor or the
// file the menu was raised on.
function menuActions(plugin, menu, actions, surface, target) {
  const sections = new Map();
  for (const a of actions.map(check)) {
    if (a.surface !== surface || !drawn(plugin, a)) continue;
    const ctx = a.resolve(plugin, target);
    if (!ctx) continue;
    // A verb group is shared with the siblings and names the object itself, so its lines
    // carry no icon; a section of this plugin's own is a set of its own actions, and each
    // keeps the icon that tells them apart.
    const write = (i, grouped) => i
      .setTitle(a.title(ctx, grouped))
      .setIcon(grouped && a.verb ? null : (a.icon || null))
      .onClick(() => a.run(plugin, ctx));
    // A section is built on its first item, so one that resolves nowhere leaves no trace.
    // Keyed by the label, not the declaration, so a section that names its object gathers
    // every action naming the same one.
    if (a.section && menu.section) {
      const label = typeof a.section === 'function' ? a.section(ctx) : t(a.section);
      if (!sections.has(label)) sections.set(label, menu.section(label, a.icon));
      sections.get(label).addItem((i) => write(i, true));
    } else if (a.verb) {
      menu.tagged(a.verb, { value: a.value ? a.value(ctx) : undefined }, write);
    } else {
      menu.addItem((i) => write(i, false));
    }
  }
}

// A reading of what the cursor sits in, computed once and shared by every action that asks.
// Both writers go through the whole list — a menu build resolves all of them, and the palette
// checks every command each time it opens — so without this the line is scanned once per
// action. `stamp` must move whenever the reading would: the index version covers the terms
// and the exclusion lists, both of which a rebuild bumps.
function cursorReader(compute, stamp = (plugin) => plugin.indexVersion) {
  let last = { editor: null, key: null, value: null };
  return (plugin, editor) => {
    if (!editor) return null;
    const head = editor.getCursor('head');
    const sel = editor.getSelection ? editor.getSelection() : '';
    const key = `${head.line}:${head.ch}:${editor.getLine(head.line)}:${sel}:${stamp(plugin)}`;
    if (last.editor !== editor || last.key !== key) last = { editor, key, value: compute(plugin, editor) };
    return last.value;
  };
}

module.exports = { registerActions, menuActions, cursorReader };
