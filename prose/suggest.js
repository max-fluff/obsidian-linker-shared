'use strict';

// One autocomplete popup holding every linker's candidates.
//
// Obsidian gives the popup to the first registered suggester whose onTrigger returns a
// context and never asks the rest. So a word both prose linkers know used to show only one
// plugin's answers, and which one depended on plugin load order — invisible to the reader
// and not something they could change.
//
// Rather than fight over the slot, both plugins build the same complete list: whoever is
// asked first owns the popup and shows everyone's candidates. Deciding the owner by
// precedence instead would look tidier and behave worse — the higher-ranked plugin can
// decline for reasons only it knows (out of scope, cursor in a protected range, its own
// suggest setting off), and a plugin that stepped aside for it would leave the reader with
// no popup at all.

const { peerSuggestions } = require('../discover');

// `own` is this plugin's own candidates, already ranked. Returns them unchanged when no
// sibling is installed, so a solo vault behaves exactly as it did.
//
// A peer that outranks us goes above our own list: that is where the priority setting
// becomes visible while typing, rather than only in the highlighting.
function mergeSuggestions(plugin, query, own, limit = 8) {
  const provider = plugin.api && plugin.api.linker;
  if (!provider) return own;
  const foreign = peerSuggestions(plugin.app, provider, query);
  if (!foreign.length) return own;
  const mine = provider.precedence || 0;
  const above = foreign.filter((f) => f.precedence > mine);
  const below = foreign.filter((f) => f.precedence <= mine);
  return [...above, ...own, ...below].slice(0, limit);
}

module.exports = { mergeSuggestions };
