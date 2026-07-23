'use strict';

const { describe, it, assert } = require('../harness');
const en = require('../../morphology/languages/en');
const de = require('../../morphology/languages/de');
const uk = require('../../morphology/languages/uk');
const el = require('../../morphology/languages/el');
const es = require('../../morphology/languages/es');
const fr = require('../../morphology/languages/fr');

const light = (lang, a, b) => {
  const ka = lang.keys(a, 'endingStrip');
  return lang.keys(b, 'endingStrip').some((k) => ka.includes(k));
};

describe('endingStrip — English', () => {
  it('keeps the silent e of a base whose plural only adds s', () => {
    for (const [a, b] of [
      ['note', 'notes'], ['file', 'files'], ['value', 'values'], ['name', 'names'],
      ['page', 'pages'], ['table', 'tables'], ['size', 'sizes'], ['line', 'lines'],
    ]) assert.ok(light(en, a, b), `${a} ~ ${b}`);
  });

  it('takes the -es plural after a sibilant', () => {
    for (const [a, b] of [
      ['box', 'boxes'], ['church', 'churches'], ['dish', 'dishes'], ['class', 'classes'],
      ['process', 'processes'], ['hero', 'heroes'], ['branch', 'branches'],
    ]) assert.ok(light(en, a, b), `${a} ~ ${b}`);
  });

  it('reads an ambiguous -ses both ways', () => {
    assert.ok(light(en, 'case', 'cases'));
    assert.ok(light(en, 'bus', 'buses'));
  });

  it('takes -ies, and the -us words the stemmer walks past', () => {
    assert.ok(light(en, 'city', 'cities'));
    assert.ok(light(en, 'entity', 'entities'));
    assert.ok(light(en, 'status', 'statuses'));
    assert.ok(light(en, 'alias', 'aliases'));
  });

  it('does not pull a plural onto a shorter unrelated word', () => {
    assert.ok(!light(en, 'notes', 'not'));
    assert.ok(!light(en, 'files', 'fil'));
    assert.ok(!light(en, 'bases', 'basis'));
  });
});

describe('endingStrip — German', () => {
  it('links a plural to a base the ending list cuts into', () => {
    for (const [a, b] of [
      ['haus', 'häuser'], ['buch', 'bücher'], ['auto', 'autos'], ['tag', 'tage'],
    ]) assert.ok(light(de, a, b), `${a} ~ ${b}`);
  });
});

describe('endingStrip — Ukrainian', () => {
  it('keeps the vowel alternation the stemmer mode has', () => {
    for (const [a, b] of [
      ['кіт', 'кота'], ['стіл', 'стола'], ['рік', 'року'],
    ]) assert.ok(light(uk, a, b), `${a} ~ ${b}`);
  });
});

describe('endingStrip — Spanish', () => {
  it('reads an -es plural both ways, and keeps a stem that ends in s', () => {
    for (const [a, b] of [
      ['grande', 'grandes'], ['ciudad', 'ciudades'], ['nota', 'notas'],
      ['voz', 'voces'], ['pais', 'países'], ['ingles', 'ingleses'],
    ]) assert.ok(light(es, a, b), `${a} ~ ${b}`);
  });
});

describe('endingStrip — French', () => {
  it('takes the regular -al/-aux plural', () => {
    for (const [a, b] of [
      ['cheval', 'chevaux'], ['journal', 'journaux'], ['note', 'notes'],
    ]) assert.ok(light(fr, a, b), `${a} ~ ${b}`);
  });
});

describe('endingStrip — Greek', () => {
  it('strips endings rather than only folding the diacritics', () => {
    for (const [a, b] of [
      ['λόγος', 'λόγου'], ['χώρα', 'χώρες'], ['βιβλίο', 'βιβλία'],
    ]) assert.ok(light(el, a, b), `${a} ~ ${b}`);
  });
});
