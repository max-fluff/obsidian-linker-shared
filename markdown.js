'use strict';

const splitLines = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean);

// One source of the markdown-link grammar. A fresh /g instance per call avoids
// shared-lastIndex bugs between scanners. The destination group stays greedy: Obsidian
// accepts unencoded spaces in a path, so it can't be split on whitespace here — a title,
// when a caller cares, comes off it afterwards via splitTarget.
const LINK_PATTERN = '\\[([^\\]]*)\\]\\(([^)]+)\\)';
const linkRegex = () => new RegExp(LINK_PATTERN, 'g');

// A destination splits into its url and an optional title: [text](url "title"). Since the
// url may hold spaces, the title is only ever a quoted run at the very end. Callers that
// read the url — opening it, finding a line in it — must split first, or the title rides
// along into whatever they do with it.
const LINK_TITLE = /^([\s\S]*?)\s+(?:"([^"]*)"|'([^']*)')$/;

function splitTarget(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = LINK_TITLE.exec(s);
  if (!m) return { url: s, title: '' };
  return { url: m[1].trim(), title: m[2] != null ? m[2] : m[3] };
}

const withTitle = (url, title) => (title ? url + ' "' + title + '"' : url);

const isFenceLine = (line) => { const s = line.trimStart(); return s.startsWith('```') || s.startsWith('~~~'); };

const INLINE_CODE = /`[^`\n]+`/g;

function inMatch(line, col, re) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (col > m.index && col < m.index + m[0].length) return true;
  }
  return false;
}

const inInlineCode = (line, col) => inMatch(line, col, INLINE_CODE);

// Line, column and line-index of an absolute offset within `lines`.
function locate(lines, pos) {
  let start = 0, i = 0;
  for (; i < lines.length; i++) {
    if (pos <= start + lines[i].length) break;
    start += lines[i].length + 1;
  }
  return { i, col: pos - start, line: lines[i] || '' };
}

// Inside frontmatter, a fenced block, or inline code — markdown that isn't rendered as
// prose, so a link there is example text, not a live link.
function inCode(text, pos) {
  if (/^---\r?\n/.test(text)) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1 && pos <= end + 4) return true;
  }
  const lines = text.split('\n');
  const { i, col, line } = locate(lines, pos);
  let fenced = false;
  for (let k = 0; k < i; k++) if (isFenceLine(lines[k])) fenced = !fenced;
  if (fenced) return true;
  return inMatch(line, col, INLINE_CODE);
}

// Inside an existing markdown link.
function inLink(text, pos) {
  const { col, line } = locate(text.split('\n'), pos);
  return inMatch(line, col, linkRegex());
}

// Whether a suggestion (or link conversion) must not fire at `pos`. Tables and headings
// are allowed on purpose. Cheap per keystroke — tests the one position, not the document.
function isProtected(text, pos) {
  return inCode(text, pos) || inLink(text, pos);
}

// Real GFM table only — the surrounding block must hold a delimiter row like "| --- |".
function inTableCell(text, pos) {
  const lines = text.split('\n');
  const lineIdx = (text.slice(0, pos).match(/\n/g) || []).length;
  if (!lines[lineIdx] || !lines[lineIdx].includes('|')) return false;
  const isDelimiter = (l) => l.includes('|') && l.includes('-') && /^[\s|:-]+$/.test(l);
  let top = lineIdx, bot = lineIdx;
  while (top > 0 && lines[top - 1].trim() !== '') top--;
  while (bot < lines.length - 1 && lines[bot + 1].trim() !== '') bot++;
  for (let i = top; i <= bot; i++) if (isDelimiter(lines[i])) return true;
  return false;
}

// Walk the live markdown links in `text` and let `fn(name, target)` rewrite the ones it
// wants, returning null for the rest. Links inside code — fenced or inline — are skipped:
// there they're example text, and rewriting them would edit someone's illustration.
function rewriteLinks(text, fn) {
  const lines = text.split('\n');
  let fenced = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceLine(lines[i])) { fenced = !fenced; continue; }
    if (fenced) continue;
    lines[i] = lines[i].replace(linkRegex(), (whole, name, target, offset) => {
      if (inInlineCode(lines[i], offset)) return whole;
      const out = fn(name, target);
      if (out == null) return whole;
      count++;
      return out;
    });
  }
  return { text: lines.join('\n'), count };
}

// Walk fenced blocks of one info string — ```<lang> — and let `fn(bodyLines)` return a
// replacement body. The exception to rewriteLinks skipping fences: a plugin's own block
// is the thing being edited, not an example of one.
function rewriteFences(text, lang, fn) {
  const lines = text.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = new RegExp('^\\s*(`{3,}|~{3,})\\s*' + lang + '\\s*$').exec(lines[i]);
    if (!open) continue;
    const close = new RegExp('^\\s*' + open[1][0] + '{' + open[1].length + ',}\\s*$');
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    const body = lines.slice(i + 1, j);
    const out = fn(body);
    if (out) { lines.splice(i + 1, body.length, ...out); count++; j = i + 1 + out.length; }
    i = j;
  }
  return { text: lines.join('\n'), count };
}

// The plain word under `ch`, or ''. Index-free on purpose: an excluded term is gone from the
// index, so the menu that offers to un-exclude it cannot find the word by matching.
function wordAt(line, ch) {
  const s = String(line == null ? '' : line);
  if (!s) return '';
  const isWord = (c) => /[\p{L}\p{Nd}]/u.test(c || '');
  const at = Math.max(0, Math.min(ch, s.length));
  // A cursor sitting just past the end of a word still belongs to it.
  if (!isWord(s[at]) && !isWord(s[at - 1])) return '';
  let start = at;
  while (start > 0 && isWord(s[start - 1])) start--;
  let end = at;
  while (end < s.length && isWord(s[end])) end++;
  return s.slice(start, end);
}

module.exports = { splitLines, linkRegex, splitTarget, withTitle, rewriteLinks, rewriteFences, isFenceLine, inInlineCode, locate, inCode, inLink, isProtected, inTableCell, wordAt };
