'use strict';

// A facet is one projection used three ways: to restrict, to match, and to pin. These pin the
// grammar that follows from a facet's value set — enumerable ones are typed as the value,
// unbounded ones after their own token.

const { describe, it, assert } = require('../harness');
const { VALUE, TOKEN, parseQuery, passes, matchText, bindingFrom, entriesFor } = require('../../facets');

const KINDS = new Set(['file', 'section']);
const EXTS = new Set(['pdf', 'docx']);

const FACETS = [
  { name: 'kind', typed: VALUE, resolve: (t) => (KINDS.has(t) ? t : null), of: (e) => e.kind },
  { name: 'ext', typed: VALUE, resolve: (t) => (EXTS.has(t) ? t : null), of: (e) => e.lang },
  { name: 'sec', typed: TOKEN, anchor: 'sec', of: (e) => (e.kind === 'section' ? e.name : '') },
  { name: 'cite', typed: TOKEN, anchor: 'cite', of: (e) => e.cite || '' },
];

const entry = (over) => Object.assign({ name: 'Methods', kind: 'section', lang: 'pdf', cite: '' }, over);

describe('parseQuery', () => {
  it('reads a value facet off its own value', () => {
    assert.deepStrictEqual(parseQuery('pdf:intro', FACETS), { values: { ext: 'pdf' }, field: null, name: 'intro' });
  });

  it('reads several value facets in a row', () => {
    const q = parseQuery('pdf:section:intro', FACETS);
    assert.deepStrictEqual(q.values, { ext: 'pdf', kind: 'section' });
    assert.strictEqual(q.name, 'intro');
  });

  it('stops at the first part it does not recognise', () => {
    assert.deepStrictEqual(parseQuery('nope:intro', FACETS), { values: {}, field: null, name: 'nope:intro' });
  });

  it('takes the rest as the value of a token facet', () => {
    const q = parseQuery('cite:knuth1984', FACETS);
    assert.strictEqual(q.field, 'cite');
    assert.strictEqual(q.name, 'knuth1984');
  });

  it('lets a value facet precede a token facet', () => {
    const q = parseQuery('pdf:cite:knuth1984', FACETS);
    assert.deepStrictEqual(q.values, { ext: 'pdf' });
    assert.strictEqual(q.field, 'cite');
    assert.strictEqual(q.name, 'knuth1984');
  });

  // A citation key may hold a colon, and the token facet has already said where the value
  // starts, so nothing after it is read as another prefix.
  it('keeps colons inside a token facet value', () => {
    assert.strictEqual(parseQuery('cite:a:b', FACETS).name, 'a:b');
  });
});

describe('passes', () => {
  it('keeps only entries whose value matches a restriction', () => {
    const q = parseQuery('docx:', FACETS);
    assert.strictEqual(passes(entry({ lang: 'docx' }), q, FACETS), true);
    assert.strictEqual(passes(entry({ lang: 'pdf' }), q, FACETS), false);
  });

  // Naming a token facet is itself a restriction: asking to match section names cannot mean
  // offering a file that has none.
  it('drops an entry with no value for the facet being matched', () => {
    const q = parseQuery('sec:', FACETS);
    assert.strictEqual(passes(entry({ kind: 'section' }), q, FACETS), true);
    assert.strictEqual(passes(entry({ kind: 'file' }), q, FACETS), false);
  });

  it('keeps everything when nothing was asked', () => {
    assert.strictEqual(passes(entry({ kind: 'file' }), parseQuery('intro', FACETS), FACETS), true);
  });
});

describe('matchText', () => {
  it('matches the entry name when no facet was named', () => {
    assert.strictEqual(matchText(entry(), parseQuery('meth', FACETS), FACETS), 'Methods');
  });

  it('matches the named facet instead', () => {
    const e = entry({ name: 'Paper', kind: 'file', cite: 'knuth1984' });
    assert.strictEqual(matchText(e, parseQuery('cite:knu', FACETS), FACETS), 'knuth1984');
  });
});

// A caller that resolves a whole query — an embed naming one document — cannot look the text up
// as an entry name once a token facet has redirected what the text means.
describe('entriesFor', () => {
  const paper = entry({ name: 'Paper', kind: 'file', cite: 'knuth1984' });
  const other = entry({ name: 'knuth1984', kind: 'file', cite: '' });
  const plugin = {
    index: [paper, other],
    entriesByName: (n) => [paper, other].filter((e) => e.name === n),
  };

  it('looks a plain query up by entry name', () => {
    assert.deepStrictEqual(entriesFor(plugin, parseQuery('Paper', FACETS), FACETS), [paper]);
  });

  it('looks a token facet up by its own value, not by the entry name', () => {
    assert.deepStrictEqual(entriesFor(plugin, parseQuery('cite:knuth1984', FACETS), FACETS), [paper]);
  });

  it('gives nothing rather than everything when the facet was named with no value', () => {
    assert.deepStrictEqual(entriesFor(plugin, parseQuery('cite:', FACETS), FACETS), []);
  });
});

describe('bindingFrom', () => {
  it('pins every facet that has a value and an anchor', () => {
    const e = entry({ name: 'Methods', kind: 'section', cite: 'knuth1984' });
    assert.deepStrictEqual(bindingFrom(e, FACETS), { sec: 'Methods', cite: 'knuth1984' });
  });

  it('leaves out a facet with no value for this entry', () => {
    assert.deepStrictEqual(bindingFrom(entry({ kind: 'file' }), FACETS), {});
  });

  // A way to find an entry is not automatically a way to hold onto it: an extension is
  // already in the path, so pinning it would say nothing the link does not.
  it('ignores a facet that declares no anchor', () => {
    const only = [{ name: 'ext', typed: VALUE, resolve: (t) => t, of: (e) => e.lang }];
    assert.deepStrictEqual(bindingFrom(entry(), only), {});
  });
});
