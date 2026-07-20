'use strict';

// Latin morphology: a JavaScript port of the Schinke Latin stemmer (Schinke, Greengrass,
// Robertson & Willett, J. Documentation 52(2), 1996). Algorithm and suffix lists:
//   https://snowballstem.org/otherapps/schinke/

const QUE_KEEP = new Set([
  'atque', 'quoque', 'neque', 'itaque', 'absque', 'apsque', 'abusque', 'adaeque',
  'adusque', 'denique', 'deque', 'susque', 'oblique', 'peraeque', 'plenisque',
  'quandoque', 'quisque', 'quaeque', 'cuiusque', 'cuique', 'quemque', 'quamque',
  'quaque', 'quique', 'quorumque', 'quarumque', 'quibusque', 'quosque', 'quasque',
  'quotusquisque', 'quousque', 'ubique', 'undique', 'usque', 'uterque', 'utique',
  'utroque', 'utribique', 'torque', 'coque', 'concoque', 'contorque', 'detorque',
  'decoque', 'excoque', 'extorque', 'obtorque', 'optorque', 'retorque', 'recoque',
  'attorque', 'incoque', 'intorque', 'praetorque',
]);

const NOUN_SUFFIXES = ['ibus', 'ius', 'ae', 'am', 'as', 'em', 'es', 'ia', 'is', 'nt', 'os', 'ud', 'um', 'us', 'a', 'e', 'i', 'o', 'u'];
const VERB_SUFFIXES = ['iuntur', 'beris', 'erunt', 'untur', 'iunt', 'mini', 'ntur', 'stis', 'bor', 'ero', 'mur', 'mus', 'ris', 'sti', 'tis', 'tur', 'unt', 'bo', 'ns', 'nt', 'ri', 'm', 'r', 's', 't'];
const VERB_REPLACE = { iuntur: 'i', erunt: 'i', untur: 'i', iunt: 'i', unt: 'i', beris: 'bi', bor: 'bi', bo: 'bi', ero: 'eri' };

function normalize(word) {
  return word.toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u');
}

function longestSuffix(word, suffixes) {
  let best = '';
  for (const s of suffixes) {
    if (s.length > best.length && word.length > s.length && word.endsWith(s)) best = s;
  }
  return best;
}

function nounStem(w) {
  const s = longestSuffix(w, NOUN_SUFFIXES);
  if (s) { const t = w.slice(0, -s.length); if (t.length >= 2) return t; }
  return w;
}

function verbStem(w) {
  const s = longestSuffix(w, VERB_SUFFIXES);
  if (s) { const t = w.slice(0, -s.length) + (VERB_REPLACE[s] || ''); if (t.length >= 2) return t; }
  return w;
}

function deque(w) {
  return w.endsWith('que') && !QUE_KEEP.has(w) ? w.slice(0, -3) : w;
}

module.exports = {
  id: 'la',
  name: 'Latin',
  priority: 0,
  match: (word) => /[a-z]/i.test(word),
  keys(word, mode) {
    const w = word.toLowerCase();
    if (mode === 'exact') return [w];
    const base = deque(normalize(w));
    if (mode === 'endingStrip') return [nounStem(base)];
    return [...new Set([nounStem(base), verbStem(base)])];
  },
};
