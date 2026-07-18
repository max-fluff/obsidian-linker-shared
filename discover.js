'use strict';

// Finding the other linker plugins and deciding who owns a span.
//
// Two linkers that highlight prose will sooner or later match the same word. Left alone
// both decorate it: two underlines in the editor, and in reading view whichever
// post-processor happened to run first. So a span gets one owner, and the loser skips it.
//
// Discovery goes through `plugin.api`, the documented way one Obsidian plugin exposes
// itself to another — no globals, nothing registered behind the app's back. A plugin with
// no peers installed finds only itself and behaves exactly as it did before any of this.
//
// Precedence is each plugin's own setting, but the comparison reads the *published* value
// of the other side rather than assuming anything. That is what keeps the verdict
// symmetric: both plugins compare the same two numbers and reach the same answer. If each
// merely preferred itself, both would draw and the double underline would be back.

const LINKER_API = 1;

// Every installed linker that speaks the contract, ourselves included. `app.plugins` is not
// part of the documented API surface, so every step is guarded: a shape we don't recognise
// is simply not a peer.
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

// Whether `a` outranks `b`. Equal precedence falls back to the id so the answer is still
// the same on both sides — a tie must not be broken by "whoever is asking".
function outranks(a, b) {
  if (a.precedence !== b.precedence) return (a.precedence || 0) > (b.precedence || 0);
  return String(a.id) < String(b.id);
}

// Spans of `text` claimed by a linker that outranks `self`, sorted by start. The caller
// drops its own matches that overlap one of these.
//
// This runs the other plugin's matcher over the same text, so it costs a second pass — it
// is called per visible range, not per match, and not at all when nothing outranks us.
function foreignRanges(app, self, text) {
  const ranges = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || !outranks(peer, self)) continue;
    if (typeof peer.matches !== 'function') continue;
    let matches;
    // A peer throwing must not take the highlighter down with it: worst case we draw a
    // span they also drew, which is the old behaviour, not a crash.
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

// The matches left after a higher-ranked linker has taken its share. Returns the list
// untouched when there is nothing to defer to, which is the solo case.
function ownedMatches(app, self, text, matches) {
  if (!matches.length) return matches;
  const foreign = foreignRanges(app, self, text);
  if (!foreign.length) return matches;
  return matches.filter((m) => !overlaps(foreign, m.start, m.end));
}

// Candidates from the peers that yielded a span to us.
//
// Ownership decides who *draws* a word, which has to be one plugin or the underline doubles.
// It should not decide what the word can mean: a term the other linker knows is still a real
// answer, and dropping it silently would make the winner look like the only reading. So the
// owner collects what the others stood down on and offers the lot in one choice.
//
// Each candidate carries its own open(), so the peer resolves its own target — we never
// interpret another plugin's link format.
function yieldedCandidates(app, self, text) {
  const out = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || outranks(peer, self)) continue;
    if (typeof peer.matches !== 'function') continue;
    let matches;
    try { matches = peer.matches(text) || []; } catch (e) { matches = []; }
    for (const m of matches) {
      if (!m || typeof m.start !== 'number' || typeof m.end !== 'number') continue;
      out.push({
        start: m.start,
        end: m.end,
        label: m.label || m.target || '',
        target: m.target,
        // The peer's id travels with the candidate so it can survive a round trip through a
        // DOM attribute — the editor decoration carries candidates as data, and the opener
        // is looked up again at click time.
        id: peer.id,
        source: peer.displayName || peer.id,
        open: (sourcePath, newTab) => { if (typeof peer.open === 'function') peer.open(m.target, sourcePath, newTab); },
        // The peer previews its own target: only it knows whether that means a note, a
        // heading anchor or something else. A peer too old to publish this simply has no
        // preview in the list, which is the behaviour it had before the list existed.
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

// What the other linkers would suggest for a typed word.
//
// Obsidian hands the autocomplete popup to the FIRST registered suggester whose onTrigger
// returns a context and never asks the rest, so a word both linkers know used to show only
// one plugin's answers — and which one depended on plugin load order, which the reader
// cannot see or change.
//
// The fix is not to fight over the slot but to fill it completely: whoever is asked first
// claims it and adds everyone else's candidates to its own list. Deciding the winner by
// precedence instead would be tidier on paper and worse in practice — the higher-ranked
// plugin can decline for reasons only it knows (out of scope, cursor inside a protected
// range, its own suggest setting off), and a plugin that stood aside for it would leave the
// reader with no popup at all.
//
// Unlike the span candidates in yieldedCandidates, these carry a live `insert` closure: a
// suggestion is used within one popup, not parked in a DOM attribute to be resolved later.
function peerSuggestions(app, self, query) {
  const out = [];
  for (const peer of discoverLinkers(app)) {
    if (peer.id === self.id || typeof peer.suggest !== 'function') continue;
    let items;
    // A peer that throws costs us its suggestions, not our own popup.
    try { items = peer.suggest(String(query || '')) || []; } catch (e) { items = []; }
    for (const it of items) {
      if (!it || typeof it.label !== 'string') continue;
      out.push({
        label: it.label,
        note: it.note || '',
        target: it.target,
        // What the inserted link should read. null (or absent) means "keep whatever the
        // reader typed" — the peer says which, because only it knows whether its candidate
        // matched an inflection of the typed word or completed a prefix of it.
        display: it.display == null ? null : it.display,
        id: peer.id,
        source: peer.displayName || peer.id,
        precedence: peer.precedence || 0,
        // The peer builds its own link text: nobody else should have to know whether a
        // target is a term title or a File#Heading.
        insert: (display, inTable) => (typeof peer.linkFor === 'function' ? peer.linkFor(it.target, display, inTable) : null),
      });
    }
  }
  return out;
}

// Whether a sibling would also offer `kind` on this text — used to decide whether a menu
// entry needs grouping before either plugin has written anything.
//
// Grouping cannot be decided after the fact: once an item is in Obsidian's menu it cannot be
// pulled back out and reparented. So the question has to be asked up front, and asking the
// sibling directly is the only way to get a truthful answer — "a sibling is installed" is not
// the same as "a sibling has something to say about this selection", and grouping on the
// former leaves submenus holding a single item.
//
// A peer that publishes no `offers` is assumed to contribute nothing, which keeps us flat
// rather than wrapping a lone item in a pointless submenu.
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

// Peers other than us, for settings UI that should stay hidden in a solo vault.
//
// Every linker, not just the ones of our own `kind`. Precedence is one number per plugin and
// one order across the family: it is only ever *consulted* when two plugins claim the same
// thing, so listing a plugin that happens never to contest us costs nothing, while splitting
// the setting per kind would mean two half-orders the reader has to hold separately.
function siblingLinkers(app, self) {
  return discoverLinkers(app).filter((p) => p.id !== self.id);
}

// Ordering the family and the settings control for it live in ./precedence.js — this file
// answers "who wins here?", that one answers "where do we sit, and how do we move?".

module.exports = { LINKER_API, discoverLinkers, outranks, foreignRanges, overlaps, ownedMatches, yieldedCandidates, candidatesFor, peerSuggestions, peersOffering, siblingLinkers };
