'use strict';

// Give term "B" the alias "A" while a separate term "A" exists: hovering "A" offers both, and
// the row for B looks like a bug until it says it answers to "A".

const { describe, it, assert } = require('../harness');
const { createMatcher } = require('../../prose/matcher');
const { aliasHit } = require('../../prose/provider');
const { t } = require('../../i18n');

// Compared through t(), not against English: this file runs in all four suites and the sigil
// pair never loads the prose strings.
const via = (form) => t('kind.viaAlias', { form });

// The key machinery the comparison runs on: a crude stemmer, so "спавна" and "спавн" agree.
const plugin = Object.assign({}, createMatcher({ idOf: (c) => c.id, selfIdOf: () => null, fieldsOf: () => ({}) }));
plugin.settings = { matchMode: 'stemmer' };
plugin.keysCache = new Map();
plugin.activeLanguages = [{ match: () => true, keys: (w) => [w.toLowerCase().replace(/[аеиоуыя]$/u, '')] }];

const term = (canonical, aliases) => ({ canonical, aliases });

describe('alias caption', () => {
  it('names the alias the reader actually touched', () => {
    const b = term('B', ['A']);
    assert.strictEqual(aliasHit(plugin, b, 'B', 'A'), via('A'));
  });

  it('says nothing when the main form is what matched', () => {
    // The row for term A itself: it is in the list under its own name, not through an alias.
    // The alias here also matches the word — an inflection of it — so the main form has to
    // win outright rather than the first matching form being reported.
    const a = term('спавн', ['спавна']);
    assert.strictEqual(aliasHit(plugin, a, 'спавн', 'спавн'), null);
  });

  it('still recognises the alias through an inflection', () => {
    // The case string equality misses, and the one the reader is most likely to hit.
    const b = term('B', ['спавн']);
    assert.strictEqual(aliasHit(plugin, b, 'B', 'спавна'), via('спавн'));
  });

  it('matches a multi-word alias word by word', () => {
    const b = term('B', ['точка возрождения']);
    assert.strictEqual(aliasHit(plugin, b, 'B', 'точка возрождения'), via('точка возрождения'));
    assert.strictEqual(aliasHit(plugin, b, 'B', 'точка'), null, 'half an alias is not the alias');
  });

  it('says nothing it cannot know', () => {
    assert.strictEqual(aliasHit(plugin, term('B', ['A']), 'B', ''), null, 'guessed with no word to go on');
    assert.strictEqual(aliasHit(plugin, term('B', []), 'B', 'A'), null);
    assert.strictEqual(aliasHit(plugin, null, 'B', 'A'), null, 'threw on a target it does not know');
  });
});
