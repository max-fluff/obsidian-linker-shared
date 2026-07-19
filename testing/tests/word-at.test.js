'use strict';

// The plain word under the cursor. It exists because an excluded term is gone from the
// index: the menu that offers to un-exclude it has nothing to match against, so it needs a
// reading of the line that owes nothing to the index.

const { describe, it, assert } = require('../harness');
const { wordAt } = require('../../markdown');

describe('wordAt', () => {
  it('reads the word the cursor sits inside', () => {
    assert.strictEqual(wordAt('a spawn point', 4), 'spawn');
  });

  it('reads the word the cursor sits just after', () => {
    // Right-clicking at the end of a word is the ordinary case.
    assert.strictEqual(wordAt('a spawn point', 7), 'spawn');
  });

  it('reads the word the cursor sits at the start of', () => {
    assert.strictEqual(wordAt('a spawn point', 2), 'spawn');
  });

  it('is empty between words', () => {
    assert.strictEqual(wordAt('a  spawn', 2), '');
  });

  it('handles non-Latin words', () => {
    assert.strictEqual(wordAt('это Спаун тут', 6), 'Спаун');
  });

  it('stops at punctuation rather than swallowing it', () => {
    assert.strictEqual(wordAt('spawn, point', 3), 'spawn');
  });

  it('survives an empty line or an out-of-range cursor', () => {
    assert.strictEqual(wordAt('', 0), '');
    assert.strictEqual(wordAt(null, 3), '');
    assert.strictEqual(wordAt('spawn', 99), 'spawn');
  });
});
