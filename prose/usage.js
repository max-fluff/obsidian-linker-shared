'use strict';

// A per-note scan cache for the usage reports the prose linkers build. Reading every
// in-scope note on each rescan is the cost; this reuses a note's result while its file mtime
// and the caller's signature both hold. The caller owns compute(file) and its return value.

function createUsageCache() {
  let store = new Map(); // path -> { mtime, signature, value }
  return {
    // Returns [{ file, value }] in input order; onFile(i, total) fires per file, hit or miss.
    // A file absent from a later run drops from the cache, so a shrinking scope can't leak.
    async run(files, signature, compute, onFile) {
      const next = new Map();
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (onFile) onFile(i, files.length);
        const mtime = (file && file.stat && file.stat.mtime) || 0;
        const prev = store.get(file.path);
        const value = prev && prev.signature === signature && prev.mtime === mtime
          ? prev.value
          : await compute(file);
        next.set(file.path, { mtime, signature, value });
        out.push({ file, value });
      }
      store = next;
      return out;
    },
    clear() { store = new Map(); },
  };
}

// Fold per-note usage counts into a report skeleton keyed by term id. Each `counts` entry
// carries its own `.count` and `.files`; the plugin builds the skeleton (its term id and
// fields differ) and this only adds the numbers. Unknown ids — a link to a stale term —
// are dropped. `results` is what a usage cache run returns.
function foldUsageInto(counts, results) {
  for (const { file, value: here } of results) {
    for (const [id, n] of here) {
      const entry = counts.get(id);
      if (!entry) continue;
      entry.count += n;
      entry.files.push({ path: file.path, count: n });
    }
  }
  return counts;
}

// Read one note for the candidate scan: how often each surface word's lemma appears, with
// the forms behind it, skipping numbers, protected spans and words `isTermWord(keys, raw)`
// claims (already a term, or excluded). Returns lemma -> { forms: Map<surface, count>, total, keys }.
async function scanCandidateWords(plugin, file, minLen, isTermWord) {
  const here = new Map();
  let text;
  try { text = await plugin.app.vault.cachedRead(file); } catch (e) { return here; }
  const protect = plugin.computeProtected(text);
  for (const m of text.matchAll(/[\p{L}\p{Nd}]+/gu)) {
    const raw = m[0];
    if (/^\p{Nd}+$/u.test(raw)) continue;
    if (plugin.overlapsProtected(protect, m.index, m.index + raw.length)) continue;
    const keys = plugin.keysFor(raw);
    if (isTermWord(keys, raw)) continue;
    const lemma = plugin.lemmaFor(raw);
    if (lemma.length < minLen) continue;
    let g = here.get(lemma);
    if (!g) { g = { forms: new Map(), total: 0, keys: new Set() }; here.set(lemma, g); }
    g.forms.set(raw, (g.forms.get(raw) || 0) + 1);
    g.total++;
    for (const k of keys) g.keys.add(k);
  }
  return here;
}

// Lemmas whose words share a key join one candidate, as the matcher joins them into one term:
// lemma() cannot see that dormice is dormouse.
function aggregateCandidates(results, minNotes) {
  const groups = new Map(); // lemma -> { forms, total, notes }
  const parent = new Map();
  const root = (l) => {
    while (parent.get(l) !== l) { parent.set(l, parent.get(parent.get(l))); l = parent.get(l); }
    return l;
  };
  const ownerOfKey = new Map();
  results.forEach(({ value: here }, note) => {
    for (const [lemma, g] of here) {
      let all = groups.get(lemma);
      if (!all) { all = { forms: new Map(), total: 0, notes: new Set() }; groups.set(lemma, all); parent.set(lemma, lemma); }
      for (const [form, n] of g.forms) all.forms.set(form, (all.forms.get(form) || 0) + n);
      all.total += g.total;
      all.notes.add(note);
      for (const k of g.keys) {
        const other = ownerOfKey.get(k);
        if (other === undefined) ownerOfKey.set(k, lemma);
        else parent.set(root(lemma), root(other));
      }
    }
  });
  const merged = new Map(); // root lemma -> { forms, total, notes }
  for (const [lemma, g] of groups) {
    const r = root(lemma);
    let m = merged.get(r);
    if (!m) { m = { forms: new Map(), total: 0, notes: new Set() }; merged.set(r, m); }
    for (const [form, n] of g.forms) m.forms.set(form, (m.forms.get(form) || 0) + n);
    m.total += g.total;
    for (const n of g.notes) m.notes.add(n);
  }
  const out = [];
  for (const [lemma, g] of merged) {
    if (g.notes.size < minNotes) continue;
    let display = lemma, best = -1;
    for (const [form, n] of g.forms) if (n > best) { best = n; display = form; }
    out.push({ lemma, display, forms: [...g.forms.keys()], count: g.total, docFreq: g.notes.size });
  }
  out.sort((a, b) => b.docFreq - a.docFreq || b.count - a.count);
  return out.slice(0, 100);
}

module.exports = { createUsageCache, foldUsageInto, scanCandidateWords, aggregateCandidates };
