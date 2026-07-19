'use strict';

// Peer discovery and span ownership between the linker plugins. Interop goes through
// `plugin.api` only — the documented way one Obsidian plugin talks to another.

const LINKER_API = 1;

// Every installed linker that speaks the contract, ourselves included. `app.plugins` is
// undocumented, so every shape is checked rather than trusted.
function discoverLinkers(app, opts) {
  const minVersion = (opts && opts.minVersion) || LINKER_API;
  const found = [];
  const plugins = app && app.plugins && app.plugins.plugins;
  if (!plugins) return found;
  for (const id of Object.keys(plugins)) {
    const plugin = plugins[id];
    const provider = plugin && plugin.api && plugin.api.linker;
    if (!provider || typeof provider.id !== 'string') continue;
    if (!(provider.apiVersion >= minVersion)) continue;
    found.push(provider);
  }
  return found;
}

// Ties break by id so both sides of the comparison reach the same answer.
function outranks(a, b) {
  if (a.precedence !== b.precedence) return (a.precedence || 0) > (b.precedence || 0);
  return String(a.id) < String(b.id);
}

// A peer that takes a span it will never draw leaves the word shown by nobody. `where` is
// `{ path, surface }`; a peer predating `drawsIn`, or one that throws, counts as drawing
// everywhere, which is what it did before the member existed.
function drawsHere(peer, where) {
  if (typeof peer.drawsIn !== 'function') return true;
  const w = where || {};
  try { return peer.drawsIn(w.path, w.surface) !== false; } catch (e) { return true; }
}

// Spans of `text` claimed by a linker that outranks `self` and is drawing here, sorted by
// start.
function foreignRanges(app, self, text, where) {
  const ranges = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || !outranks(peer, self)) continue;
    if (typeof peer.matches !== 'function' || !drawsHere(peer, where)) continue;
    let matches;
    // A broken peer costs us its ranges, not the highlighter.
    try { matches = peer.matches(text) || []; } catch (e) { matches = []; }
    for (const m of matches) {
      if (m && typeof m.start === 'number' && typeof m.end === 'number') ranges.push([m.start, m.end]);
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

// Whether [s, e) touches any of `ranges` (sorted by start).
function overlaps(ranges, s, e) {
  for (const [rs, re] of ranges) {
    if (rs >= e) break;
    if (re > s) return true;
  }
  return false;
}

function ownedMatches(app, self, text, matches, where) {
  if (!matches.length) return matches;
  const foreign = foreignRanges(app, self, text, where);
  if (!foreign.length) return matches;
  return matches.filter((m) => !overlaps(foreign, m.start, m.end));
}

// Candidates from the peers that yielded a span to us. Each opens and previews through its
// own plugin — we never interpret another linker's link format.
function yieldedCandidates(app, self, text, where) {
  const out = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || outranks(peer, self)) continue;
    if (typeof peer.matches !== 'function' || !drawsHere(peer, where)) continue;
    let matches;
    try { matches = peer.matches(text) || []; } catch (e) { matches = []; }
    for (const m of matches) {
      if (!m || typeof m.start !== 'number' || typeof m.end !== 'number') continue;
      out.push({
        start: m.start,
        end: m.end,
        label: m.label || m.target || '',
        target: m.target,
        // The id survives a round trip through a DOM attribute; the opener is looked up
        // again at click time.
        id: peer.id,
        source: peer.displayName || peer.id,
        // How this row reads in an ambiguity list, asked of its owner and only when a list is
        // actually drawn — every span on screen produces candidates, few are ever looked at.
        describe: (display) => {
          if (typeof peer.describe !== 'function') return null;
          try { return peer.describe(m.target, display); } catch (e) { return null; }
        },
        open: (sourcePath, newTab) => { if (typeof peer.open === 'function') peer.open(m.target, sourcePath, newTab); },
        hover: (event, targetEl, sourcePath, hoverParent) => {
          if (typeof peer.hover === 'function') peer.hover(m.target, event, targetEl, sourcePath, hoverParent);
        },
      });
    }
  }
  return out;
}

// Those of `candidates` that cover [s, e).
function candidatesFor(candidates, s, e) {
  return candidates.filter((c) => c.start < e && c.end > s);
}

// What the other linkers would suggest for a typed word. Obsidian gives the autocomplete
// popup to the first suggester that triggers and never asks the rest, so whoever is asked
// serves everyone's candidates.
function peerSuggestions(app, self, query, sourcePath) {
  const out = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || typeof peer.suggest !== 'function') continue;
    let items;
    try { items = peer.suggest(String(query || ''), sourcePath) || []; } catch (e) { items = []; }
    for (const it of items) {
      if (!it || typeof it.label !== 'string') continue;
      out.push({
        label: it.label,
        note: it.note || '',
        target: it.target,
        // null means "keep what the reader typed"; only the peer knows whether its
        // candidate matched an inflection or completed a prefix.
        display: it.display == null ? null : it.display,
        id: peer.id,
        source: peer.displayName || peer.id,
        precedence: peer.precedence || 0,
        // Answered by the row's owner, including whether to compose a link at all. A peer
        // that predates `insertFor` has only `linkFor`, which always links — the right
        // reading for a plugin with no plain-text mode to consult.
        insert: (display, inTable) => {
          if (typeof peer.insertFor === 'function') return peer.insertFor(it.target, display, inTable);
          return typeof peer.linkFor === 'function' ? peer.linkFor(it.target, display, inTable) : null;
        },
      });
    }
  }
  return out;
}

// Whether a sibling would also offer `kind` on this text. Asked before writing anything:
// an item already in Obsidian's menu cannot be pulled back out and reparented.
function peersOffering(app, self, kind, text) {
  const out = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || typeof peer.offers !== 'function') continue;
    let yes;
    try { yes = peer.offers(kind, text); } catch (e) { yes = false; }
    if (yes) out.push(peer);
  }
  return out;
}

function siblingLinkers(app, self) {
  return discoverLinkers(app).filter((p) => p.id !== self.id);
}

module.exports = { LINKER_API, discoverLinkers, outranks, drawsHere, foreignRanges, overlaps, ownedMatches, yieldedCandidates, candidatesFor, peerSuggestions, peersOffering, siblingLinkers };
