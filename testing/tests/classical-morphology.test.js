'use strict';

const { describe, it, assert } = require('../harness');
const { validateLanguage } = require('../../morphology/language-api');
const en = require('../../morphology/languages/en');
const la = require('../../morphology/languages/la');
const el = require('../../morphology/languages/el');

const links = (lang, a, b) => {
  const ka = lang.keys(a, 'stemmer');
  const kb = lang.keys(b, 'stemmer');
  return ka.some((k) => kb.includes(k));
};

describe('en — classical plurals', () => {
  it('links classical plurals to their singular, no Latin needed', () => {
    for (const [a, b] of [
      ['cactus', 'cacti'], ['nucleus', 'nuclei'], ['radius', 'radii'], ['fungus', 'fungi'],
      ['datum', 'data'], ['bacterium', 'bacteria'], ['curriculum', 'curricula'],
      ['phenomenon', 'phenomena'], ['criterion', 'criteria'],
      ['index', 'indices'], ['matrix', 'matrices'], ['appendix', 'appendices'],
      ['corpus', 'corpora'], ['genus', 'genera'],
      ['formula', 'formulae'], ['larva', 'larvae'],
      ['thesis', 'theses'], ['hypothesis', 'hypotheses'], ['analysis', 'analyses'],
      ['schema', 'schemata'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('links a regular -es plural of an -ix word too', () => {
    assert.ok(links(en, 'index', 'indexes'));
    assert.ok(links(en, 'appendix', 'appendixes'));
  });

  it('does not sweep "indices" into the indicate/indicator stem family', () => {
    assert.ok(!links(en, 'indices', 'indicator'));
    assert.ok(!links(en, 'indices', 'indicate'));
    assert.ok(links(en, 'indices', 'index'));
  });

  it('still links ordinary English forms', () => {
    assert.ok(links(en, 'unit', 'units'));
    assert.ok(links(en, 'running', 'run'));
  });
});

describe('la — Latin morphology', () => {
  it('satisfies the language contract', () => {
    assert.strictEqual(validateLanguage(la), null);
  });

  it('links case forms of a word in Latin', () => {
    assert.ok(links(la, 'rosa', 'rosae'));
    assert.ok(links(la, 'rosa', 'rosam'));
    assert.ok(links(la, 'populus', 'populi'));
    assert.ok(links(la, 'amicus', 'amicum'));
  });

  it('claims Latin script, not Greek', () => {
    assert.ok(la.match('rosa'));
    assert.ok(!la.match('λόγος'));
  });
});

describe('el — Greek morphology', () => {
  it('satisfies the language contract', () => {
    assert.strictEqual(validateLanguage(el), null);
  });

  it('folds polytonic diacritics so accented case forms link', () => {
    for (const [a, b] of [
      ['λόγος', 'λόγου'], ['λόγος', 'λόγων'], ['ψυχή', 'ψυχῆς'], ['ψυχή', 'ψυχήν'],
      ['ἀρετή', 'ἀρετῆς'], ['φύσις', 'φύσεως'], ['πόλις', 'πόλεως'], ['θεός', 'θεοῦ'],
    ]) assert.ok(links(el, a, b), `${a} ~ ${b}`);
  });

  it('reduces -ματ- neuters through the -μα nominative', () => {
    assert.ok(links(el, 'σῶμα', 'σώματος'));
    assert.ok(links(el, 'σῶμα', 'σώματα'));
    assert.ok(links(el, 'ὄνομα', 'ὀνόματος'));
  });

  it('keeps unrelated words apart', () => {
    assert.ok(!links(el, 'λόγος', 'ψυχή'));
  });

  it('claims Greek script, not Latin', () => {
    assert.ok(el.match('λόγος'));
    assert.ok(!el.match('cactus'));
  });
});
