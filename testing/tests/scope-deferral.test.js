'use strict';

// You only stand down for a plugin actually working here. `matches` says what it knows,
// `drawsIn` whether it draws on this surface of this note; yield on the first alone and the
// word ends up shown by nobody.

const { describe, it, assert } = require('../harness');
const { ownedMatches, yieldedCandidates, peerSuggestions } = require('../../discover');

const SPAN = { start: 0, end: 4, label: 'word', target: 'Word' };

// A peer that knows the word everywhere, but only works outside "Out/" and never in reading.
function peer(id, precedence, extra) {
  return Object.assign({
    apiVersion: 1,
    id,
    displayName: id,
    precedence,
    matches: () => [SPAN],
    drawsIn: (sourcePath, surface) => {
      if (sourcePath && sourcePath.startsWith('Out/')) return false;
      return surface !== 'reading';
    },
  }, extra || {});
}

const appWith = (...providers) => {
  const plugins = {};
  for (const p of providers) plugins[p.id] = { api: { linker: p } };
  return { plugins: { plugins } };
};

const self = { apiVersion: 1, id: 'z-linker', displayName: 'z', precedence: 10 };
const app = () => appWith(peer('a-linker', 99), self);

describe('yielding a span', () => {
  it('stands down where the higher-ranked sibling is working', () => {
    assert.deepStrictEqual(
      ownedMatches(app(), self, 'word', [SPAN], { path: 'In/note.md', surface: 'editing' }), []);
  });

  it('keeps the span in a note that sibling does not cover', () => {
    assert.deepStrictEqual(
      ownedMatches(app(), self, 'word', [SPAN], { path: 'Out/note.md', surface: 'editing' }), [SPAN]);
  });

  it('keeps the span on a surface that sibling does not draw on', () => {
    // The half that a scope check alone misses: in scope, knows the word, draws nothing here.
    assert.deepStrictEqual(
      ownedMatches(app(), self, 'word', [SPAN], { path: 'In/note.md', surface: 'reading' }), [SPAN]);
  });

  it('still yields when nobody said where', () => {
    // An older caller passes no context; the peer answers as it did before the member existed.
    assert.deepStrictEqual(ownedMatches(app(), self, 'word', [SPAN]), []);
  });

  it('treats a sibling that predates drawsIn as drawing everywhere', () => {
    const old = peer('a-linker', 99);
    delete old.drawsIn;
    assert.deepStrictEqual(
      ownedMatches(appWith(old, self), self, 'word', [SPAN], { path: 'Out/note.md', surface: 'reading' }), []);
  });

  it('keeps the span when a sibling throws deciding', () => {
    const broken = peer('a-linker', 99, { drawsIn: () => { throw new Error('boom'); } });
    // A peer that cannot answer is assumed to draw, which is the pre-member behaviour — it
    // may not silently lose its spans because it threw.
    assert.deepStrictEqual(
      ownedMatches(appWith(broken, self), self, 'word', [SPAN], { path: 'In/note.md', surface: 'reading' }), []);
  });

  it('does not collect a reading from a sibling that is not working here', () => {
    const lower = peer('a-linker', 1, { open: () => {}, hover: () => {} });
    const two = appWith(lower, self);
    assert.strictEqual(yieldedCandidates(two, self, 'word', { path: 'In/note.md', surface: 'menu' }).length, 1);
    assert.deepStrictEqual(yieldedCandidates(two, self, 'word', { path: 'Out/note.md', surface: 'menu' }), []);
  });

  it('lets the sibling caption its own row', () => {
    // A list of one word's meanings has to say which is which, and only the plugin that owns
    // a target knows whether it is a heading in a file, a term, or something else.
    const lower = peer('a-linker', 1, { describe: (target) => ({ title: target, note: 'Term' }) });
    const [row] = yieldedCandidates(appWith(lower, self), self, 'word', { path: 'In/note.md', surface: 'menu' });
    assert.deepStrictEqual(row.describe(), { title: 'Word', note: 'Term' });
  });

  it('says nothing rather than guessing for a sibling that cannot describe itself', () => {
    const lower = peer('a-linker', 1);
    const [row] = yieldedCandidates(appWith(lower, self), self, 'word', { path: 'In/note.md', surface: 'menu' });
    assert.strictEqual(row.describe(), null);
  });
});

describe('merging suggestions', () => {
  it('tells the sibling which note is being typed in', () => {
    const seen = [];
    const asked = {
      apiVersion: 1, id: 'a-linker', displayName: 'a', precedence: 99,
      suggest: (query, sourcePath) => { seen.push(sourcePath); return []; },
    };
    peerSuggestions(appWith(asked, self), self, 'spa', 'In/note.md');
    assert.deepStrictEqual(seen, ['In/note.md'], 'the peer was asked without a note');
  });

  it('survives a sibling that predates the argument', () => {
    const older = {
      apiVersion: 1, id: 'a-linker', displayName: 'a', precedence: 99,
      suggest: () => [{ label: 'Spawning', note: '', target: 'Spawning', display: 'Spawning' }],
      linkFor: (target, display) => `[[${target}|${display}]]`,
    };
    assert.strictEqual(peerSuggestions(appWith(older, self), self, 'spa', 'In/note.md').length, 1);
  });
});

// The editor stores a span's foreign candidates as JSON on the element, so this is the one
// path where a row is rebuilt rather than carried as a closure. It is where a caption went
// missing: the rebuilt row had no way back to the peer that owns it.
describe('foreign candidates rebuilt from the editor attribute', () => {
  const { createHighlight } = require('../../prose/highlight');
  const mixin = createHighlight({ cls: 'x', displayName: 'X', targetOf: (m) => m.target, selfIdFor: () => null });

  const withPeer = (extra) => {
    const lower = peer('a-linker', 1, extra);
    return Object.assign(Object.create(mixin), { app: appWith(lower, self) });
  };
  const RAW = JSON.stringify([{ id: 'a-linker', label: 'Word', source: 'A Linker', target: 'Word' }]);

  it('asks the peer to caption its own row', () => {
    const plugin = withPeer({ describe: (target) => ({ title: target, note: 'Term' }) });
    const [row] = plugin.foreignFromAttr(RAW, 'In/note.md', false);
    assert.deepStrictEqual(row.describe(), { title: 'Word', note: 'Term' });
  });

  it('says nothing when the peer is gone or cannot describe itself', () => {
    assert.strictEqual(withPeer().foreignFromAttr(RAW, 'In/note.md', false)[0].describe(), null);
    const orphan = Object.assign(Object.create(mixin), { app: appWith(self) });
    assert.strictEqual(orphan.foreignFromAttr(RAW, 'In/note.md', false)[0].describe(), null);
  });

  it('survives a peer that throws while describing', () => {
    const plugin = withPeer({ describe: () => { throw new Error('boom'); } });
    assert.strictEqual(plugin.foreignFromAttr(RAW, 'In/note.md', false)[0].describe(), null);
  });

  it('reads a damaged attribute as no candidates', () => {
    assert.deepStrictEqual(withPeer().foreignFromAttr('{not json', '', false), []);
    assert.deepStrictEqual(withPeer().foreignFromAttr('', '', false), []);
  });
});
