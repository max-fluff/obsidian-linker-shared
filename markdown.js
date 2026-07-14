'use strict';

const splitLines = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean);

// One source of the markdown-link grammar. A fresh /g instance per call avoids
// shared-lastIndex bugs between scanners.
const LINK_PATTERN = '\\[([^\\]]*)\\]\\(([^)]+)\\)';
const linkRegex = () => new RegExp(LINK_PATTERN, 'g');

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

module.exports = { splitLines, linkRegex, isFenceLine, inInlineCode, locate, inCode, inLink, isProtected, inTableCell };
