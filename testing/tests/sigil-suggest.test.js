'use strict';

// The autocomplete both sigil linkers run. The two things worth pinning are that the
// per-plugin filter is built once per keystroke rather than once per index entry (the index
// is long), and that a row shows the kind the plugin defines rather than a shared guess.

const { describe, it, assert } = require('../harness');
const { createSigilSuggest } = require('../../deeplink/suggest');

// EditorSuggest is a stub class, so the suggester is driven by calling its methods directly.
const make = (config, plugin) => {
  const Suggest = createSigilSuggest(config);
  const s = Object.create(Suggest.prototype);
  s.plugin = plugin;
  return s;
};

const fakePlugin = (entries, settings = {}) => ({
  index: entries,
  settings: Object.assign({ trigger: '@@', minChars: 0, maxResults: 10 }, settings),
  parseQuery: (q) => ({ name: q }),
  entryPassesFilter: (e, f) => !f.name || e.name.includes(f.name),
});

const rowOf = () => {
  const spans = [];
  return { el: { addClass: () => {}, createSpan: (o) => spans.push(o) }, spans };
};

describe('sigil suggest', () => {
  it('shows every indexed entry when nothing is filtered out', () => {
    const s = make({ cls: 'x', kindText: (e) => e.kind }, fakePlugin([{ name: 'Player', kind: 'class', path: 'a.cs' }]));
    assert.deepStrictEqual(s.getSuggestions({ query: '' }).map((e) => e.name), ['Player']);
  });

  it('drops what the plugin says it may not offer', () => {
    const plugin = fakePlugin([
      { name: 'Player', kind: 'class', lang: 'cs', path: 'a.cs' },
      { name: 'Ghost', kind: 'field', lang: 'cs', path: 'a.cs' },
    ]);
    const s = make({
      cls: 'x',
      kindText: (e) => e.kind,
      prepare: () => (e) => e.kind !== 'field',
    }, plugin);
    assert.deepStrictEqual(s.getSuggestions({ query: '' }).map((e) => e.name), ['Player']);
  });

  it('builds that filter once per keystroke, not once per entry', () => {
    // The index runs to thousands of entries; rebuilding a Set inside the loop is the kind
    // of regression that never shows up in a small vault.
    let built = 0;
    const plugin = fakePlugin(Array.from({ length: 50 }, (_, i) => ({ name: 'e' + i, kind: 'class', path: 'a' })));
    const s = make({
      cls: 'x',
      kindText: (e) => e.kind,
      prepare: () => { built++; return () => true; },
    }, plugin);
    s.getSuggestions({ query: '' });
    assert.strictEqual(built, 1);
  });

  it('shows the kind the plugin defines, not a shared guess', () => {
    const s = make({ cls: 'ref', kindText: (e) => (e.kind === 'section' ? 'p.' + e.page : e.lang) },
      fakePlugin([]));
    const row = rowOf();
    s.renderSuggestion({ name: 'Intro', kind: 'section', page: 3, path: 'Spec.pdf' }, row.el);
    assert.deepStrictEqual(row.spans.map((x) => x.text), ['Intro', 'p.3', 'Spec.pdf']);
    assert.deepStrictEqual(row.spans.map((x) => x.cls), ['ref-name', 'ref-kind', 'ref-path']);
  });

  it('stops at maxResults', () => {
    const plugin = fakePlugin(Array.from({ length: 20 }, (_, i) => ({ name: 'e' + i, kind: 'class', path: 'a' })), { maxResults: 3 });
    const s = make({ cls: 'x', kindText: (e) => e.kind }, plugin);
    assert.strictEqual(s.getSuggestions({ query: '' }).length, 3);
  });
});
