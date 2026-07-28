'use strict';

const { describe, it, assert } = require('../harness');
const { createUsageCache } = require('../../prose/usage');

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
