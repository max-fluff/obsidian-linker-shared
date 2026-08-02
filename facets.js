'use strict';

// One place per way of addressing an index entry. A facet projects an entry to a value, and
// that one projection answers both questions the sigil plugins used to answer apart: which
// entries a typed filter keeps, and what a link pins to. Declaring a facet lights up both.
//
// How a facet is typed follows from how many values it has. An enumerable one — a language, a
// kind — is written as the value alone (`py:`, `def:`), since the value says which facet is
// meant. An unbounded one — a citation key, a section name — is written after its own token
// (`cite:knuth1984`) and redirects what the rest of the query is matched against.

const { ANCHORS } = require('./binding');

const VALUE = 'value';
const TOKEN = 'token';

const byName = (facets, name) => facets.find((f) => f.name === name) || null;

// Split "py:def:Foo" into the restrictions it names and the text left over. Leading
// colon-separated parts are consumed while each is recognised; the first that isn't starts the
// text, so a name may hold colons of its own. A token facet ends the run and takes the rest as
// what to match, because its value is unbounded and cannot be told from a name.
function parseQuery(raw, facets) {
  const values = {};
  let field = null;
  const parts = String(raw == null ? '' : raw).split(':');
  let i = 0;
  for (; i < parts.length - 1; i++) {
    const named = facets.find((f) => f.typed === TOKEN && f.name === parts[i]);
    if (named) { field = named.name; i += 1; break; }
    let hit = null;
    for (const f of facets) {
      if (f.typed !== VALUE) continue;
      const v = f.resolve(parts[i]);
      if (v != null) { hit = { name: f.name, value: v }; break; }
    }
    if (!hit) break;
    values[hit.name] = hit.value;
  }
  // `name` is what the suggest matches; `field` says what it is matched against.
  return { values, field, name: parts.slice(i).join(':') };
}

// Whether an entry survives the parsed restrictions. Naming a token facet restricts too: a
// query matched against section names is asking for entries that have one, so `sec:` on its
// own still means every section.
function passes(entry, parsed, facets) {
  for (const name of Object.keys(parsed.values)) {
    const f = byName(facets, name);
    if (f && f.of(entry) !== parsed.values[name]) return false;
  }
  if (parsed.field) {
    const f = byName(facets, parsed.field);
    if (f && !f.of(entry)) return false;
  }
  return true;
}

// What the typed text is matched against: the redirected facet's value, or the entry's name.
function matchText(entry, parsed, facets) {
  const f = parsed.field ? byName(facets, parsed.field) : null;
  return f ? f.of(entry) : entry.name;
}

// The binding an entry pins to, keyed by the field its title stores it under. Only facets that
// declare an anchor take part: one without is a way to find an entry, not a way to hold onto it.
// An anchor whose value comes from somewhere other than an entry — a spot in a file — has no
// projection here and is left to whoever knows what it reads.
function bindingFrom(entry, facets) {
  const b = {};
  for (const f of facets) {
    if (!f.anchor || !f.of) continue;
    const v = f.of(entry);
    if (v) b[ANCHORS[f.anchor]] = v;
  }
  return b;
}

// The entries a parsed query names, for a caller that resolves a whole query rather than
// filtering a set it already has. A token facet redirects what the text means, so looking the
// text up as an entry name would find nothing — an embed asking for `cite:key` means the
// document that key names, not a document called "key".
function entriesFor(plugin, parsed, facets) {
  if (!parsed.field) return plugin.entriesByName(parsed.name);
  const want = String(parsed.name || '').toLowerCase();
  if (!want) return [];
  // A facet reading a field that may be absent answers undefined; that is no match, not a throw.
  return plugin.index.filter((e) => String(matchText(e, parsed, facets) || '').toLowerCase() === want);
}

module.exports = { VALUE, TOKEN, parseQuery, passes, matchText, bindingFrom, entriesFor };
