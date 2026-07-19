'use strict';

// The materialize preview decides what gets written into the reader's notes, so the branch
// worth pinning is the ambiguous one: pick an alternative for a word and every occurrence of
// it must be relinked to that target — through the plugin's own field name, not a shared
// guess at one.

const { describe, it, assert } = require('../harness');
const { createProseModals } = require('../../prose/modals');

// A DOM just rich enough to open the dialog and click things in it.
function fakeEl() {
  const el = {
    children: [],
    text: '',
    value: '',
    onclick: null,
    onchange: null,
    classes: [],
    setText(v) { this.text = String(v); },
    addClass(c) { this.classes.push(c); },
    setAttribute() {},
    focus() {},
    empty() { this.children.length = 0; },
    addEventListener() {},
  };
  const make = (o) => {
    const child = fakeEl();
    if (o && typeof o === 'object') {
      if (o.text != null) child.text = String(o.text);
      if (o.cls) child.classes.push(o.cls);
      if (o.value != null) child.value = o.value;
    }
    el.children.push(child);
    return child;
  };
  el.createEl = (tag, o) => { const c = make(o); c.tag = tag; return c; };
  el.createDiv = (o) => make(o);
  el.createSpan = (o) => make(o);
  return el;
}

// Every element in the tree, so a test can find the select and the buttons.
const flatten = (el) => [el, ...el.children.flatMap(flatten)];

const openModal = (Modal, files, plugin, onApply) => {
  const m = new Modal({}, files, plugin, onApply);
  m.contentEl = fakeEl();
  m.close = () => {};
  m.onOpen();
  return m;
};

// A plugin that records what apply hands it rather than touching a vault.
const fakePlugin = () => ({
  applied: null,
  wikiLink: (target, display) => `[[${target}|${display}]]`,
  applyLinks(original, chosen) { this.applied = chosen; return { newText: original }; },
  unlinkLinks: (original, matches) => ({ newText: original, count: matches.length }),
});

// Heading-shaped and glossary-shaped configs, to prove the field name really travels.
const HEADING = { cls: 'heading', targetOf: (m) => m.linktext, withTarget: (m, linktext) => ({ ...m, linktext }) };
const GLOSSARY = { cls: 'glossary', targetOf: (m) => m.canonical, withTarget: (m, canonical) => ({ ...m, canonical }) };

const ambiguousFile = (target, field) => ({
  file: { path: 'Note.md' },
  original: 'spawn here and spawn there',
  matches: [
    { start: 0, end: 5, display: 'spawn', alts: ['Other#Spawn'], [field]: target },
    { start: 15, end: 20, display: 'spawn', alts: ['Other#Spawn'], [field]: target },
  ],
});

describe('materialize preview', () => {
  it('links an unambiguous match to its own target', async () => {
    const { MaterializePreviewModal } = createProseModals(HEADING);
    const plugin = fakePlugin();
    let results = null;
    const m = openModal(MaterializePreviewModal, [{
      file: { path: 'Note.md' },
      original: 'spawn here',
      matches: [{ start: 0, end: 5, display: 'spawn', linktext: 'Guide#Spawn' }],
    }], plugin, (r) => { results = r; });

    const apply = flatten(m.contentEl).find((e) => e.tag === 'button' && e.classes.includes('mod-cta'));
    await apply.onclick();
    assert.strictEqual(plugin.applied.length, 1);
    assert.strictEqual(plugin.applied[0].linktext, 'Guide#Spawn');
    assert.strictEqual(results[0].count, 1);
  });

  it('relinks every occurrence when the reader resolves the word', async () => {
    const { MaterializePreviewModal } = createProseModals(HEADING);
    const plugin = fakePlugin();
    const m = openModal(MaterializePreviewModal, [ambiguousFile('Guide#Spawn', 'linktext')], plugin, () => {});

    const select = flatten(m.contentEl).find((e) => e.tag === 'select');
    assert.ok(select, 'no resolution control for an ambiguous word');
    select.value = 'Other#Spawn';
    select.onchange();

    const apply = flatten(m.contentEl).find((e) => e.tag === 'button' && e.classes.includes('mod-cta'));
    await apply.onclick();
    assert.deepStrictEqual(plugin.applied.map((x) => x.linktext), ['Other#Spawn', 'Other#Spawn']);
  });

  it('carries the choice in the field the plugin names, not a shared one', async () => {
    // The heading linker calls it linktext and the glossary canonical; writing the wrong one
    // produces a link that looks fine and points nowhere.
    const { MaterializePreviewModal } = createProseModals(GLOSSARY);
    const plugin = fakePlugin();
    const m = openModal(MaterializePreviewModal, [ambiguousFile('Spawn', 'canonical')], plugin, () => {});

    const select = flatten(m.contentEl).find((e) => e.tag === 'select');
    select.value = 'Other#Spawn';
    select.onchange();
    const apply = flatten(m.contentEl).find((e) => e.tag === 'button' && e.classes.includes('mod-cta'));
    await apply.onclick();
    assert.deepStrictEqual(plugin.applied.map((x) => x.canonical), ['Other#Spawn', 'Other#Spawn']);
    assert.ok(plugin.applied.every((x) => x.linktext === undefined), 'wrote the sibling’s field name');
  });

  it('leaves a skipped word as plain text', async () => {
    const { MaterializePreviewModal, SKIP } = Object.assign(createProseModals(HEADING), { SKIP: ' skip' });
    const plugin = fakePlugin();
    const m = openModal(MaterializePreviewModal, [ambiguousFile('Guide#Spawn', 'linktext')], plugin, () => {});

    const select = flatten(m.contentEl).find((e) => e.tag === 'select');
    select.value = SKIP;
    select.onchange();
    const apply = flatten(m.contentEl).find((e) => e.tag === 'button' && e.classes.includes('mod-cta'));
    await apply.onclick();
    assert.deepStrictEqual(plugin.applied, [], 'a skipped word still got linked');
  });
});

describe('choose-term dialog', () => {
  it('opens a peer’s candidate through the peer, and ours through the caller', async () => {
    const { ChooseTermModal } = createProseModals(HEADING);
    let chose = null;
    let peerOpened = false;
    const m = new ChooseTermModal({}, {
      terms: ['Guide#Spawn', { label: 'Spawning', source: 'Glossary Linker', describe: () => ({ title: 'Spawning', note: 'Term' }), open: () => { peerOpened = true; } }],
      onChoose: (t) => { chose = t; },
      plugin: { api: { linker: { describe: (target) => ({ title: target.split('#').pop(), note: 'Heading' }) } } },
    });
    m.contentEl = fakeEl();
    m.close = () => {};
    m.onOpen();

    const items = flatten(m.contentEl).filter((e) => e.classes.includes('heading-choose-item'));
    // Ours is described by us, the peer's by the peer — a list of one word's meanings has to
    // say which is which, and neither side may caption the other's row. The caption is the
    // kind and where it lives; the plugin's name is machinery the reader is not choosing from.
    assert.deepStrictEqual(items.map((e) => e.children.map((c) => c.text)),
      [['Spawn', 'Heading'], ['Spawning', 'Term']]);

    await items[0].onclick();
    assert.strictEqual(chose, 'Guide#Spawn');
    assert.strictEqual(peerOpened, false);

    await items[1].onclick();
    assert.strictEqual(peerOpened, true, 'a peer’s candidate was opened by us instead of by it');
  });
});

describe('a row nobody can describe', () => {
  it('shows the bare label rather than naming the plugin', () => {
    // The reader is picking between meanings, not between plugins. A peer too old to describe
    // itself contributes a plain row; it must not turn into "Heading Linker".
    const { captionFor } = require('../../prose/choices');
    assert.deepStrictEqual(
      captionFor(null, { label: 'Spawning', source: 'Heading Linker' }),
      { title: 'Spawning', note: '' });
  });
});

// The picker and the hover list are two surfaces onto one question. They drifted once — one
// wiring passed the touched word to the plugin and the other dropped it, so the same row was
// captioned differently depending on whether the reader hovered or clicked.
describe('one caption, whichever surface asks', () => {
  const { captionFor } = require('../../prose/choices');
  const plugin = {
    api: {
      linker: {
        describe: (target, display) => ({
          title: target,
          note: display && display !== target ? `Term · via alias “${display}”` : 'Term',
        }),
      },
    },
  };

  it('hands the touched word to the owner every time it is asked', () => {
    assert.deepStrictEqual(captionFor(plugin, 'B', 'A'), { title: 'B', note: 'Term · via alias “A”' });
    assert.deepStrictEqual(captionFor(plugin, 'B', 'B'), { title: 'B', note: 'Term' });
  });

  it('asks a peer with the same word it asks us', () => {
    const seen = [];
    captionFor(plugin, { label: 'B', describe: (display) => { seen.push(display); return { title: 'B', note: 'Term' }; } }, 'A');
    assert.deepStrictEqual(seen, ['A'], 'the peer was asked without the word the reader touched');
  });
});
