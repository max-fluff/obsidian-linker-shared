'use strict';

// Folding the family's strings in underneath a plugin's own.

const { describe, it, assert } = require('../harness');
const { withFamily } = require('../../i18n');
const common = require('../../locales/common');
const prose = require('../../locales/prose');
const sigil = require('../../locales/sigil');

describe('withFamily', () => {
  it('adds the family strings to a plugin that does not carry them', () => {
    const merged = withFamily('prose', { en: { 'own.key': 'mine' } });
    assert.strictEqual(merged.en['own.key'], 'mine');
    assert.strictEqual(merged.en['btn.cancel'], common.en['btn.cancel']);
    assert.strictEqual(merged.en['modal.choose.title'], prose.en['modal.choose.title']);
  });

  it('lets the plugin override a family string it needs different wording for', () => {
    const merged = withFamily('prose', { en: { 'btn.cancel': 'Never mind' } });
    assert.strictEqual(merged.en['btn.cancel'], 'Never mind');
  });

  it('keeps the two pairs apart', () => {
    const merged = withFamily('prose', { en: {} });
    assert.strictEqual(merged.en['menu.convert'], undefined, 'a prose plugin got a sigil string');
    assert.ok(sigil.en['menu.convert'], 'precondition: it is a sigil string');
  });

  it('adds no language the plugin does not ship', () => {
    // A plugin translated into two languages must not suddenly offer a third, half-translated
    // one: consistently English beats a mixed UI.
    const merged = withFamily('prose', { en: {}, ru: {} });
    assert.deepStrictEqual(Object.keys(merged).sort(), ['en', 'ru']);
    assert.ok(prose.de, 'precondition: the family does carry German');
  });
});

describe('family locale tables', () => {
  it('translate every key they declare in English', () => {
    for (const [name, set] of [['common', common], ['prose', prose], ['sigil', sigil]]) {
      for (const [lang, table] of Object.entries(set)) {
        if (lang === 'en') continue;
        for (const key of Object.keys(table)) {
          assert.ok(set.en[key] !== undefined, `${name}/${lang} has ${key}, English does not`);
        }
      }
    }
  });
});
