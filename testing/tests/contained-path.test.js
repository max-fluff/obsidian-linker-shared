'use strict';

// What a note may make a sigil plugin read: only what is under the root, or what the user
// indexed. A note that names "../../.ssh/id_rsa" must get nothing (code-linker issue #2).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, assert } = require('../harness');
const { containedPath, isInside } = require('../../contained-path');

// <tmp>/root holds the code; <tmp>/secret.txt sits beside it, where a note must not reach.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'linker-contain-'));
const root = path.join(tmp, 'root');
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'one\ntwo\n');
fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret\n');

// A directory link inside the root that leads out of it. 'junction' needs no privilege on
// Windows and is ignored elsewhere; if the OS still refuses, that one case is skipped.
let linked = false;
try {
  fs.symlinkSync(tmp, path.join(root, 'out'), 'junction');
  linked = true;
} catch { /* no links here */ }

describe('containedPath', () => {
  it('passes a file under the root', () => {
    assert.strictEqual(containedPath(root, 'src/a.ts', false), path.join(root, 'src', 'a.ts'));
  });

  it('refuses a path that climbs out with ..', () => {
    assert.strictEqual(containedPath(root, '../secret.txt', false), null);
    assert.strictEqual(containedPath(root, 'src/../../secret.txt', false), null);
    // Backslashes separate only on Windows; elsewhere they are part of a file name.
    if (path.sep === '\\') {
      assert.strictEqual(containedPath(root, 'src\\..\\..\\secret.txt', false), null);
    }
  });

  it('refuses an absolute path', () => {
    assert.strictEqual(containedPath(root, path.join(tmp, 'secret.txt'), false), null);
  });

  it('refuses a link inside the root that points out of it', () => {
    if (!linked) return;
    assert.strictEqual(containedPath(root, 'out/secret.txt', false), null);
  });

  it('refuses the root itself and an unset root', () => {
    assert.strictEqual(containedPath(root, '.', false), null);
    assert.strictEqual(containedPath(root, '', false), null);
    assert.strictEqual(containedPath('', 'src/a.ts', false), null);
  });

  it('lets an indexed file through even beside the root', () => {
    // A scan folder may be "../lib": what the user chose to index is theirs to embed.
    assert.strictEqual(containedPath(root, '../secret.txt', true), path.join(tmp, 'secret.txt'));
  });

  it('judges a missing file by its spelling', () => {
    const missing = path.join(root, 'src', 'missing.ts');
    assert.strictEqual(containedPath(root, 'src/missing.ts', false), missing);
    assert.strictEqual(containedPath(root, '../missing.ts', false), null);
  });
});

describe('isInside', () => {
  it('takes a name that merely starts with dots as inside', () => {
    assert.strictEqual(isInside(root, path.join(root, '..foo')), true);
  });

  it('refuses a sibling whose name extends the root', () => {
    assert.strictEqual(isInside(root, root + '-evil'), false);
  });
});
