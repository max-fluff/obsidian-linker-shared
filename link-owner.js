'use strict';

// Deciding which linker a markdown link belongs to.
//
// The sigil pair both recognise links by resolving the url against their own index. That
// works alone and breaks together: when the two indexes cover the same file — a pdf sitting
// under a scanned code root, say — both plugins recognise the same link, and the reader gets
// "Copy code link" and "Copy reference link" side by side, plus two Unpins that do different
// things to the same text. Nothing in the menu says which is which.
//
// A link has one meaning, so it gets one owner and only the owner offers actions on it.
//
// The claim is graded, because the two ways of recognising a link are not equally sure:
//
//   'binding' — the link carries a binding anchor that belongs to this plugin (`sec:` is
//               reference's, `sym:`/`kind:`/`line:`/`hash:` are code's). The author wrote it;
//               there is nothing to argue about.
//   'index'   — the url merely lands in this plugin's index. True of both plugins at once
//               whenever their roots overlap, which is exactly the case that misfires.
//
// So a binding beats an index every time, and two equal claims fall back to precedence —
// the same comparison ownership of prose spans uses, so the two answers can't contradict.

const { outranks, discoverLinkers } = require('./discover');

const RANK = { binding: 2, index: 1 };

// The provider that owns `target`, or null when no installed linker claims it.
//
// `self` is our own provider. Peers are asked through `claim`, which a provider publishes
// alongside `matches`; a peer that doesn't publish one simply never wins, which leaves the
// solo behaviour of an older sibling intact rather than breaking it.
function linkOwner(app, self, target, title) {
  let best = null;
  let bestRank = 0;
  for (const peer of discoverLinkers(app)) {
    if (typeof peer.claim !== 'function') continue;
    let claim;
    // A peer throwing must not cost us our own menu items.
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

// Whether this link is ours to act on. False both when a sibling owns it and when nobody
// does — a link we don't recognise was never ours to begin with.
function ownsLink(app, self, target, title) {
  const owner = linkOwner(app, self, target, title);
  return !!owner && owner.id === self.id;
}

module.exports = { linkOwner, ownsLink, RANK };
