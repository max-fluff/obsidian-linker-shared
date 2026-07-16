'use strict';

// What a link is pinned to, stored in its markdown title: [text](url "sym:Name kind:class").
//
// The binding lives in the title, never in the link text, so the text stays prose — call a
// link "the service" and it still tracks. It also keeps the slot ours: a title without a
// known token is the reader's own tooltip, so a binding that no longer resolves can only
// mean the code changed. That is what lets a lost binding be reported without crying wolf.
//
// Anchors are requirements and combine by intersection, so you pin as tightly as you mean:
//   sym:Name    — something called Name sits there
//   kind:class  — what sits there is a class (an interface, a method…)
//   line:<hash> — the line's trimmed text still hashes to <hash>
// Resolving them needs an index and belongs to the plugin; everything here is text.

const TOKEN = /^(sym|kind|line):(.+)$/;

// The line a url points at: the last :<digits> before the end. Relative paths carry no
// colon, so it's unambiguous. Not global, so replace() only touches that one number.
const LINE_RE = /:(\d+)(?=\D*$)/;

// FNV-1a (32-bit), base36 — short enough to sit in a title unnoticed. It keys a map built
// per file, so the only collisions that could matter are within one file.
function hashLine(text) {
  let h = 0x811c9dc5;
  const s = String(text || '').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// The binding a title declares as { sym, kind, hash }, or null when the title isn't ours.
// Every word must be a known token: one stray word means it's a tooltip, and a tooltip
// must never be read as a binding that went missing.
function parseBinding(title) {
  const s = String(title || '').trim();
  if (!s) return null;
  const b = { sym: '', kind: '', hash: '' };
  for (const word of s.split(/\s+/)) {
    const m = TOKEN.exec(word);
    if (!m) return null;
    b[m[1] === 'line' ? 'hash' : m[1]] = m[2];
  }
  return b.sym || b.kind || b.hash ? b : null;
}

// Written back out. Order is fixed so re-pinning doesn't churn the text.
function formatBinding(b) {
  const parts = [];
  if (b.sym) parts.push('sym:' + b.sym);
  if (b.kind) parts.push('kind:' + b.kind);
  if (b.hash) parts.push('line:' + b.hash);
  return parts.join(' ');
}

// What the lines a binding still matches say about the line it's stored at: null when it
// sits on one of them, else where it moved to, or that it's gone. Sitting on any match is
// enough — two same-named methods need no telling apart. Code moves in small hops, so the
// nearest match is the one it moved to; exact certainty isn't on offer.
function bindStateFrom(hits, storedLine) {
  if (hits.includes(storedLine)) return null;
  if (!hits.length) return { state: 'broken' };
  const line = hits.reduce((a, n) => (Math.abs(n - storedLine) < Math.abs(a - storedLine) ? n : a));
  return { state: 'stale', line };
}

module.exports = { LINE_RE, hashLine, parseBinding, formatBinding, bindStateFrom };
