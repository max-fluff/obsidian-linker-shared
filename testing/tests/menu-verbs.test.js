'use strict';

// Declaring menu items and letting the builder decide the layout.

const { describe, it, assert } = require('../harness');
const { buildMenu, MenuBuilder } = require('../../menu-verbs');

// A menu recorded as the tree it really is: a submenu is one entry holding its children,
// wherever those children were added from. Flattening by insertion order instead would show
// a later item as a sibling of the group rather than inside it.
function fakeMenu() {
  const make = (into) => ({
    addItem(cb) {
      const entry = { title: '' };
      const item = {
        setTitle(v) { entry.title = String(v); return item; },
        setIcon() { return item; },
        setDisabled() { return item; },
        onClick(fn) { entry.click = fn; return item; },
        setSubmenu() { entry.children = []; return make(entry.children); },
      };
      into.push(entry);
      cb(item);
      return this;
    },
    addSeparator() { into.push({ separator: true }); return this; },
  });
  const tree = [];
  const menu = make(tree);
  const walk = (nodes, prefix) => nodes.flatMap((e) => {
    if (e.separator) return [];
    if (e.children) return walk(e.children, `${prefix}${e.title} > `);
    return [`${prefix}${e.title}`];
  });
  menu.titles = () => walk(tree, '');
  return menu;
}

const pluginWith = (...peers) => ({
  app: { plugins: { plugins: Object.fromEntries(peers.map((p) => [p.id, { api: { linker: p } }])) } },
  api: { linker: { apiVersion: 1, id: 'me', precedence: 10 } },
});

const offering = (id) => ({ apiVersion: 1, id, precedence: 5, offers: () => true });
const silent = (id) => ({ apiVersion: 1, id, precedence: 5, offers: () => false });

// A verb's label comes from its own pair's locale set, and these tests run inside all four
// plugins — so assert on the shape of the menu, never on the wording.
const leaf = (title) => title.split(' > ').pop();
const group = (title) => (title.includes(' > ') ? title.split(' > ')[0] : null);

describe('menu builder', () => {
  it('leaves a lone tagged item flat', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(), menu, (m) => {
      m.tagged('exclude', { value: 'spawn' }, (item, grouped) => item.setTitle(grouped ? 'short' : 'full'));
    });
    assert.deepStrictEqual(menu.titles(), ['full']);
  });

  it('groups once a second item shares the verb', () => {
    // The point of declaring rather than writing: nothing counted the items by hand.
    const menu = fakeMenu();
    buildMenu(pluginWith(), menu, (m) => {
      m.tagged('exclude', { value: 'spawn' }, (item) => item.setTitle('words'));
      m.tagged('exclude', { value: 'spawn' }, (item) => item.setTitle('terms'));
    });
    const titles = menu.titles();
    assert.deepStrictEqual(titles.map(leaf), ['words', 'terms']);
    assert.ok(group(titles[0]), 'not grouped');
    assert.strictEqual(group(titles[0]), group(titles[1]), 'two groups instead of one');
  });

  it('groups a lone item when a sibling offers the same verb', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(offering('peer')), menu, (m) => {
      m.tagged('exclude', { value: 'spawn' }, (item, grouped) => item.setTitle(grouped ? 'short' : 'full'));
    });
    const titles = menu.titles();
    assert.deepStrictEqual(titles.map(leaf), ['short']);
    assert.ok(group(titles[0]), 'not grouped');
  });

  it('stays flat when the sibling declines', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(silent('peer')), menu, (m) => {
      m.tagged('exclude', { value: 'spawn' }, (item, grouped) => item.setTitle(grouped ? 'short' : 'full'));
    });
    assert.deepStrictEqual(menu.titles(), ['full']);
  });

  it('keeps declaration order, putting the group where its first item was', () => {
    // The sigil menu declares its verbs before the link actions; replaying tagged items last
    // would quietly reorder it. Asserted on shape, not wording: the verb labels live in the
    // sigil locale set and this test also runs inside the prose plugins.
    const menu = fakeMenu();
    buildMenu(pluginWith(offering('peer')), menu, (m) => {
      m.tagged('convert', {}, (item) => item.setTitle('Code'));
      m.tagged('open', {}, (item) => item.setTitle('Code'));
      m.addItem((item) => item.setTitle('Copy link'));
    });
    const titles = menu.titles();
    assert.strictEqual(titles.length, 3);
    assert.ok(titles[0].endsWith(' > Code'), titles[0]);
    assert.ok(titles[1].endsWith(' > Code'), titles[1]);
    assert.notStrictEqual(titles[0], titles[1], 'both verbs collapsed into one group');
    assert.strictEqual(titles[2], 'Copy link', 'the untagged item moved');
  });

  it('collects items of one verb into a single submenu even when they are apart', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(), menu, (m) => {
      m.tagged('exclude', { value: 'spawn' }, (item) => item.setTitle('words'));
      m.addItem((item) => item.setTitle('Unlink'));
      m.tagged('exclude', { value: 'spawn' }, (item) => item.setTitle('terms'));
    });
    const titles = menu.titles();
    assert.deepStrictEqual(titles.map(leaf), ['words', 'terms', 'Unlink'], 'the group did not hold both');
    assert.strictEqual(group(titles[0]), group(titles[1]), 'two groups instead of one');
    assert.strictEqual(group(titles[2]), null, 'the untagged item was swallowed by the group');
  });

  it('writes what was declared before an early return', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(), menu, (m) => {
      m.addItem((item) => item.setTitle('Unlink'));
      return;
    });
    assert.deepStrictEqual(menu.titles(), ['Unlink']);
  });

  it('leaves an empty section out of the menu entirely', () => {
    const menu = fakeMenu();
    buildMenu(pluginWith(), menu, (m) => { m.section('Link “x”', 'link'); });
    assert.deepStrictEqual(menu.titles(), []);
  });

  it('refuses a verb it does not know', () => {
    const b = new MenuBuilder(pluginWith(), fakeMenu());
    assert.throws(() => b.tagged('teleport', {}, () => {}), /unknown menu verb/);
  });
});
