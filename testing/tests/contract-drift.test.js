'use strict';

// What must hold no matter which versions of these plugins share a vault.
//
// Every plugin bundles its own copy of this submodule, so the sibling next to you was built
// from some other commit — older than yours, or newer. That is a supported configuration, not
// an error, and it is the one case whose breakage you cannot see while you work: it happens
// in someone else's vault, with a combination you never installed.
//
// So this file is the promise, not the behaviour. Which spans get owned, how precedence
// moves, what a menu offers — all of that is meant to change between releases and is tested
// elsewhere. What is frozen is that a peer missing a member contributes nothing instead of
// crashing, that a grade this version has never heard of reads as no claim, and that the
// grades older versions were built against keep their order.
//
// Changing anything here means older siblings stop working. That is the LINKER_API bump the
// contributing guide talks about, and the price is that they stop seeing you entirely.

const { describe, it, assert } = require('../harness');
const {
  ownedMatches, siblingLinkers, yieldedCandidates, peersOffering, peerSuggestions,
} = require('../../discover');
const { linkOwner, ownsLink, RANK } = require('../../link-owner');

const appWith = (...providers) => {
  const plugins = {};
  for (const p of providers) plugins[p.id] = { api: { linker: p } };
  return { plugins: { plugins } };
};

const provider = (id, precedence, extra) =>
  Object.assign({ id, apiVersion: 1, precedence, matches: () => [] }, extra || {});

describe('a sibling built before the newer members', () => {
  // The shape of an earlier release: id, precedence, matches, open — no offers, suggest,
  // hover, insertFor, describe, drawsIn or claim.
  const oldPeer = (precedence = 30) => ({
    apiVersion: 1,
    id: 'glossary-linker',
    precedence,
    matches: () => [{ start: 0, end: 5, label: 'Spawn', target: 'Spawn' }],
    open: () => {},
  });

  it('still wins a span from us — ownership predates every newer member', () => {
    const self = provider('heading-linker', 20);
    assert.deepStrictEqual(
      ownedMatches(appWith(self, oldPeer()), self, 'Spawn point', [{ start: 0, end: 5 }]), []);
  });

  it('offers no menu entries, so ours stay flat instead of grouping against nothing', () => {
    const self = provider('heading-linker', 20);
    assert.deepStrictEqual(peersOffering(appWith(self, oldPeer()), self, 'convert', 'Spawn'), []);
  });

  it('merges no suggestions, leaving our own popup as it was', () => {
    const self = provider('heading-linker', 20);
    assert.deepStrictEqual(peerSuggestions(appWith(self, oldPeer()), self, 'spa'), []);
  });

  it('yields us a span whose hover and caption are safely inert', () => {
    const self = provider('heading-linker', 20);
    const got = yieldedCandidates(appWith(self, oldPeer(10)), self, 'Spawn point');
    assert.strictEqual(got.length, 1);
    assert.doesNotThrow(() => got[0].hover({}, {}, '', {}));
    assert.strictEqual(got[0].describe(), null, 'invented a caption for a peer that has none');
  });

  it('is taken to draw everywhere, since it cannot be asked', () => {
    // drawsIn arrived after it shipped. Assuming "draws nothing" would silently strip every
    // span it owns; assuming "draws everywhere" is what happened before the member existed.
    const self = provider('heading-linker', 20);
    assert.deepStrictEqual(
      ownedMatches(appWith(self, oldPeer()), self, 'Spawn point', [{ start: 0, end: 5 }],
        { path: 'Any/note.md', surface: 'reading' }), []);
  });

  it('never wins a link without claim(), and never crashes us', () => {
    const old = { apiVersion: 1, id: 'code-linker', precedence: 99 };
    const ref = provider('reference-linker', 1, { claim: () => 'index' });
    assert.strictEqual(linkOwner(appWith(old, ref), 'file:///x/Spec.pdf', ''), ref);
  });

  it('leaves ownsLink false when nobody claims', () => {
    const self = provider('code-linker', 5, { claim: () => null });
    const old = { apiVersion: 1, id: 'reference-linker', precedence: 10 };
    assert.strictEqual(ownsLink(appWith(self, old), self, 'file:///x/Spec.pdf', ''), false);
  });
});

describe('a sibling built after us', () => {
  it('is just a peer, whatever else it carries', () => {
    const future = provider('glossary-linker', 10, { apiVersion: 7, teleport: () => { throw new Error('never'); } });
    const self = provider('heading-linker', 20);
    assert.deepStrictEqual(siblingLinkers(appWith(self, future), self).map((p) => p.id), ['glossary-linker']);
  });

  it('claims a grade we have never heard of, and it reads as no claim', () => {
    const future = provider('code-linker', 99, { claim: () => 'exact-symbol-v2' });
    const ref = provider('reference-linker', 1, { claim: () => 'index' });
    assert.strictEqual(linkOwner(appWith(future, ref), 'file:///x/Spec.pdf', ''), ref);
  });
});

describe('the grades older versions were built against', () => {
  it('keeps binding above index', () => {
    assert.ok(RANK.binding > RANK.index);
  });
});
