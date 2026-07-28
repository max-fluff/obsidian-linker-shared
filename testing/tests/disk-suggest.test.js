'use strict';

// Tested against a real tree — this repo's own, which holds folders and .js files side by
// side. Two modes: folders walked a segment at a time, or files offered whole-path at once.

const path = require('path');
const { describe, it, assert } = require('../harness');
require('../stubs').installStubs();
const { DiskPathSuggest } = require('../../deeplink/disk-suggest');

const ROOT = path.join(__dirname, '..', '..');
const make = (opts) => new DiskPathSuggest({}, {}, Object.assign({ getRoot: () => ROOT }, opts));

describe('DiskPathSuggest picking folders', () => {
  it('offers subfolders and never a file', () => {
    const names = make().getSuggestions('');
    assert.ok(names.includes('deeplink'), `folders missing from ${names.join(', ')}`);
    assert.ok(!names.includes('binding.js'), 'a file was offered to a folder picker');
  });
});

describe('DiskPathSuggest picking files', () => {
  const files = (q) => make({ exts: ['.js'] }).getSuggestions(q);

  it('offers a file by its root-relative path, so the folder rides along', () => {
    assert.ok(files('').includes('deeplink/disk-suggest.js'), 'a nested file was not offered');
  });

  it('never offers a folder on its own', () => {
    assert.ok(!files('').includes('deeplink'), 'a folder was offered as an answer');
  });

  it('matches anywhere in the path, not only the file name', () => {
    assert.ok(files('deeplink/disk').includes('deeplink/disk-suggest.js'));
    assert.ok(files('disk-sug').includes('deeplink/disk-suggest.js'));
  });

  it('leaves out files of other extensions', () => {
    assert.ok(!files('').some((p) => p.endsWith('.md')), 'an unwanted extension was offered');
  });

  it('ignores the case an extension is written in', () => {
    assert.ok(make({ exts: ['.JS'] }).getSuggestions('').includes('binding.js'));
  });

  // .git and .obsidian are pure waste to walk, and nobody keeps a bibliography in them.
  it('does not descend into dot-folders', () => {
    assert.ok(!files('').some((p) => p.startsWith('.')), 'a dot-folder was walked');
  });

  it('is empty for a root it cannot read rather than throwing', () => {
    const s = new DiskPathSuggest({}, {}, { getRoot: () => path.join(ROOT, 'no-such-folder'), exts: ['.js'] });
    assert.deepStrictEqual(s.getSuggestions(''), []);
  });

  it('hands the relative path over, so nothing absolute is ever stored', () => {
    const taken = [];
    const s = new DiskPathSuggest({}, { trigger() {} }, { getRoot: () => ROOT, onSelect: (p) => taken.push(p), exts: ['.js'] });
    s.setValue = () => {};
    s.close = () => {};
    s.selectSuggestion('deeplink/disk-suggest.js');
    assert.deepStrictEqual(taken, ['deeplink/disk-suggest.js']);
  });
});
