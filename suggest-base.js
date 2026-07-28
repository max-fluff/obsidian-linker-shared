'use strict';

const { AbstractInputSuggest } = require('obsidian');

// What every path completer in the family shares: how a row reads, what picking one does, and
// the substring-and-cap. Only where the paths come from differs — the vault's own index
// (prose/vault-suggest.js) or the filesystem (deeplink/disk-suggest.js) — so that is all a
// subclass writes. Nothing here may reach for `fs`: the prose plugins run on mobile too.
class PathSuggestBase extends AbstractInputSuggest {
  constructor(app, inputEl, onSelect) {
    super(app, inputEl);
    this.app = app;
    this.inputEl = inputEl;
    this.onSelect = onSelect;
  }

  // A vault completer deals in TFile/TFolder, a disk one in plain paths.
  pathOf(item) {
    return typeof item === 'string' ? item : item.path;
  }

  match(items, query, limit) {
    const q = String(query == null ? '' : query).replace(/\\/g, '/').toLowerCase();
    const hit = items.filter((i) => this.pathOf(i).toLowerCase().includes(q));
    return limit ? hit.slice(0, limit) : hit;
  }

  renderSuggestion(item, el) {
    el.setText(this.pathOf(item) || '/');
  }

  // onSelect clears the box instead of keeping the pick: the folder-list editor adds it as a
  // row rather than binding the input to one value.
  selectSuggestion(item) {
    const path = this.pathOf(item);
    if (this.onSelect) { this.onSelect(path); this.setValue(''); this.close(); return; }
    this.setValue(path);
    this.inputEl.trigger('input');
    this.close();
  }
}

// AbstractInputSuggest landed after the plugins' minAppVersion, so callers feature-detect
// before constructing.
const suggestAvailable = () => typeof AbstractInputSuggest === 'function';

// How many rows a completer offers. More than this is a list nobody reads.
const SUGGEST_LIMIT = 50;

module.exports = { PathSuggestBase, suggestAvailable, SUGGEST_LIMIT };
