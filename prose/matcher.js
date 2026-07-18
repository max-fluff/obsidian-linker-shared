'use strict';

// Finding term occurrences in prose, shared by the two prose linkers. The scan is shared;
// building the index is not — a glossary term is a note, a heading term is "File#Heading",
// different data models. An index candidate must carry { words, wordCount } plus the
// plugin's own fields.
//
// createMatcher(config):
//   idOf(c)             identity for dedup and for the alternatives list
//   selfIdOf(c)         what a candidate is compared against to keep a note from linking
//                       to itself (a file basename for headings, the term title for glossary)
//   fieldsOf(c)         the plugin-specific fields copied onto a match result
//   accepts(plugin, m)  optional extra veto once a candidate has matched
//   caseFits(plugin, c, surface)  optional case rule; heading uses it for acronyms

// Ranges that must never be linked, whatever the plugin. `%%` protects both: heading keeps
// its aliases inside those comments, so linking there would corrupt them.
const PROTECT = [
  /```[\s\S]*?```/g,
  /~~~[\s\S]*?~~~/g,
  /`[^`\n]+`/g,
  /%%[\s\S]*?%%/g,
  /\[\[[^\]]*\]\]/g,
  /\[[^\]]*\]\([^)]*\)/g,
  /(?:https?:\/\/|www\.)\S+/g,
];

// The same spans as PROTECT, but anchored to one line — what isProtectedAt tests.
const PROTECT_INLINE = [
  /`[^`\n]+`/g,
  /%%[^%\n]*%%/g,
  /\[\[[^\]]*\]\]/g,
  /\[[^\]]*\]\([^)]*\)/g,
  /(?:https?:\/\/|www\.)\S+/g,
];

const frontmatterEnd = (text) => {
  if (!/^---\r?\n/.test(text)) return -1;
  const end = text.indexOf('\n---', 3);
  return end === -1 ? -1 : end + 4;
};

function inMatch(line, col, re) {
  let m;
  while ((m = re.exec(line)) !== null) {
    if (col > m.index && col < m.index + m[0].length) return true;
  }
  return false;
}

function createMatcher(config) {
  const { idOf, selfIdOf, fieldsOf } = config;
  const accepts = config.accepts || (() => true);
  const caseFits = config.caseFits || (() => true);

  return {
    // Keys for a word: the union from every language that claims it (same-script
    // languages overlap); words no language claims fall back to the exact form.
    keysFor(word) {
      const cacheKey = word.toLowerCase();
      if (!this.keysCache) this.keysCache = new Map();
      const cached = this.keysCache.get(cacheKey);
      if (cached) return cached;

      const out = [];
      const seen = new Set();
      for (const lang of this.activeLanguages) {
        if (!lang.match(word)) continue;
        for (const k of lang.keys(word, this.settings.matchMode)) {
          if (!seen.has(k)) { seen.add(k); out.push(k); }
        }
      }
      if (!out.length) out.push(cacheKey);
      this.keysCache.set(cacheKey, out);
      return out;
    },

    tokenizeForm(form) {
      const words = [...form.matchAll(/[\p{L}\p{Nd}]+/gu)].map((m) => m[0]);
      return words.map((raw) => ({ raw, keys: this.keysFor(raw) }));
    },

    // Every term id whose form matches `text`, `except` one. Runs the same scan as the
    // highlighter, so collisions agree with what actually gets linked.
    termsMatchingText(text, except) {
      const out = new Set();
      for (const m of this.findMatches(text, null)) {
        out.add(idOf(m));
        if (m.alts) for (const a of m.alts) out.add(a);
      }
      if (except) out.delete(except);
      return [...out];
    },

    // `selfId` identifies the note being scanned when it is itself a term source; its own
    // entries are skipped so a note doesn't link to itself.
    findMatches(text, selfId, opts = {}) {
      const protect = opts.protect ? this.computeProtected(text) : null;
      const tokens = [...text.matchAll(/[\p{L}\p{Nd}]+/gu)]
        .map((m) => {
          const raw = m[0];
          return { raw, start: m.index, end: m.index + raw.length, keys: this.keysFor(raw) };
        });

      const results = [];
      let i = 0;
      while (i < tokens.length) {
        const tk = tokens[i];
        const cands = [];
        const seen = new Set();
        for (const k of tk.keys) {
          const bucket = this.index.byKey.get(k);
          if (!bucket) continue;
          for (const c of bucket) { if (!seen.has(c)) { seen.add(c); cands.push(c); } }
        }

        // Does candidate c fit at token i? Multi-word terms must be contiguous with
        // only spaces/hyphens between, and every word's keys must overlap.
        const fits = (c) => {
          const wc = c.wordCount;
          if (i + wc > tokens.length) return false;
          for (let k = 0; k < wc; k++) {
            const t2 = tokens[i + k];
            const w = c.words[k];
            if (k > 0) {
              const between = text.slice(tokens[i + k - 1].end, t2.start);
              if (/[^\s-]/.test(between)) return false;
            }
            const t2keys = k === 0 ? t2.keys : this.keysFor(t2.raw);
            if (!t2keys.some((kk) => w.keys.includes(kk))) return false;
          }
          return caseFits(this, c, text.slice(tokens[i].start, tokens[i + wc - 1].end));
        };

        let matched = null;
        let sorted = null;
        if (cands.length) {
          sorted = cands.length > 1 ? cands.slice().sort((a, b) => b.wordCount - a.wordCount) : cands;
          for (const c of sorted) {
            if (fits(c)) { matched = { c, start: tokens[i].start, end: tokens[i + c.wordCount - 1].end, wc: c.wordCount }; break; }
          }
        }

        if (matched && selfIdOf(matched.c) !== selfId) {
          const inProtected = protect && this.overlapsProtected(protect, matched.start, matched.end);
          if (accepts(this, matched, tk) && !inProtected) {
            // The other terms matching the same span, left for the reader to resolve.
            let alts = null;
            if (sorted.length > 1) {
              const seenId = new Set([idOf(matched.c)]);
              for (const c of sorted) {
                if (c.wordCount !== matched.wc || seenId.has(idOf(c))) continue;
                if (fits(c)) { seenId.add(idOf(c)); (alts || (alts = [])).push(idOf(c)); }
              }
            }
            results.push(Object.assign({
              start: matched.start,
              end: matched.end,
              display: text.slice(matched.start, matched.end),
              alts,
            }, fieldsOf(matched.c)));
            i += matched.wc;
            continue;
          }
        }
        i++;
      }
      return results;
    },

    // Ranges in raw markdown that must not be linked: frontmatter, code, comments, links,
    // urls and — when the setting asks — headings.
    computeProtected(text) {
      const ranges = [];
      const fm = frontmatterEnd(text);
      if (fm !== -1) ranges.push([0, fm]);
      for (const re of PROTECT) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      }
      if (this.settings.skipHeadings) {
        const re = /^[ \t]*#{1,6}[ \t].*$/gm;
        let m;
        while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      }
      return ranges.sort((a, b) => a[0] - b[0]);
    },

    // Frontmatter and code (fenced or inline) — the spans where a [[...]] isn't a real link.
    // Unlike computeProtected it keeps wikilinks and headings, since unlink acts on links and
    // a link inside a heading is still real.
    codeFrontmatterRanges(text) {
      const ranges = [];
      const fm = frontmatterEnd(text);
      if (fm !== -1) ranges.push([0, fm]);
      for (const re of [/```[\s\S]*?```/g, /~~~[\s\S]*?~~~/g, /`[^`\n]+`/g]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length]);
      }
      return ranges.sort((a, b) => a[0] - b[0]);
    },

    overlapsProtected(ranges, s, e) {
      for (const [rs, re] of ranges) {
        if (rs >= e) break;
        if (re > s) return true;
      }
      return false;
    },

    // Same spans as computeProtected, but tested at a single position so it stays cheap on
    // every keystroke — no whole-document scan with greedy [\s\S]*? regexes.
    isProtectedAt(text, pos) {
      const fm = frontmatterEnd(text);
      if (fm !== -1 && pos <= fm) return true;

      const lines = text.split('\n');
      let lineStart = 0, lineIdx = 0;
      for (; lineIdx < lines.length; lineIdx++) {
        if (pos <= lineStart + lines[lineIdx].length) break;
        lineStart += lines[lineIdx].length + 1; // + the '\n'
      }
      // Fenced code: parity of fence lines above the cursor.
      let fenced = false;
      for (let i = 0; i < lineIdx; i++) {
        const s = lines[i].trimStart();
        if (s.startsWith('```') || s.startsWith('~~~')) fenced = !fenced;
      }
      if (fenced) return true;

      const line = lines[lineIdx] || '';
      if (this.settings.skipHeadings && /^[ \t]*#{1,6}[ \t]/.test(line)) return true;
      // Inline code, comments, links and urls stay within the cursor's line.
      const col = pos - lineStart;
      return PROTECT_INLINE.some((re) => { re.lastIndex = 0; return inMatch(line, col, re); });
    },
  };
}

module.exports = { createMatcher };
