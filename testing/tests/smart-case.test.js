'use strict';

// Smart case. Both prose linkers index acronym-like forms as case-sensitive, so a note or
// heading called "IT" links "IT" and leaves the English word "it" alone. The rule is per
// form, not per term: an ordinary term with an acronym alias keeps both behaviours.

const { describe, it, assert } = require('../harness');
const { isAcronymish } = require('../../prose/matcher');
const { fakeProsePlugin, hitsIn: hits } = require('../prose-fixture');

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
    const plugin = fakeProsePlugin([{ id: 'IT', text: 'IT' }], true);
    assert.deepStrictEqual(hits(plugin, 'IT department'), ['IT']);
    assert.deepStrictEqual(hits(plugin, 'it depends'), [], 'linked the pronoun');
    assert.deepStrictEqual(hits(plugin, 'It depends'), [], 'linked a sentence opener');
  });

  it('still matches an ordinary term whatever its spelling in the text', () => {
    const plugin = fakeProsePlugin([{ id: 'cell', text: 'cell' }], true);
    assert.deepStrictEqual(hits(plugin, 'a cell here'), ['cell']);
    assert.deepStrictEqual(hits(plugin, 'A Cell here'), ['Cell'], 'smart case leaked onto a normal word');
  });

  it('decides per form, so an acronym alias of a plain term stays cased', () => {
    // One term, two forms — the way a note titled "Central nervous system" carries "CNS".
    const plugin = fakeProsePlugin([
      { id: 'cns', text: 'Central nervous system' },
      { id: 'cns', text: 'CNS' },
    ], true);
    assert.deepStrictEqual(hits(plugin, 'the CNS is'), ['CNS']);
    assert.deepStrictEqual(hits(plugin, 'the cns is'), [], 'the acronym alias matched lowercase');
    assert.deepStrictEqual(hits(plugin, 'the central nervous system is'), ['central nervous system'],
      'the spelled-out form should not be case-sensitive');
  });

  it('cases a multi-word acronym across the whole span', () => {
    const plugin = fakeProsePlugin([{ id: 'tcpip', text: 'TCP-IP' }], true);
    assert.deepStrictEqual(hits(plugin, 'over TCP-IP here'), ['TCP-IP']);
    assert.deepStrictEqual(hits(plugin, 'over tcp-ip here'), [], 'compared only the first word');
  });

  it('cases an acronym written across a slash, spelled as the form spells it', () => {
    // The scan joins a multi-word form across the punctuation the form itself has, so
    // "TCP/IP" is reachable — and smart case still keeps it off the lowercase spelling.
    assert.strictEqual(isAcronymish('TCP/IP'), true);
    const plugin = fakeProsePlugin([{ id: 'tcpip', text: 'TCP/IP' }], true);
    assert.deepStrictEqual(hits(plugin, 'over TCP/IP here'), ['TCP/IP']);
    assert.deepStrictEqual(hits(plugin, 'over tcp/ip here'), []);
  });

  it('goes away entirely when the setting is off', () => {
    const plugin = fakeProsePlugin([{ id: 'IT', text: 'IT' }], false);
    assert.deepStrictEqual(hits(plugin, 'it depends'), ['it'], 'the setting did not turn the rule off');
  });
});
