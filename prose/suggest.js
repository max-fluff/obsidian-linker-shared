'use strict';

// One autocomplete popup holding every linker's candidates. Obsidian gives the popup to the
// first suggester that triggers and never asks the rest, so whoever is asked serves the
// whole family rather than yielding the slot.

const { peerSuggestions } = require('../discover');

// `own` is this plugin's candidates, already ranked. Peers that outrank us go above them —
// the priority setting made visible while typing.
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
