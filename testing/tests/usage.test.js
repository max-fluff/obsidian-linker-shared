'use strict';

const { describe, it, assert } = require('../harness');
const { createUsageCache, foldUsageInto, scanCandidateWords, aggregateCandidates } = require('../../prose/usage');

const file = (path, mtime) => ({ path, stat: { mtime } });

// A compute that counts how often it actually ran per path, so a cache hit is observable.
function counting() {
  const runs = new Map();
  const compute = async (f) => { runs.set(f.path, (runs.get(f.path) || 0) + 1); return `v:${f.path}:${f.stat.mtime}`; };
  return { compute, runs };
}

describe('usage cache', () => {
  it('returns one result per file, in input order', async () => {
    const c = createUsageCache();
    const { compute } = counting();
    const out = await c.run([file('a', 1), file('b', 1)], 'sig', compute);
    assert.deepStrictEqual(out.map((r) => r.file.path), ['a', 'b']);
    assert.deepStrictEqual(out.map((r) => r.value), ['v:a:1', 'v:b:1']);
  });

  it('reuses a result while mtime and signature hold', async () => {
    const c = createUsageCache();
    const { compute, runs } = counting();
    await c.run([file('a', 1)], 'sig', compute);
    await c.run([file('a', 1)], 'sig', compute);
    assert.strictEqual(runs.get('a'), 1, 'recomputed an unchanged file');
  });

  it('recomputes when the file mtime moves', async () => {
    const c = createUsageCache();
    const { compute, runs } = counting();
    await c.run([file('a', 1)], 'sig', compute);
    const out = await c.run([file('a', 2)], 'sig', compute);
    assert.strictEqual(runs.get('a'), 2);
    assert.strictEqual(out[0].value, 'v:a:2');
  });

  it('recomputes when the signature changes', async () => {
    const c = createUsageCache();
    const { compute, runs } = counting();
    await c.run([file('a', 1)], 'sig1', compute);
    await c.run([file('a', 1)], 'sig2', compute);
    assert.strictEqual(runs.get('a'), 2, 'a new index version must not read a stale count');
  });

  it('drops entries for files absent from a later run', async () => {
    const c = createUsageCache();
    const { compute, runs } = counting();
    await c.run([file('a', 1), file('b', 1)], 'sig', compute);
    await c.run([file('b', 1)], 'sig', compute);      // 'a' out of scope now
    await c.run([file('a', 1)], 'sig', compute);      // ...so it must recompute, not hit
    assert.strictEqual(runs.get('a'), 2);
  });

  it('reports progress once per file, hit or miss', async () => {
    const c = createUsageCache();
    const { compute } = counting();
    const seen = [];
    await c.run([file('a', 1), file('b', 1)], 'sig', compute, (i, n) => seen.push([i, n]));
    await c.run([file('a', 1), file('b', 1)], 'sig', compute, (i, n) => seen.push([i, n]));
    assert.deepStrictEqual(seen, [[0, 2], [1, 2], [0, 2], [1, 2]]);
  });

  it('clear() forces the next run to recompute', async () => {
    const c = createUsageCache();
    const { compute, runs } = counting();
    await c.run([file('a', 1)], 'sig', compute);
    c.clear();
    await c.run([file('a', 1)], 'sig', compute);
    assert.strictEqual(runs.get('a'), 2);
  });
});

// A plugin stand-in with just what scanCandidateWords reaches for: one note's text, a
// trivial protector, and identity keys/lemma so a word's key is its lowercased self.
function scanPlugin(text) {
  return {
    app: { vault: { cachedRead: async () => text } },
    computeProtected: () => [],
    overlapsProtected: () => false,
    keysFor: (w) => [w.toLowerCase()],
    lemmaFor: (w) => w.toLowerCase(),
  };
}

describe('scanCandidateWords', () => {
  const never = () => false;

  it('groups surface forms under a lemma with a running total', async () => {
    const here = await scanCandidateWords(scanPlugin('Cat cat cats'), {}, 2, never);
    // identity lemma, so 'cat'/'cats' are two lemmas here; 'Cat' and 'cat' share one.
    assert.strictEqual(here.get('cat').total, 2);
    assert.deepStrictEqual([...here.get('cat').forms.entries()], [['Cat', 1], ['cat', 1]]);
  });

  it('skips bare numbers, short lemmas and words a term claims', async () => {
    const isTerm = (keys) => keys.includes('cat');
    const here = await scanCandidateWords(scanPlugin('cat dog 42 ok a'), {}, 2, isTerm);
    assert.ok(!here.has('cat'), 'a term word is not a candidate');
    assert.ok(!here.has('42'), 'a bare number is dropped');
    assert.ok(!here.has('a'), 'a lemma shorter than minLen is dropped');
    assert.ok(here.has('dog') && here.has('ok'));
  });
});

describe('aggregateCandidates', () => {
  const perNote = (map) => ({ value: new Map(Object.entries(map).map(([l, c]) => [l, { forms: new Map([[l, c]]), total: c }])) });

  it('keeps a lemma only once it spans minNotes notes, ranked by spread then total', () => {
    const results = [perNote({ wide: 1, rare: 5 }), perNote({ wide: 1 }), perNote({ wide: 1 })];
    const out = aggregateCandidates(results, 2);
    assert.deepStrictEqual(out.map((c) => c.lemma), ['wide'], 'rare appears in one note, below minNotes');
    assert.strictEqual(out[0].docFreq, 3);
    assert.strictEqual(out[0].count, 3);
  });

  it('caps the list at 100', () => {
    const one = {};
    for (let i = 0; i < 150; i++) one['w' + i] = 1;
    assert.strictEqual(aggregateCandidates([perNote(one)], 1).length, 100);
  });
});

describe('foldUsageInto', () => {
  it('adds per-note counts into the skeleton and drops unknown ids', () => {
    const counts = new Map([['A', { id: 'A', count: 0, files: [] }]]);
    const results = [
      { file: { path: 'n1.md' }, value: new Map([['A', 2], ['ghost', 9]]) },
      { file: { path: 'n2.md' }, value: new Map([['A', 1]]) },
    ];
    foldUsageInto(counts, results);
    assert.strictEqual(counts.get('A').count, 3);
    assert.deepStrictEqual(counts.get('A').files, [{ path: 'n1.md', count: 2 }, { path: 'n2.md', count: 1 }]);
    assert.ok(!counts.has('ghost'), 'a count for an unknown id is ignored');
  });
});
