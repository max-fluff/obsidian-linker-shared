'use strict';

// Which linker a markdown link belongs to. The claim is graded: 'binding' means the link
// carries this plugin's binding anchor — the author said whose it is; 'index' means the url
// merely lands in this plugin's index, which two overlapping indexes can both say. A binding
// beats an index, and equal claims fall back to precedence — the same comparison prose spans
// use, so the two answers cannot contradict.

const { outranks, discoverLinkers } = require('./discover');

const RANK = { binding: 2, index: 1 };

// The provider that owns `target`, or null when no installed linker claims it.
function linkOwner(app, target, title) {
  let best = null;
  let bestRank = 0;
  for (const peer of discoverLinkers(app)) {
    if (typeof peer.claim !== 'function') continue;
    let claim;
    try { claim = peer.claim(target, title); } catch (e) { claim = null; }
    const rank = RANK[claim] || 0;
    if (!rank) continue;
    if (rank > bestRank || (rank === bestRank && best && outranks(peer, best))) {
      best = peer;
      bestRank = rank;
    }
  }
  return best;
}

// False both when a sibling owns the link and when nobody does — a link we don't recognise
// was never ours to act on.
function ownsLink(app, self, target, title) {
  const owner = linkOwner(app, target, title);
  return !!owner && owner.id === self.id;
}

module.exports = { linkOwner, ownsLink, RANK };
