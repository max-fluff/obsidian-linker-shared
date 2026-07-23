'use strict';

// English morphology for the linker plugins.
//
// stem() implements the English (Porter2) stemming algorithm, ported from Snowball's
// algorithms/english.sbl. Snowball is (c) 2001-2006 Dr Martin Porter and Richard
// Boulton, BSD license (free for commercial and non-commercial use):
//   https://snowballstem.org/license.html
//   https://snowballstem.org/algorithms/english/stemmer.html
// strip()/lemma() are this plugin's own light helpers.

const VOWELS = 'aeiouy';
const isV = (c) => VOWELS.includes(c);
const notV = (c) => !isV(c);
const DOUBLES = ['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'];
const VALID_LI = 'cdeghkmnrt';

// R1 fixed by hand, so general/generous and universe/university stay apart.
const PREFIXES = ['gener', 'commun', 'arsen', 'past', 'univers', 'later', 'emerg', 'organ', 'inter'];

const EXCEPTION1 = {
  skis: 'ski', skies: 'sky', idly: 'idl', gently: 'gentl', ugly: 'ugli',
  early: 'earli', only: 'onli', singly: 'singl',
  sky: 'sky', news: 'news', howe: 'howe', atlas: 'atlas', cosmos: 'cosmos',
  bias: 'bias', andes: 'andes',
};
const ING_KEEP = ['inn', 'out', 'cann', 'herr', 'earr', 'even'];

const gopast = (w, from, test) => {
  let i = from;
  while (i < w.length && !test(w[i])) i++;
  return i < w.length ? i + 1 : w.length;
};

function markRegions(w) {
  const prefix = PREFIXES.find((p) => w.startsWith(p));
  const p1 = prefix ? prefix.length : gopast(w, gopast(w, 0, isV), notV);
  return [p1, gopast(w, gopast(w, p1, isV), notV)];
}

function shortv(w) {
  const n = w.length;
  if (n >= 3 && !isV(w[n - 1]) && w[n - 1] !== 'w' && w[n - 1] !== 'x' && w[n - 1] !== 'Y'
    && isV(w[n - 2]) && !isV(w[n - 3])) return true;
  if (n === 2 && isV(w[0]) && !isV(w[1])) return true;
  return w.endsWith('past');
}

const longestOf = (w, list) => list.filter((s) => w.endsWith(s)).sort((a, b) => b.length - a.length)[0];

const STEP2 = [['ational', 'ate'], ['tional', 'tion'], ['ization', 'ize'], ['ousness', 'ous'],
  ['iveness', 'ive'], ['fulness', 'ful'], ['ogist', 'og'], ['lessli', 'less'], ['biliti', 'ble'],
  ['alism', 'al'], ['aliti', 'al'], ['ation', 'ate'], ['entli', 'ent'], ['ousli', 'ous'],
  ['iviti', 'ive'], ['fulli', 'ful'], ['enci', 'ence'], ['anci', 'ance'], ['abli', 'able'],
  ['izer', 'ize'], ['ator', 'ate'], ['alli', 'al'], ['ogi', 'og'], ['bli', 'ble'], ['li', null]];
const STEP3 = [['ational', 'ate'], ['tional', 'tion'], ['alize', 'al'], ['icate', 'ic'],
  ['iciti', 'ic'], ['ical', 'ic'], ['ness', ''], ['ful', ''], ['ative', null]];
const STEP4 = ['ement', 'ance', 'ence', 'able', 'ible', 'ment', 'ant', 'ent', 'ism',
  'ate', 'iti', 'ous', 'ive', 'ize', 'ion', 'al', 'er', 'ic'];

function stem(word) {
  const lower = word.toLowerCase();
  if (EXCEPTION1[lower] !== undefined) return EXCEPTION1[lower];
  if (lower.length < 3) return lower;

  let w = lower.startsWith("'") ? lower.slice(1) : lower;
  let yFound = false;
  let marked = '';
  for (let i = 0; i < w.length; i++) {
    if (w[i] === 'y' && (i === 0 || isV(w[i - 1]))) { marked += 'Y'; yFound = true; } else marked += w[i];
  }
  w = marked;

  const [p1, p2] = markRegions(w);
  const inR1 = (n) => p1 <= w.length - n;
  const inR2 = (n) => p2 <= w.length - n;

  const apo = longestOf(w, ["'s'", "'s", "'"]);
  if (apo) w = w.slice(0, -apo.length);
  const s1a = longestOf(w, ['sses', 'ied', 'ies', 'us', 'ss', 's']);
  if (s1a === 'sses') w = w.slice(0, -2);
  else if (s1a === 'ied' || s1a === 'ies') w = w.length > 4 ? w.slice(0, -2) : w.slice(0, -1);
  else if (s1a === 's' && [...w.slice(0, -2)].some(isV)) w = w.slice(0, -1);

  const s1b = longestOf(w, ['eedly', 'eed', 'ingly', 'edly', 'ing', 'ed']);
  let general = false;
  if (s1b === 'eedly' || s1b === 'eed') {
    const rest = w.slice(0, -s1b.length);
    if (inR1(s1b.length) && !['proc', 'exc', 'succ'].includes(rest)) w = rest + 'ee';
  } else if (s1b === 'ing') {
    const rest = w.slice(0, -3);
    if (rest.length === 2 && rest.endsWith('y') && !isV(rest[0])) w = rest[0] + 'ie';
    else if (!ING_KEEP.includes(rest)) general = true;
  } else if (s1b) general = true;

  if (general) {
    const rest = w.slice(0, -s1b.length);
    if ([...rest].some(isV)) {
      w = rest;
      if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
      else if (DOUBLES.some((d) => w.endsWith(d))) {
        // add and ebb keep their double: the vowel before it opens the word.
        if (!(w.length === 3 && 'aeo'.includes(w[0]))) w = w.slice(0, -1);
      } else if (w.length === p1 && shortv(w)) w += 'e';
    }
  }

  if (w.length > 2 && (w.endsWith('y') || w.endsWith('Y')) && !isV(w[w.length - 2])) {
    w = w.slice(0, -1) + 'i';
  }

  const s2 = STEP2.find(([suf]) => w.endsWith(suf));
  if (s2 && inR1(s2[0].length)) {
    if (s2[0] === 'ogi') { if (w[w.length - 4] === 'l') w = w.slice(0, -1); }
    else if (s2[0] === 'li') { if (VALID_LI.includes(w[w.length - 3])) w = w.slice(0, -2); }
    else w = w.slice(0, -s2[0].length) + s2[1];
  }

  const s3 = STEP3.find(([suf]) => w.endsWith(suf));
  if (s3 && inR1(s3[0].length)) {
    if (s3[0] === 'ative') { if (inR2(5)) w = w.slice(0, -5); }
    else w = w.slice(0, -s3[0].length) + s3[1];
  }

  const s4 = longestOf(w, STEP4);
  if (s4 && inR2(s4.length)) {
    if (s4 === 'ion') {
      const p = w[w.length - 4];
      if (p === 's' || p === 't') w = w.slice(0, -3);
    } else w = w.slice(0, -s4.length);
  }

  if (w.endsWith('e')) {
    if (inR2(1) || (inR1(1) && !shortv(w.slice(0, -1)))) w = w.slice(0, -1);
  } else if (w.endsWith('l') && inR2(1) && w[w.length - 2] === 'l') w = w.slice(0, -1);

  return yFound ? w.replace(/Y/g, 'y') : w;
}

// Cutting -es everywhere eats a silent e (notes → not), and which a -ses is —
// case/cases or bus/buses — the spelling cannot tell, so both readings key.
const SIBILANT_ES = /(?:s|x|z|ch|sh|[^aeiou]o)es$/;

function strip(word) {
  const w = word.toLowerCase();
  const out = [w];
  if (w.length > 4 && w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  else if (w.length > 4 && SIBILANT_ES.test(w)) out.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  return out;
}

// Each form keys to the singular, so "indices" resolves to "index", not the Porter stem
// "indic" it shares with indicate/indicator. Two-singular homographs (axes, bases) stay out.
const CLASSICAL = [
  ['cactus', 'cacti'], ['nucleus', 'nuclei'], ['radius', 'radii'], ['stimulus', 'stimuli'],
  ['fungus', 'fungi'], ['alumnus', 'alumni'], ['syllabus', 'syllabi'], ['bacillus', 'bacilli'],
  ['locus', 'loci'], ['terminus', 'termini'],
  ['datum', 'data'], ['bacterium', 'bacteria'], ['curriculum', 'curricula'],
  ['memorandum', 'memoranda'], ['stratum', 'strata'], ['spectrum', 'spectra'],
  ['erratum', 'errata'], ['symposium', 'symposia'], ['millennium', 'millennia'],
  ['ovum', 'ova'], ['quantum', 'quanta'],
  ['phenomenon', 'phenomena'], ['criterion', 'criteria'], ['ganglion', 'ganglia'],
  ['automaton', 'automata'],
  ['index', 'indices', 'indexes'], ['matrix', 'matrices'], ['appendix', 'appendices', 'appendixes'],
  ['vertex', 'vertices', 'vertexes'], ['apex', 'apices', 'apexes'],
  ['cortex', 'cortices'], ['helix', 'helices'],
  ['corpus', 'corpora'], ['genus', 'genera'],
  ['formula', 'formulae'], ['larva', 'larvae'], ['alga', 'algae'], ['vertebra', 'vertebrae'],
  ['nebula', 'nebulae'], ['antenna', 'antennae'],
  ['thesis', 'theses'], ['hypothesis', 'hypotheses'], ['analysis', 'analyses'],
  ['crisis', 'crises'], ['diagnosis', 'diagnoses'], ['parenthesis', 'parentheses'],
  ['ellipsis', 'ellipses'], ['synopsis', 'synopses'],
  ['schema', 'schemata'], ['stigma', 'stigmata'], ['dogma', 'dogmata'],
];
const GERMANIC = [
  ['mouse', 'mice'], ['louse', 'lice'],
  ['foot', 'feet'], ['tooth', 'teeth'], ['goose', 'geese'],
  ['man', 'men'], ['woman', 'women'],
  ['child', 'children'], ['ox', 'oxen'], ['person', 'people'],
];
// leaves (leaf/leave) and staves (staff/stave) have two singulars, so they stay out.
const FVES = [
  ['wolf', 'wolves'], ['calf', 'calves'], ['half', 'halves'], ['shelf', 'shelves'],
  ['elf', 'elves'], ['loaf', 'loaves'], ['thief', 'thieves'], ['self', 'selves'],
  ['scarf', 'scarves'], ['wharf', 'wharves'], ['hoof', 'hooves'],
  ['knife', 'knives'], ['life', 'lives'], ['wife', 'wives'],
];
const IRREGULAR = new Map();
for (const [sing, ...plurals] of [...CLASSICAL, ...GERMANIC, ...FVES]) {
  IRREGULAR.set(sing, sing);
  for (const p of plurals) IRREGULAR.set(p, sing);
}

// Would come apart onto oman, raman, carman, dolman, novum, basis, phasis.
const KEEP_WHOLE = new Set(['omen', 'amen', 'ramen', 'carmen', 'dolmen', 'nova', 'bases', 'phases']);

// A compound pluralises its last word, so the tables read as suffix rules too.
const COMPOUND = new RegExp(
  '^(.+)(' + [...IRREGULAR.keys()]
    .filter((form) => IRREGULAR.get(form) !== form)
    .sort((a, b) => b.length - a.length)
    .join('|') + ')$',
);

// prognoses/prognosis, fibroses/fibrosis, metastases/metastasis.
const GREEK_PLURAL = /.ses$/;

// The coined singular is reduced like any other word, or dormouse and dormice key apart.
function derivedKeys(word, reduce) {
  if (KEEP_WHOLE.has(word)) return [];
  const derived = new Set();
  const m = COMPOUND.exec(word);
  if (m) derived.add(m[1] + IRREGULAR.get(m[2]));
  if (GREEK_PLURAL.test(word)) derived.add(word.slice(0, -3) + 'sis');
  const out = [];
  for (const d of derived) out.push(...reduce(d));
  return out;
}

function lemma(word) {
  const w = word.toLowerCase();
  return IRREGULAR.get(w) || stem(w);
}

module.exports = {
  id: 'en',
  name: 'English',
  priority: 0,
  match: (word) => /[A-Za-z]/.test(word),
  keys(word, mode) {
    const w = word.toLowerCase();
    if (mode === 'exact') return [w];
    const canon = IRREGULAR.get(w);
    if (canon) return [canon];
    const reduce = mode === 'endingStrip' ? strip : (x) => [stem(x)];
    return [...new Set([...reduce(w), ...derivedKeys(w, reduce)])];
  },
  lemma,
};
