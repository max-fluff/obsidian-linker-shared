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

describe('version drift', () => {
  it('an older provider without claim() never wins, and never crashes us', () => {
    const old = { apiVersion: 1, id: 'code-linker', precedence: 99 };
    const ref = provider('reference-linker', 1, () => 'index');
    assert.strictEqual(linkOwner(appWith(old, ref), 'file:///x/Spec.pdf', ''), ref);
  });

  it('a claim grade this version does not know is treated as no claim', () => {
    // A newer sibling may grow the RANK vocabulary; to this version that grade must read as
    // "no claim", not as a crash and not as an automatic win.
    const future = provider('code-linker', 99, () => 'exact-symbol-v2');
    const ref = provider('reference-linker', 1, () => 'index');
    assert.strictEqual(linkOwner(appWith(future, ref), 'file:///x/Spec.pdf', ''), ref);
  });

  it('ownsLink is false when only an older sibling is installed and nobody claims', () => {
    const self = provider('code-linker', 5, () => null);
    const old = { apiVersion: 1, id: 'reference-linker', precedence: 10 };
    assert.strictEqual(ownsLink(appWith(self, old), self, 'file:///x/Spec.pdf', ''), false);
  });

  it('RANK keeps binding above index — the grades older versions were built against', () => {
    assert.ok(RANK.binding > RANK.index);
  });
});
