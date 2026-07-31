'use strict';

const nodePath = require('path');
const { describe, it, assert } = require('../harness');
const { watchTree, joinRel } = require('../../fs-watch');

// A filesystem stand-in: a tree of directories, and a watch() that records what was armed
// and lets a test fire a directory's callback. `recursiveThrows` simulates Linux (no
// recursive watch); `armCode` makes every non-recursive watch fail with that errno.
function fakeFs(dirs, { recursiveThrows = true, armCode = null } = {}) {
  const tree = new Set(dirs);
  const registered = [];
  const err = (code) => Object.assign(new Error(code), { code });
  return {
    tree,
    registered,
    add: (dir) => tree.add(dir),
    watch(dir, a, b) {
      const recursive = a && typeof a === 'object' && a.recursive;
      const cb = typeof a === 'function' ? a : b;
      if (recursive) { if (recursiveThrows) throw err('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'); }
      else if (armCode) throw err(armCode);
      const w = { dir, cb, closed: false, close() { this.closed = true; } };
      registered.push(w);
      return w;
    },
    existsSync: (d) => tree.has(d),
    statSync: (p) => { if (!tree.has(p)) throw err('ENOENT'); return { isDirectory: () => true }; },
    readdirSync: (d) => [...tree]
      .filter((p) => nodePath.dirname(p) === d)
      .map((p) => ({ name: nodePath.basename(p), isDirectory: () => true })),
  };
}

const R = nodePath.join('C:', 'root');
const A = nodePath.join(R, 'a');
const B = nodePath.join(A, 'b');
const NM = nodePath.join(R, 'node_modules');
const notNodeModules = (rel) => !rel.split('/').includes('node_modules');

describe('joinRel', () => {
  it('appends a filename to a scan-root-relative prefix, in posix form', () => {
    assert.strictEqual(joinRel('', 'a.ts'), 'a.ts');
    assert.strictEqual(joinRel('src', 'sub\\a.ts'), 'src/sub/a.ts');
    assert.strictEqual(joinRel('src', ''), 'src', 'no filename keeps the prefix');
  });
});

describe('watchTree recursive path', () => {
  it('arms a single recursive watcher and maps its events to a rel', () => {
    const fs = fakeFs([R], { recursiveThrows: false });
    const events = [];
    watchTree([{ dir: R, rel: '' }], { onEvent: (rel, f) => events.push([rel, f]), fsImpl: fs });
    assert.strictEqual(fs.registered.length, 1, 'one recursive watcher, no tree walk');
    fs.registered[0].cb('change', nodePath.join('sub', 'a.ts'));
    assert.deepStrictEqual(events, [['sub/a.ts', 'sub/a.ts']]);
  });
});

describe('watchTree Linux fallback', () => {
  it('walks the tree and watches each directory, skipping pruned folders', () => {
    const fs = fakeFs([R, A, B, NM]);
    let unsupported = 0;
    watchTree([{ dir: R, rel: '' }], { onEvent: () => {}, onUnsupported: () => { unsupported++; }, shouldDescend: notNodeModules, fsImpl: fs });
    assert.deepStrictEqual(fs.registered.map((w) => w.dir), [R, A, B], 'watched the tree, not node_modules');
    assert.strictEqual(unsupported, 1, 'noted the fallback once');
  });

  it('reports a nested change with its full rel', () => {
    const fs = fakeFs([R, A, B, NM]);
    const events = [];
    watchTree([{ dir: R, rel: '' }], { onEvent: (rel, f) => events.push([rel, f]), shouldDescend: notNodeModules, fsImpl: fs });
    fs.registered.find((w) => w.dir === B).cb('change', 'x.ts');
    assert.deepStrictEqual(events, [['a/b/x.ts', 'x.ts']]);
  });

  it('starts watching a subdirectory created after the fact', () => {
    const fs = fakeFs([R, A, B, NM]);
    watchTree([{ dir: R, rel: '' }], { onEvent: () => {}, shouldDescend: notNodeModules, fsImpl: fs });
    const before = fs.registered.length;
    const C = nodePath.join(A, 'c');
    fs.add(C);                                   // the new directory now exists on disk
    fs.registered.find((w) => w.dir === A).cb('rename', 'c');
    assert.strictEqual(fs.registered.length, before + 1, 'armed a watcher for the new subdir');
    assert.strictEqual(fs.registered[fs.registered.length - 1].dir, C);
  });

  it('degrades with a notice when watches run out', () => {
    const fs = fakeFs([R, A], { armCode: 'ENOSPC' });
    let unsupported = 0;
    watchTree([{ dir: R, rel: '' }], { onEvent: () => {}, onUnsupported: () => { unsupported++; }, shouldDescend: notNodeModules, fsImpl: fs });
    assert.strictEqual(unsupported, 1, 'ENOSPC is reported once, not thrown');
  });
});

describe('watchTree close', () => {
  it('closes every armed watcher', () => {
    const fs = fakeFs([R, A, B, NM]);
    const h = watchTree([{ dir: R, rel: '' }], { onEvent: () => {}, shouldDescend: notNodeModules, fsImpl: fs });
    h.close();
    assert.ok(fs.registered.every((w) => w.closed), 'left a watcher open');
  });
});
