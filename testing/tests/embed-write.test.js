'use strict';

// Putting an embed's own block back into its note: through the open editor when it is the
// block's note, through the vault otherwise, and never at line numbers that have since moved.

const { describe, it, assert } = require('../harness');
const { installStubs } = require('../stubs');

installStubs();
const { writeEmbedBody } = require('../../embed-frame');

const NOTE = ['# Title', '```code-link', 'src/Player.cs:9', 'bind: sym:Old', '```', 'tail'].join('\n');
// The shape getSectionInfo gives: lineStart is the opening fence, lineEnd the closing one.
const INFO = { text: NOTE, lineStart: 1, lineEnd: 4 };
const BODY = ['src/Player.cs:16', 'bind: sym:New'];

function harness(onDisk, activeView) {
  let stored = onDisk;
  const file = { path: 'note.md' };
  const app = {
    workspace: { getActiveViewOfType: () => activeView || null },
    vault: {
      getAbstractFileByPath: (p) => (p === file.path ? file : null),
      process: async (f, fn) => { stored = fn(stored); return stored; },
    },
  };
  return { app, stored: () => stored };
}

function fakeView(notePath) {
  const calls = [];
  return { file: { path: notePath }, editor: { replaceRange: (...a) => calls.push(a) }, calls };
}

describe('writing an embed body back', () => {
  it('rewrites the block through the vault when no editor is open', async () => {
    const h = harness(NOTE);
    assert.strictEqual(await writeEmbedBody(h.app, 'note.md', INFO, BODY), true);
    assert.strictEqual(h.stored(), ['# Title', '```code-link', 'src/Player.cs:16', 'bind: sym:New', '```', 'tail'].join('\n'));
  });

  it('leaves the fence lines themselves alone', async () => {
    const h = harness(NOTE);
    await writeEmbedBody(h.app, 'note.md', INFO, BODY);
    const lines = h.stored().split('\n');
    assert.strictEqual(lines[1], '```code-link');
    assert.strictEqual(lines[4], '```');
  });

  it('writes nothing when the note changed since the embed was drawn', async () => {
    // A line inserted above shifts the block: splicing at the old numbers would eat the
    // wrong lines, which is what reading the file separately from writing it used to do.
    const moved = 'inserted\n' + NOTE;
    const h = harness(moved);
    assert.strictEqual(await writeEmbedBody(h.app, 'note.md', INFO, BODY), false);
    assert.strictEqual(h.stored(), moved);
  });

  it('does not type into whichever note happens to be active', async () => {
    const view = fakeView('other.md');
    const h = harness(NOTE, view);
    await writeEmbedBody(h.app, 'note.md', INFO, BODY);
    assert.deepStrictEqual(view.calls, [], 'edited the note the user was looking at');
    assert.ok(h.stored().includes('src/Player.cs:16'), 'the embed’s own note was left unwritten');
  });

  it('uses the open editor when it is the embed’s own note', async () => {
    const view = fakeView('note.md');
    const h = harness(NOTE, view);
    await writeEmbedBody(h.app, 'note.md', INFO, BODY);
    assert.strictEqual(view.calls.length, 1);
    assert.strictEqual(h.stored(), NOTE, 'wrote through the vault as well as the editor');
  });

  it('reports a note it cannot find rather than writing somewhere else', async () => {
    const h = harness(NOTE);
    assert.strictEqual(await writeEmbedBody(h.app, 'gone.md', INFO, BODY), false);
    assert.strictEqual(h.stored(), NOTE);
  });
});
