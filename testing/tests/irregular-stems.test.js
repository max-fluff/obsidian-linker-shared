'use strict';

const { describe, it, assert } = require('../harness');
const ru = require('../../morphology/languages/ru');
const uk = require('../../morphology/languages/uk');
const fr = require('../../morphology/languages/fr');
const de = require('../../morphology/languages/de');

const links = (lang, a, b) => {
  const ka = lang.keys(a, 'stemmer');
  const kb = lang.keys(b, 'stemmer');
  return ka.some((k) => kb.includes(k));
};

const paradigm = (lang, forms) => {
  for (const form of forms.slice(1)) assert.ok(links(lang, forms[0], form), `${forms[0]} ~ ${form}`);
};

describe('ru — fleeting vowels', () => {
  it('links a noun across the vowel it drops', () => {
    paradigm(ru, ['песок', 'песка', 'пески']);
    paradigm(ru, ['кусок', 'куска', 'куски']);
    paradigm(ru, ['цветок', 'цветка', 'цветки']);
    paradigm(ru, ['отец', 'отца', 'отцы', 'отцов']);
    paradigm(ru, ['конец', 'конца', 'концы']);
    paradigm(ru, ['камень', 'камня', 'камни']);
    paradigm(ru, ['ребёнок', 'ребёнка', 'ребёнку']);
  });

  it('links the forms that swap the vowel for ь or й', () => {
    paradigm(ru, ['палец', 'пальца', 'пальцы']);
    paradigm(ru, ['боец', 'бойца', 'бойцы']);
  });

  it('links день, сон and рот to their own case forms', () => {
    paradigm(ru, ['день', 'дня', 'дню', 'днём', 'дни', 'дней']);
    paradigm(ru, ['сон', 'сна', 'сну', 'сны', 'снов']);
    paradigm(ru, ['рот', 'рта', 'рту']);
    paradigm(ru, ['лоб', 'лба', 'лбу']);
  });

  it('leaves a word whole when its reduced form is another word', () => {
    assert.ok(!links(ru, 'урок', 'урка'));
    assert.ok(!links(ru, 'порок', 'порка'));
  });

  it('keeps цветок off цвет', () => {
    assert.ok(!links(ru, 'цветок', 'цвет'));
  });
});

describe('ru — irregular plurals', () => {
  it('links the -мя neuters to their -ен stem', () => {
    paradigm(ru, ['имя', 'имени', 'именем', 'имена', 'имён']);
    paradigm(ru, ['время', 'времени', 'времена', 'времён']);
    paradigm(ru, ['знамя', 'знамени', 'знамёна']);
    paradigm(ru, ['племя', 'племени', 'племена']);
  });

  it('links suppletive and stem-growing nouns', () => {
    paradigm(ru, ['человек', 'человека', 'люди', 'людей', 'людям']);
    paradigm(ru, ['ребёнок', 'дети', 'детей']);
    paradigm(ru, ['мать', 'матери', 'матерей']);
    paradigm(ru, ['дочь', 'дочери', 'дочерей']);
    paradigm(ru, ['небо', 'небеса', 'небес']);
    paradigm(ru, ['чудо', 'чуда', 'чудеса']);
    paradigm(ru, ['друг', 'друга', 'друзья', 'друзей']);
    paradigm(ru, ['сын', 'сына', 'сыновья', 'сыновей']);
    paradigm(ru, ['ухо', 'уха', 'уши']);
    paradigm(ru, ['хозяин', 'хозяина', 'хозяева']);
  });

  it('reaches an irregular stem from a case form, not only from the nominative', () => {
    for (const [a, b] of [
      ['человека', 'люди'], ['человеком', 'людям'], ['ребёнка', 'дети'],
      ['друга', 'друзья'], ['котёнка', 'котята'], ['хозяина', 'хозяева'],
    ]) assert.ok(links(ru, a, b), `${a} ~ ${b}`);
  });
});

describe('ru — young animals', () => {
  it('links a young animal to its -ята plural', () => {
    for (const [a, b] of [
      ['ребёнок', 'ребята'], ['котёнок', 'котята'], ['телёнок', 'телята'],
      ['гусёнок', 'гусята'], ['цыплёнок', 'цыплята'], ['поросёнок', 'поросята'],
      ['мышонок', 'мышата'], ['зайчонок', 'зайчата'], ['медвежонок', 'медвежата'],
      ['волчонок', 'волчата'], ['щенок', 'щенята'],
    ]) assert.ok(links(ru, a, b), `${a} ~ ${b}`);
  });

  it('keeps звонок off звать, but not off звонка', () => {
    assert.ok(!links(ru, 'звонок', 'звать'));
    assert.ok(links(ru, 'звонок', 'звонка'));
  });
});

describe('ru — case forms', () => {
  it('links the instrumental and prepositional forms', () => {
    paradigm(ru, ['новый', 'новым', 'новых', 'новыми', 'нового']);
    paradigm(ru, ['хороший', 'хорошим', 'хороших', 'хорошего']);
    paradigm(ru, ['большой', 'большим', 'больших', 'большого']);
  });

  it('links a base whose stem itself ends in an ending', () => {
    paradigm(ru, ['система', 'систем', 'систему', 'системой', 'системам']);
    paradigm(ru, ['схема', 'схем', 'схему']);
  });

  it('keeps a word off another word that happens to spell its stem', () => {
    assert.ok(!links(ru, 'работа', 'работать'));
    assert.ok(!links(ru, 'режим', 'режет'));
  });
});

describe('uk — irregular plurals', () => {
  it('links suppletive and stem-growing nouns', () => {
    paradigm(uk, ['людина', 'люди']);
    paradigm(uk, ['дитина', 'діти']);
    paradigm(uk, ['мати', 'матері']);
    paradigm(uk, ['око', 'очі']);
  });

  it('reads the -я neuters however the apostrophe is typed', () => {
    paradigm(uk, ["ім'я", 'імена']);
    paradigm(uk, ['імя', 'імена']);
    paradigm(uk, ["плем'я", 'племена']);
  });

  it('still links what the vowel alternation covered before', () => {
    paradigm(uk, ['кіт', 'кота']);
    paradigm(uk, ['вухо', 'вуха']);
  });
});

describe('uk — fleeting vowels', () => {
  it('links a noun across the vowel its base form carries', () => {
    paradigm(uk, ['нотатка', 'нотаток']);
    paradigm(uk, ['вікно', 'вікон']);
    paradigm(uk, ['сестра', 'сестер']);
  });

  it('links the short nouns to their own case forms', () => {
    paradigm(uk, ['день', 'дня', 'дні', 'днів']);
    paradigm(uk, ['сон', 'сну', 'сни']);
  });
});

describe('de — feminine plurals', () => {
  it('links -in to its -innen plural', () => {
    paradigm(de, ['freundin', 'freundinnen']);
    paradigm(de, ['lehrerin', 'lehrerinnen']);
  });
});

describe('de — verb forms', () => {
  it('links the finite forms the light stemmer leaves alone', () => {
    paradigm(de, ['machen', 'macht', 'machte']);
    paradigm(de, ['sagen', 'sagt', 'sagte']);
    paradigm(de, ['suchen', 'sucht', 'suchte']);
  });

  it('holds the ge- prefix back, since dropping it coins real words', () => {
    assert.ok(!links(de, 'Gewicht', 'Wicht'));
    assert.ok(!links(de, 'Gedanke', 'danke'));
    assert.ok(!links(de, 'Gebiet', 'bieten'));
  });
});

describe('fr — irregular plurals', () => {
  it('links the closed -ail/-aux group', () => {
    for (const [a, b] of [
      ['travail', 'travaux'], ['vitrail', 'vitraux'], ['corail', 'coraux'],
      ['bail', 'baux'], ['émail', 'émaux'], ['soupirail', 'soupiraux'], ['vantail', 'vantaux'],
    ]) assert.ok(links(fr, a, b), `${a} ~ ${b}`);
  });

  it('links the suppletive plurals, ligature or not', () => {
    assert.ok(links(fr, 'oeil', 'yeux'));
    assert.ok(links(fr, 'œil', 'yeux'));
    assert.ok(links(fr, 'ciel', 'cieux'));
    assert.ok(links(fr, 'aïeul', 'aïeux'));
  });

  it('leaves the regular -al/-aux words to the stemmer', () => {
    assert.ok(links(fr, 'cheval', 'chevaux'));
    assert.ok(links(fr, 'journal', 'journaux'));
  });
});
