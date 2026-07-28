'use strict';

const fs = require('fs');
const nodePath = require('path');
const { PathSuggestBase, suggestAvailable, SUGGEST_LIMIT } = require('../suggest-base');

// Path completion over the filesystem, which the sigil plugins point at — the vault knows
// nothing of it, so nothing here can come from the Vault API (prose/vault-suggest.js does
// that). Desktop only, which is what these plugins already declare. Options:
//   • getRoot() → a base the query is relative to; absent or '' means absolute paths.
//   • getSeed() → what absolute mode browses before a separator is typed.
//   • onSelect(path) → takes the pick instead of the input box keeping it.
//   • exts → picks files with those extensions, whole path at once; without it, folders,
//     walked one segment at a time like a shell completer.
class DiskPathSuggest extends PathSuggestBase {
  constructor(app, inputEl, opts) {
    const o = opts || {};
    super(app, inputEl, o.onSelect);
    this.getRoot = o.getRoot;
    this.getSeed = o.getSeed;
    this.exts = o.exts && o.exts.length ? new Set(o.exts.map((e) => e.toLowerCase())) : null;
  }

  entries(dir) {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (e) { return []; }
  }

  // Every wanted file under `base`, root-relative. Walked once per completer and kept: the
  // filtering runs per keystroke, and a document library is too big to re-read that often.
  files(base) {
    if (this.cache && this.cacheBase === base) return this.cache;
    const out = [];
    const walk = (dir, rel) => {
      let items = [];
      try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of items) {
        if (e.name[0] === '.') continue;
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(nodePath.join(dir, e.name), r);
        else if (this.exts.has(nodePath.extname(e.name).toLowerCase())) out.push(r);
      }
    };
    walk(base, '');
    this.cacheBase = base;
    this.cache = out.sort();
    return this.cache;
  }

  getSuggestions(query) {
    const base = this.getRoot ? this.getRoot() : '';
    if (this.exts) return this.match(this.files(base), query, SUGGEST_LIMIT);

    const q = String(query == null ? '' : query).replace(/\\/g, '/');
    const slash = q.lastIndexOf('/');
    const partial = (slash === -1 ? q : q.slice(slash + 1)).toLowerCase();
    const head = slash === -1 ? '' : q.slice(0, slash);

    let scanDir, prefix;
    if (base) {
      // Relative to the plugin's configured root; an empty query lists the root's own folders.
      scanDir = nodePath.join(base, head);
      prefix = head;
    } else if (slash === -1) {
      // Code-root field, no separator yet: browse the current default.
      scanDir = this.getSeed ? this.getSeed() : '';
      prefix = scanDir;
    } else {
      // Code-root field, an absolute path is being typed: navigate it.
      scanDir = head.endsWith(':') ? head + '/' : head;
      prefix = head;
    }
    if (!scanDir) return [];
    const stem = prefix.replace(/\/+$/, '');
    return this.entries(scanDir)
      .filter((name) => name.toLowerCase().includes(partial))
      .map((name) => (stem ? stem + '/' + name : name))
      .sort()
      .slice(0, SUGGEST_LIMIT);
  }
}

module.exports = { DiskPathSuggest, suggestAvailable };
