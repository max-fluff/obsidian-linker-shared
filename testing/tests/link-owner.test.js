'use strict';

// Who a markdown link belongs to, and what happens when the two sides of the question run
// different versions of this code. Every plugin bundles its own copy of the submodule, so a
// vault can hold a provider that predates `claim` (or postdates our RANK vocabulary) — the
// answer has to degrade to the old solo behaviour, never to a crash.

const { describe, it, assert } = require('../harness');
const { linkOwner, ownsLink, RANK } = require('../../link-owner');

const appWith = (...providers) => ({
  plugins: { plugins: Object.fromEntries(providers.map((p) => [p.id, { api: { linker: p } }])) },
});

const provider = (id, precedence, claim) => ({ apiVersion: 1, id, precedence, claim });

describe('linkOwner', () => {
  it('gives the link to a binding over an index claim, whatever precedence says', () => {
    const code = provider('code-linker', 99, () => 'index');
    const ref = provider('reference-linker', 1, () => 'binding');
    assert.strictEqual(linkOwner(appWith(code, ref), 'file:///x/Spec.pdf', 'sec:Overview'), ref);
  });

  it('breaks an index-vs-index tie by precedence', () => {
    const code = provider('code-linker', 5, () => 'index');
    const ref = provider('reference-linker', 10, () => 'index');
    assert.strictEqual(linkOwner(appWith(code, ref), 'file:///x/Spec.pdf', ''), ref);
  });

  it('answers null when nobody claims the link', () => {
    const code = provider('code-linker', 5, () => null);
    assert.strictEqual(linkOwner(appWith(code), 'file:///elsewhere.txt', ''), null);
  });

  it('skips a peer whose claim throws', () => {
    const broken = provider('code-linker', 99, () => { throw new Error('boom'); });
    const ref = provider('reference-linker', 1, () => 'index');
    assert.strictEqual(linkOwner(appWith(broken, ref), 'file:///x/Spec.pdf', ''), ref);
  });
});
