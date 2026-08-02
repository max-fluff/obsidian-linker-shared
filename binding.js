'use strict';

// What a link is pinned to, stored in its markdown title: [text](url "sym:Name kind:class").
// The binding lives in the title, never in the link text, so the text stays prose. Anchors
// are requirements and combine by intersection; resolving them needs an index and belongs to
// the plugin — everything here is text.

// Every anchor, listed in the order formatBinding writes them. `token` is the word in the
// title, `field` the name it parses into, `owner` the plugin that may act on it; all three are
// wire format and frozen (see CONTRIBUTING). One more anchor is one more row here — spelling
// it in five places is how the five drifted apart.
const ANCHOR_LIST = [
  { token: 'sym', field: 'sym', owner: 'code' },
  { token: 'kind', field: 'kind', owner: 'code' },
  { token: 'cite', field: 'cite', owner: 'reference' },
  { token: 'sec', field: 'sec', owner: 'reference' },
  // A hash is base36 already, so it is the one value written through unescaped.
  { token: 'line', field: 'hash', owner: 'code', raw: true },
];

const ANCHORS = {};
const FIELDS = [];
// Who a binding belongs to: code writes sym/kind/line, documents write sec/cite, and the
// format predates ownership — notes written before it keep working untouched. A binding mixing
// both sides is owned by nobody, so no plugin acts on a binding it can't fully resolve.
const OWNERS = {};
for (const a of ANCHOR_LIST) {
  ANCHORS[a.token] = a.field;
  FIELDS.push(a.field);
  (OWNERS[a.owner] = OWNERS[a.owner] || []).push(a.field);
}
const TOKEN = new RegExp('^(' + ANCHOR_LIST.map((a) => a.token).join('|') + '):(.+)$');

function ownerOf(binding) {
  if (!binding) return null;
  const claimed = Object.keys(OWNERS).filter((owner) => OWNERS[owner].some((anchor) => binding[anchor]));
  return claimed.length === 1 ? claimed[0] : null;
}

// The owner a markdown title declares, or null when the title is a reader's tooltip, an
// empty binding, or a mix no single plugin owns.
const bindingOwner = (title) => ownerOf(parseBinding(title));

// Whether `title` carries a binding this plugin may act on. The guard every consumer
// should reach for instead of a bare parseBinding() truthiness check.
const ownsBinding = (title, owner) => bindingOwner(title) === owner;

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
  const b = {};
  for (const f of FIELDS) b[f] = '';
  for (const word of s.split(/\s+/)) {
    const m = TOKEN.exec(word);
    if (!m) return null;
    b[ANCHORS[m[1]]] = decodeValue(m[2]);
  }
  return FIELDS.some((f) => b[f]) ? b : null;
}

// Written back out, order fixed so re-pinning doesn't churn the text.
function formatBinding(b) {
  const parts = [];
  for (const a of ANCHOR_LIST) {
    const v = b[a.field];
    if (v) parts.push(a.token + ':' + (a.raw ? v : encodeValue(v)));
  }
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

module.exports = { LINE_RE, PAGE_RE, ANCHORS, OWNERS, hashLine, parseBinding, formatBinding, bindStateFrom, ownerOf, bindingOwner, ownsBinding };
