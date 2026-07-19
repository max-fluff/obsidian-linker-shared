'use strict';

// Smart case. Both prose linkers index acronym-like forms as case-sensitive, so a note or
// heading called "IT" links "IT" and leaves the English word "it" alone. The rule is per
// form, not per term: an ordinary term with an acronym alias keeps both behaviours.

const { describe, it, assert } = require('../harness');
const { createMatcher, isAcronymish } = require('../../prose/matcher');

// A plugin just real enough to run a scan: one language claiming everything, exact keys.
function fakePlugin(forms, smartCase) {
  const plugin = Object.assign({}, createMatcher({
    idOf: (c) => c.id,
    selfIdOf: (c) => c.id,
    fieldsOf: (c) => ({ id: c.id }),
  }));
  plugin.settings = { smartCase, matchMode: 'exact', skipHeadings: false };
  plugin.activeLanguages = [{ match: () => true, keys: (w) => [w.toLowerCase()] }];
  plugin.keysCache = new Map();

  const byKey = new Map();
  for (const { id, text } of forms) {
    // Through formEntry, so the test indexes a form exactly as a plugin's rebuild does.
    const entry = Object.assign({ id }, plugin.formEntry(text));
    for (const k of entry.words[0].keys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(entry);
    }
  }
  plugin.index = { byKey };
  return plugin;
}

const hits = (plugin, text) => plugin.findMatches(text, null).map((m) => m.display);

describe('isAcronymish', () => {
  it('recognises the shapes smart case is meant for', () => {
    assert.strictEqual(isAcronymish('IT'), true);
    assert.strictEqual(isAcronymish('NASA'), true);
    assert.strictEqual(isAcronymish('TCP/IP'), true);
  });

  it('leaves ordinary words and single letters alone', () => {
    assert.strictEqual(isAcronymish('cell'), false);
    assert.strictEqual(isAcronymish('Cell'), false);
    assert.strictEqual(isAcronymish('Stem cell'), false);
    // One letter is not an acronym, or every capitalised sentence start would be one.
    assert.strictEqual(isAcronymish('I'), false);
    assert.strictEqual(isAcronymish('A'), false);
  });
});

describe('smart case', () => {
  it('keeps an acronym term off the ordinary word spelled the same way', () => {
    const plugin = fakePlugin([{ id: 'IT', text: 'IT' }], true);
    assert.deepStrictEqual(hits(plugin, 'IT department'), ['IT']);
    assert.deepStrictEqual(hits(plugin, 'it depends'), [], 'linked the pronoun');
    assert.deepStrictEqual(hits(plugin, 'It depends'), [], 'linked a sentence opener');
  });

  it('still matches an ordinary term whatever its spelling in the text', () => {
    const plugin = fakePlugin([{ id: 'cell', text: 'cell' }], true);
    assert.deepStrictEqual(hits(plugin, 'a cell here'), ['cell']);
    assert.deepStrictEqual(hits(plugin, 'A Cell here'), ['Cell'], 'smart case leaked onto a normal word');
  });

  it('decides per form, so an acronym alias of a plain term stays cased', () => {
    // One term, two forms — the way a note titled "Central nervous system" carries "CNS".
    const plugin = fakePlugin([
      { id: 'cns', text: 'Central nervous system' },
      { id: 'cns', text: 'CNS' },
    ], true);
    assert.deepStrictEqual(hits(plugin, 'the CNS is'), ['CNS']);
    assert.deepStrictEqual(hits(plugin, 'the cns is'), [], 'the acronym alias matched lowercase');
    assert.deepStrictEqual(hits(plugin, 'the central nervous system is'), ['central nervous system'],
      'the spelled-out form should not be case-sensitive');
  });

  it('cases a multi-word acronym across the whole span', () => {
    const plugin = fakePlugin([{ id: 'tcpip', text: 'TCP-IP' }], true);
    assert.deepStrictEqual(hits(plugin, 'over TCP-IP here'), ['TCP-IP']);
    assert.deepStrictEqual(hits(plugin, 'over tcp-ip here'), [], 'compared only the first word');
  });

  it('cannot reach an acronym written across a slash, whatever the case', () => {
    // Not a smart-case rule but the scan's: a multi-word term is only joined across spaces
    // and hyphens, so "TCP/IP" never matches even spelled exactly. Pinned because the
    // classifier does call it an acronym, which reads as though it were indexable.
    assert.strictEqual(isAcronymish('TCP/IP'), true);
    const plugin = fakePlugin([{ id: 'tcpip', text: 'TCP/IP' }], true);
    assert.deepStrictEqual(hits(plugin, 'over TCP/IP here'), []);
  });

  it('goes away entirely when the setting is off', () => {
    const plugin = fakePlugin([{ id: 'IT', text: 'IT' }], false);
    assert.deepStrictEqual(hits(plugin, 'it depends'), ['it'], 'the setting did not turn the rule off');
  });
});
