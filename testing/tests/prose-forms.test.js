'use strict';

// Two things a prose form must do beyond plain words: match where the text writes its own
// punctuation between words (glossary-linker #5), and count as taken only when it covers the
// whole wording, not part of it (glossary-linker #6).

const { describe, it, assert } = require('../harness');
const { fakeProsePlugin, hitsIn: hits } = require('../prose-fixture');

describe('a form with its own punctuation between words', () => {
  it('matches the text written the same way', () => {
    const plugin = fakeProsePlugin([
      { id: 'n', text: '1234/1234' },
      { id: 't', text: 'TCP/IP' },
      { id: 'j', text: 'Node.js' },
    ]);
    assert.deepStrictEqual(hits(plugin, 'see 1234/1234 here'), ['1234/1234']);
    assert.deepStrictEqual(hits(plugin, 'over TCP/IP and Node.js'), ['TCP/IP', 'Node.js']);
  });

  it('still takes a space or a hyphen there, as every form does', () => {
    const plugin = fakeProsePlugin([{ id: 't', text: 'TCP/IP' }]);
    assert.deepStrictEqual(hits(plugin, 'TCP IP'), ['TCP IP']);
    assert.deepStrictEqual(hits(plugin, 'TCP-IP'), ['TCP-IP']);
  });

  it('does not take other punctuation in its place', () => {
    const plugin = fakeProsePlugin([{ id: 'n', text: '1234/1234' }]);
    assert.deepStrictEqual(hits(plugin, '1234.1234'), []);
    assert.deepStrictEqual(hits(plugin, '1234 / 1234'), []);
  });

  it('leaves a plain multi-word form as strict as before', () => {
    const plugin = fakeProsePlugin([{ id: 'n', text: 'natural language' }]);
    assert.deepStrictEqual(hits(plugin, 'natural language'), ['natural language']);
    assert.deepStrictEqual(hits(plugin, 'natural/language'), []);
    assert.deepStrictEqual(hits(plugin, 'natural, language'), []);
  });
});

describe('termsMatchingWhole', () => {
  const plugin = fakeProsePlugin([
    { id: 'language', text: 'language' },
    { id: 'tongue', text: 'language' },
  ]);
  const both = ['language', 'tongue'];

  it('ignores a term that covers only part of the wording', () => {
    assert.deepStrictEqual(plugin.termsMatchingWhole('natural language'), []);
    assert.deepStrictEqual(plugin.termsMatchingWhole('large language models'), []);
    // Unlike the partial question, which still sees it.
    assert.deepStrictEqual(plugin.termsMatchingText('natural language').sort(), both);
  });

  it('finds every term covering all of it, punctuation around it aside', () => {
    assert.deepStrictEqual(plugin.termsMatchingWhole('language').sort(), both);
    assert.deepStrictEqual(plugin.termsMatchingWhole(' "Language". ').sort(), both);
    assert.deepStrictEqual(plugin.termsMatchingWhole('language', 'tongue'), ['language']);
  });

  it('sees a longer term that already covers the wording', () => {
    const p = fakeProsePlugin([
      { id: 'language', text: 'language' },
      { id: 'nl', text: 'natural language' },
    ]);
    assert.deepStrictEqual(p.termsMatchingWhole('natural language'), ['nl']);
  });

  it('answers nothing for wording without a word in it', () => {
    assert.deepStrictEqual(plugin.termsMatchingWhole('—'), []);
  });
});
