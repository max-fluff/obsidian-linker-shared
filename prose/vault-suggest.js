'use strict';

const { TFolder } = require('obsidian');
const { PathSuggestBase, suggestAvailable, SUGGEST_LIMIT } = require('../suggest-base');

// Completers over the vault's own index, which Obsidian already holds in memory — so each is
// only the question "which files count". Paths on disk are deeplink/disk-suggest.js.

const isFolder = (f) => f instanceof TFolder;

class VaultFolderSuggest extends PathSuggestBase {
  getSuggestions(query) {
    return this.match(this.app.vault.getAllLoadedFiles().filter(isFolder), query, SUGGEST_LIMIT);
  }
}

class VaultFileSuggest extends PathSuggestBase {
  getSuggestions(query) {
    return this.match(this.app.vault.getMarkdownFiles(), query, SUGGEST_LIMIT);
  }
}

// For the include/exclude lists, which accept either. Folders rank first, being the coarser
// choice, so the cap is applied after the sort rather than before it.
class VaultPathSuggest extends PathSuggestBase {
  getSuggestions(query) {
    return this.match(this.app.vault.getAllLoadedFiles().filter((f) => f.path), query, 0)
      .sort((a, b) => (isFolder(a) === isFolder(b) ? a.path.localeCompare(b.path) : isFolder(a) ? -1 : 1))
      .slice(0, SUGGEST_LIMIT);
  }
}

module.exports = { VaultFolderSuggest, VaultFileSuggest, VaultPathSuggest, suggestAvailable };
