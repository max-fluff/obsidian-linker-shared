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

describe('en — families the stemmer must keep apart', () => {
  it('holds the hand-marked words off their look-alikes', () => {
    for (const [a, b] of [
      ['generous', 'general'], ['generous', 'generate'], ['university', 'universe'],
      ['organ', 'organize'], ['past', 'paste'], ['later', 'lateral'],
      ['emerge', 'emergency'], ['intern', 'internal'], ['commune', 'communism'],
      ['news', 'new'],
    ]) assert.ok(!links(en, a, b), `${a} ~ ${b}`);
  });

  it('keeps a doubled consonant that opens the word', () => {
    assert.ok(links(en, 'added', 'add'));
    assert.ok(links(en, 'ebbed', 'ebb'));
    assert.ok(links(en, 'hopping', 'hop'));
  });
});

describe('en — irregular and compound plurals', () => {
  it('links irregular native plurals to their singular', () => {
    for (const [a, b] of [
      ['mouse', 'mice'], ['louse', 'lice'], ['foot', 'feet'], ['tooth', 'teeth'],
      ['goose', 'geese'], ['man', 'men'], ['woman', 'women'],
      ['child', 'children'], ['ox', 'oxen'], ['person', 'people'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('keeps an irregular plural out of unrelated stem families', () => {
    assert.ok(!links(en, 'men', 'mental'));
    assert.ok(!links(en, 'feet', 'feed'));
  });

  it('links -f/-ves plurals to their singular', () => {
    for (const [a, b] of [
      ['wolf', 'wolves'], ['calf', 'calves'], ['half', 'halves'], ['shelf', 'shelves'],
      ['elf', 'elves'], ['loaf', 'loaves'], ['thief', 'thieves'], ['self', 'selves'],
      ['scarf', 'scarves'], ['wharf', 'wharves'], ['hoof', 'hooves'],
      ['knife', 'knives'], ['life', 'lives'], ['wife', 'wives'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('leaves a -ves form with two singulars unlinked', () => {
    assert.ok(!links(en, 'leaf', 'leaves'));
    assert.ok(!links(en, 'staff', 'staves'));
  });

  it('links a compound through the plural of its last word', () => {
    for (const [a, b] of [
      ['fireman', 'firemen'], ['chairwoman', 'chairwomen'], ['gunman', 'gunmen'],
      ['grandchild', 'grandchildren'], ['stepchild', 'stepchildren'],
      ['dormouse', 'dormice'], ['clubfoot', 'clubfeet'], ['bucktooth', 'buckteeth'],
      ['bookshelf', 'bookshelves'], ['housewife', 'housewives'], ['werewolf', 'werewolves'],
      ['penknife', 'penknives'], ['headscarf', 'headscarves'],
      ['salesperson', 'salespeople'], ['businessperson', 'businesspeople'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('links a compound whose last word no table lists', () => {
    for (const [a, b] of [
      ['synthesis', 'syntheses'], ['prosthesis', 'prostheses'],
      ['metadatum', 'metadata'], ['substratum', 'substrata'],
      ['cyanobacterium', 'cyanobacteria'], ['submatrix', 'submatrices'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('adds a compound key without dropping the one a look-alike had', () => {
    assert.ok(links(en, 'specimen', 'specimens'));
    assert.ok(links(en, 'regimen', 'regimens'));
    assert.ok(!links(en, 'specimen', 'fireman'));
  });

  it('holds back a word that would come apart into a real, unrelated one', () => {
    assert.ok(!links(en, 'omen', 'oman'));
    assert.ok(!links(en, 'ramen', 'raman'));
    assert.ok(!links(en, 'dolmen', 'dolman'));
  });

  it('takes a compound however short its first word', () => {
    assert.ok(links(en, 'axman', 'axmen'));
  });

  it('links a Greek -sis noun no table lists to its plural', () => {
    for (const [a, b] of [
      ['genesis', 'geneses'], ['neurogenesis', 'neurogeneses'],
      ['prognosis', 'prognoses'], ['metastasis', 'metastases'],
      ['psychosis', 'psychoses'], ['symbiosis', 'symbioses'],
      ['sclerosis', 'scleroses'], ['fibrosis', 'fibroses'],
    ]) assert.ok(links(en, a, b), `${a} ~ ${b}`);
  });

  it('keeps bases on base, not on basis', () => {
    assert.ok(links(en, 'bases', 'base'));
    assert.ok(!links(en, 'bases', 'basis'));
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

  it('links the modern plural of the commonest noun classes', () => {
    for (const [a, b] of [
      ['χώρα', 'χώρες'], ['γλώσσα', 'γλώσσες'], ['ώρα', 'ώρες'],
      ['βιβλίο', 'βιβλία'], ['πατέρας', 'πατέρες'],
    ]) assert.ok(links(el, a, b), `${a} ~ ${b}`);
  });

  it('links the -ί neuters through the ι their oblique forms grow', () => {
    for (const [a, b] of [
      ['παιδί', 'παιδιά'], ['παιδί', 'παιδιού'], ['κερί', 'κεριά'],
    ]) assert.ok(links(el, a, b), `${a} ~ ${b}`);
  });

  it('keeps the -ι rule off the -οι and -αι endings', () => {
    assert.ok(!el.keys('λόγοι', 'stemmer').includes('λογοι'));
    assert.ok(!el.keys('άνθρωποι', 'stemmer').includes('ανθρωποι'));
  });

  it('keeps unrelated words apart', () => {
    assert.ok(!links(el, 'λόγος', 'ψυχή'));
  });

  it('claims Greek script, not Latin', () => {
    assert.ok(el.match('λόγος'));
    assert.ok(!el.match('cactus'));
  });
});
