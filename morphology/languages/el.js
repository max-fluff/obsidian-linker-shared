'use strict';

// Greek morphology (ancient and modern): fold polytonic diacritics, then strip the shared
// nominal and verbal endings. A light suffix stemmer, this plugin's own helper, not a full
// lemmatiser.

const FINAL_SIGMA = String.fromCharCode(0x3c2);
const SIGMA = String.fromCharCode(0x3c3);

function fold(word) {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(FINAL_SIGMA).join(SIGMA);
}

const NEUTER = new RegExp('(' + ['ματος', 'ματων', 'ματα', 'μασιν', 'μασι', 'ματι'].map(fold).join('|') + ')$');

const ENDINGS = [
  'ουσιν', 'οντων', 'ουσι', 'οντος', 'οντα', 'ουσα', 'μεθα', 'νται', 'σθε',
  'εως', 'εων', 'οις', 'ους', 'ται', 'ναι', 'μαι', 'σαι',
  'ος', 'ου', 'ον', 'οι', 'ων', 'ης', 'ην', 'αι', 'ας', 'αν', 'εις', 'ει', 'ις',
  'α', 'ε', 'η', 'ω', 'ι',
].map(fold).sort((a, b) => b.length - a.length);

function strip(word) {
  const w = fold(word).replace(NEUTER, 'μα');
  for (const e of ENDINGS) {
    if (w.length - e.length >= 2 && w.endsWith(e)) return w.slice(0, -e.length);
  }
  return w;
}

module.exports = {
  id: 'el',
  name: 'Greek',
  priority: 0,
  match: (word) => /[Ͱ-Ͽἀ-῿]/.test(word),
  keys(word, mode) {
    if (mode === 'exact') return [word.toLowerCase()];
    if (mode === 'endingStrip') return [fold(word)];
    return [strip(word)];
  },
};
