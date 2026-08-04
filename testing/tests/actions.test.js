'use strict';

// The registry that keeps a context-menu item and its palette command from drifting apart:
// one declaration feeds both writers, so what is checked here is that both read it the same
// way — the same `resolve`, the same "does not apply here".

const { describe, it, assert } = require('../harness');
const { registerActions, menuActions } = require('../../actions');
const { buildMenu } = require('../../menu-verbs');

const fakePlugin = (overrides = {}) => ({
  commands: [],
  addCommand(cmd) { this.commands.push(cmd); },
  app: { workspace: { getActiveFile: () => ({ path: 'Note.md' }) }, plugins: { plugins: {} } },
  api: { linker: { apiVersion: 1, id: 'me', precedence: 10 } },
  settings: {},
  ...overrides,
});

const fakeMenu = () => {
  const items = [];
  const menu = {
    addItem(cb) {
      const e = { title: '', icon: null };
      cb({
        setTitle(v) { e.title = String(v); return this; },
        setIcon(v) { e.icon = v; return this; },
        setSubmenu() { return menu; },
        onClick(fn) { e.click = fn; return this; },
      });
      items.push(e);
      return this;
    },
    addSeparator() { return this; },
  };
  menu.items = items;
  return menu;
};

// Acts on the active note, and only while it is not already listed.
const listAction = (extra = {}) => ({
  id: 'add-note',
  name: 'cmd.addSource',
  surface: 'file',
  icon: 'plus-circle',
  title: (ctx) => `Add ${ctx.path}`,
  resolve: (plugin, file) => (plugin.settings.listed ? null : { path: file.path }),
  run: (plugin, ctx) => { plugin.ran = ctx.path; },
  ...extra,
});

describe('menu actions', () => {
  it('gives one declaration both a command and a menu item', () => {
    const plugin = fakePlugin();
    registerActions(plugin, [listAction()]);
    const menu = fakeMenu();
    buildMenu(plugin, menu, (b) => menuActions(plugin, b, [listAction()], 'file', { path: 'Note.md' }));

    assert.deepStrictEqual(plugin.commands.map((c) => c.id), ['add-note']);
    assert.deepStrictEqual(menu.items.map((i) => i.title), ['Add Note.md']);
  });

  it('hides both when the action does not apply here', () => {
    // One resolve answers for the palette and for the menu, so a word already excluded — or a
    // note already listed — cannot go on offering itself in one surface and not the other.
    const plugin = fakePlugin({ settings: { listed: true } });
    registerActions(plugin, [listAction()]);
    const menu = fakeMenu();
    buildMenu(plugin, menu, (b) => menuActions(plugin, b, [listAction()], 'file', { path: 'Note.md' }));

    assert.strictEqual(plugin.commands[0].checkCallback(true), false, 'the command offered itself');
    assert.deepStrictEqual(menu.items, [], 'the menu drew an item');
  });

  it('runs the same effect from either surface', async () => {
    const plugin = fakePlugin();
    registerActions(plugin, [listAction()]);
    plugin.commands[0].checkCallback(false);
    assert.strictEqual(plugin.ran, 'Note.md');

    const other = fakePlugin();
    const menu = fakeMenu();
    buildMenu(other, menu, (b) => menuActions(other, b, [listAction()], 'file', { path: 'Other.md' }));
    await menu.items[0].click();
    assert.strictEqual(other.ran, 'Other.md');
  });

  it('leaves the palette alone for an editor action with no editor', () => {
    const plugin = fakePlugin();
    registerActions(plugin, [listAction({ surface: 'editor' })]);
    assert.strictEqual(plugin.commands[0].editorCheckCallback(true, null), false);
  });

  it('refuses a declaration that would reach only one surface', () => {
    const plugin = fakePlugin();
    const { name, ...noName } = listAction();
    assert.throws(() => registerActions(plugin, [noName]), /needs id, name, title/);
  });

  it('lets a menu setting hide the item without taking the command away', () => {
    // The settings that decide what the context menu offers are about the menu. Reaching for
    // the action by name in the palette is a different act, and one of them was switched off.
    const plugin = fakePlugin({ settings: { off: true } });
    const action = listAction({ inMenu: (p) => !p.settings.off });
    registerActions(plugin, [action]);
    const menu = fakeMenu();
    buildMenu(plugin, menu, (b) => menuActions(plugin, b, [action], 'file', { path: 'Note.md' }));

    assert.deepStrictEqual(menu.items, [], 'the menu drew a hidden item');
    assert.strictEqual(plugin.commands[0].checkCallback(true), true, 'the palette lost the command');
  });
});
