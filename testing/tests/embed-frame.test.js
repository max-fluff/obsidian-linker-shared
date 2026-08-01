'use strict';

// The block grammar both sigil embeds are written in: the first line is the target, the rest
// are the keys the plugin declares. What a toolbar writes back has to read the same way.

const { describe, it, assert } = require('../harness');
const { installStubs } = require('../stubs');

installStubs();
const { parseSpec, setSpecLine } = require('../../embed-frame');

const KEYS = ['page', 'zoom', 'title'];

describe('parseSpec', () => {
  it('takes the first non-empty line as the target', () => {
    assert.strictEqual(parseSpec('\n\npapers/report.pdf\n', KEYS).target, 'papers/report.pdf');
  });

  it('reads the declared keys, whatever their spacing or case', () => {
    const spec = parseSpec('a.pdf\nPage : 3\nzoom:150%', KEYS);
    assert.strictEqual(spec.page, '3');
    assert.strictEqual(spec.zoom, '150%');
  });

  it('leaves a key it was not told about to the target', () => {
    // A plugin's keys are its own: one linker's "lines:" is another's ordinary first line.
    const spec = parseSpec('lines: 4-9', KEYS);
    assert.strictEqual(spec.target, 'lines: 4-9');
    assert.strictEqual(spec.page, '');
  });

  it('gives every declared key a value, so a spec is never read as undefined', () => {
    const spec = parseSpec('a.pdf', KEYS);
    for (const k of KEYS) assert.strictEqual(spec[k], '');
  });

  it('keeps the first target when the block names several', () => {
    assert.strictEqual(parseSpec('a.pdf\nb.pdf', KEYS).target, 'a.pdf');
  });
});

describe('setSpecLine', () => {
  it('adds a line the block does not have yet', () => {
    assert.deepStrictEqual(setSpecLine(['a.pdf'], 'page', '7'), ['a.pdf', 'page: 7']);
  });

  it('replaces the line where it already stands', () => {
    assert.deepStrictEqual(setSpecLine(['a.pdf', 'page: 3', 'width: 800'], 'page', '7'),
      ['a.pdf', 'page: 7', 'width: 800']);
  });

  it('drops the line when the value is empty, which is how a pin is removed', () => {
    assert.deepStrictEqual(setSpecLine(['a.pdf', 'bind: sym:Old'], 'bind', ''), ['a.pdf']);
  });

  it('writes what parseSpec reads back', () => {
    const body = setSpecLine(setSpecLine(['a.pdf'], 'page', '7'), 'zoom', 'fit');
    const spec = parseSpec(body.join('\n'), KEYS);
    assert.strictEqual(spec.page, '7');
    assert.strictEqual(spec.zoom, 'fit');
    assert.strictEqual(spec.target, 'a.pdf');
  });
});
