'use strict';

// The vault completers read Obsidian's own index, so the vault here is a plain fake. What is
// worth guarding is the ranking and the cap: an unbounded list was what this once returned.

const { describe, it, assert } = require('../harness');
require('../stubs').installStubs();
const { TFolder } = require('obsidian');
const { VaultFolderSuggest, VaultFileSuggest, VaultPathSuggest } = require('../../prose/vault-suggest');

const folder = (path) => Object.assign(new TFolder(), { path, children: [] });
const file = (path) => ({ path });

const FILES = [folder('Notes'), folder('Notes/Glossary'), file('Notes/term.md'), file('Readme.md')];
const appWith = (files) => ({
  vault: {
    getAllLoadedFiles: () => files,
    getMarkdownFiles: () => files.filter((f) => !(f instanceof TFolder)),
  },
});

const suggest = (Cls, files) => new Cls(appWith(files || FILES), {});

describe('VaultFolderSuggest', () => {
  it('offers folders and never a file', () => {
    const paths = suggest(VaultFolderSuggest).getSuggestions('').map((f) => f.path);
    assert.deepStrictEqual(paths, ['Notes', 'Notes/Glossary']);
  });

  it('matches anywhere in the path, ignoring case', () => {
    assert.deepStrictEqual(suggest(VaultFolderSuggest).getSuggestions('gloss').map((f) => f.path), ['Notes/Glossary']);
  });

  it('caps the list, which a vault of many folders would otherwise flood', () => {
    const many = Array.from({ length: 80 }, (_, i) => folder('f' + i));
    assert.strictEqual(suggest(VaultFolderSuggest, many).getSuggestions('').length, 50);
  });
});

describe('VaultFileSuggest', () => {
  it('offers notes and never a folder', () => {
    assert.deepStrictEqual(suggest(VaultFileSuggest).getSuggestions('').map((f) => f.path), ['Notes/term.md', 'Readme.md']);
  });
});

describe('VaultPathSuggest', () => {
  it('ranks folders before files, the coarser choice first', () => {
    const paths = suggest(VaultPathSuggest).getSuggestions('').map((f) => f.path);
    assert.deepStrictEqual(paths, ['Notes', 'Notes/Glossary', 'Notes/term.md', 'Readme.md']);
  });

  // Capping before the sort would drop every folder past the cut and rank what is left.
  it('caps after ranking, so folders survive a long list', () => {
    const many = Array.from({ length: 80 }, (_, i) => file('z' + i + '.md')).concat([folder('Notes')]);
    assert.strictEqual(suggest(VaultPathSuggest, many).getSuggestions('')[0].path, 'Notes');
  });
});

describe('picking one', () => {
  it('hands the path over and clears the box when onSelect is given', () => {
    const taken = [];
    const s = new VaultPathSuggest(appWith(FILES), { trigger() {} }, (p) => taken.push(p));
    s.setValue = (v) => { s.value = v; };
    s.close = () => {};
    s.selectSuggestion(folder('Notes'));
    assert.deepStrictEqual(taken, ['Notes']);
    assert.strictEqual(s.value, '');
  });

  it('writes the path back into the box when it is not', () => {
    const s = new VaultFolderSuggest(appWith(FILES), { trigger() {} });
    s.setValue = (v) => { s.value = v; };
    s.close = () => {};
    s.selectSuggestion(folder('Notes'));
    assert.strictEqual(s.value, 'Notes');
  });
});
