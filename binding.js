'use strict';

// What a link is pinned to, stored in its markdown title: [text](url "sym:Name kind:class").
//
// The binding lives in the title, never in the link text, so the text stays prose — call a
// link "the service" and it still tracks. It also keeps the slot ours: a title without a
// known token is the reader's own tooltip, so a binding that no longer resolves can only
// mean the target changed. That is what lets a lost binding be reported without crying wolf.
//
// Anchors are requirements and combine by intersection. Each plugin uses the ones it can
// resolve: sym/kind/line for code (a declaration on a line), sec for documents (a section
// in a PDF outline). Resolving them needs an index and belongs to the plugin; everything
// here is text. The stored position — a line, a page — is the plugin's too; bindStateFrom
// works in plain numbers.

const ANCHORS = { sym: 'sym', kind: 'kind', sec: 'sec', line: 'hash' };
const TOKEN = /^(sym|kind|sec|line):(.+)$/;

const LINE_RE = /:(\d+)(?=\D*$)/;   // the line a code url points at
const PAGE_RE = /#page=(\d+)/i;     // the page a document url points at

// A value shares the title's space, and the title sits in a markdown destination — so a
// space, a quote or a paren in a section name would break parsing. Escape just those (and %
// itself) as %XX; letters, digits, Cyrillic, apostrophes stay readable. Reversible, so any
// name round-trips.
const encodeValue = (v) => String(v).replace(/[%"()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
const decodeValue = (v) => v.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// FNV-1a (32-bit), base36 — short enough to sit in a title unnoticed.
function hashLine(text) {
  let h = 0x811c9dc5;
  const s = String(text || '').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// The binding a title declares, or null when it isn't ours. Every word must be a known
// token: one stray word means it's a tooltip, which must never read as a binding gone missing.
function parseBinding(title) {
  const s = String(title || '').trim();
  if (!s) return null;
  const b = { sym: '', kind: '', sec: '', hash: '' };
  for (const word of s.split(/\s+/)) {
    const m = TOKEN.exec(word);
    if (!m) return null;
    b[ANCHORS[m[1]]] = decodeValue(m[2]);
  }
  return b.sym || b.kind || b.sec || b.hash ? b : null;
}

// Written back out, order fixed so re-pinning doesn't churn the text.
function formatBinding(b) {
  const parts = [];
  if (b.sym) parts.push('sym:' + encodeValue(b.sym));
  if (b.kind) parts.push('kind:' + encodeValue(b.kind));
  if (b.sec) parts.push('sec:' + encodeValue(b.sec));
  if (b.hash) parts.push('line:' + b.hash);
  return parts.join(' ');
}

// Where the matches leave a binding stored at `stored`: null when it sits on one, the
// nearest match when it drifted, or broken when nothing matches. Sitting on any match is
// enough — two same-named spots need no telling apart.
function bindStateFrom(hits, stored) {
  if (hits.includes(stored)) return null;
  if (!hits.length) return { state: 'broken' };
  const line = hits.reduce((a, n) => (Math.abs(n - stored) < Math.abs(a - stored) ? n : a));
  return { state: 'stale', line };
}

module.exports = { LINE_RE, PAGE_RE, hashLine, parseBinding, formatBinding, bindStateFrom };
