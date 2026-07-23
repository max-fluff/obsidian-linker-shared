'use strict';

// Ukrainian morphology for the linker plugins. A light suffix stemmer plus the о/і
// and е/і vowel alternation in a closed final syllable (кіт → кота, ніч → ночі,
// стіл → стола). This is the plugin's own helper, not a port of a published
// algorithm: lighter than full Snowball, enough to link everyday case forms.

const ENDINGS = [
  'ами', 'ями', 'ові', 'еві', 'ого', 'ому', 'ему', 'ими', 'их',
  'ах', 'ях', 'ів', 'ою', 'ею', 'ом', 'ем', 'ям', 'ей', 'ий', 'ій',
  'а', 'я', 'у', 'ю', 'е', 'о', 'и', 'і', 'ї', 'ь',
].sort((a, b) => b.length - a.length);

const CLOSED_SYLLABLE = /^(.*)і([^аеєиіїоуюя]+)$/;

// Two letters, not three, for the reason ru.js gives: at three дня and сна are left uncut
// and never meet their own base form.
function strip(word) {
  const w = word.toLowerCase();
  for (const e of ENDINGS) {
    if (w.length - e.length >= 2 && w.endsWith(e)) return w.slice(0, -e.length);
  }
  return w;
}

// і in a closed final syllable usually opens to о or е once an ending is added, so
// offer both forms as keys, letting the base meet its inflected forms.
function alternations(stem) {
  const m = CLOSED_SYLLABLE.exec(stem);
  return m ? [m[1] + 'о' + m[2], m[1] + 'е' + m[2]] : [];
}

// нотатка/нотаток, вікно/вікон: the vowel the base form carries drops out of the paradigm.
function fleetingStems(word) {
  const out = [];
  let m = /^(.+)о([кцнлбмртвшжгх])$/.exec(word);
  if (m) out.push(m[1] + m[2]);
  m = /^(.+)е([цкнлмртвшжб])$/.exec(word);
  if (m) out.push(m[1] + m[2]);
  m = /^(.+)ень$/.exec(word);
  if (m) out.push(m[1] + 'н');
  return out.filter((s) => s.length >= 2);
}

// Suppletive and stem-growing nouns; the singular gains the stem its other forms reduce to.
// Looked up without the apostrophe, which is written three different ways in the wild.
const bareApostrophe = (w) => w.replace(/[’ʼ']/g, '');
const IRREGULAR = new Map([
  ['людина', 'люд'], ['дитина', 'діт'], ['мати', 'матер'], ['око', 'оч'],
  ['імя', 'імен'], ['племя', 'племен'], ['вимя', 'вимен'],
]);

module.exports = {
  id: 'uk',
  name: 'Ukrainian',
  priority: 0,
  match: (word) => /[а-яіїєґ]/i.test(word),
  keys(word, mode) {
    const w = word.toLowerCase();
    if (mode === 'exact') return [w];
    const stem = strip(w);
    const ks = [...new Set([stem, ...alternations(stem), ...fleetingStems(w)])];
    const extra = IRREGULAR.get(bareApostrophe(w));
    if (extra && !ks.includes(extra)) ks.push(extra);
    return ks;
  },
  lemma: (word) => strip(word),
};
