'use strict';

// The one wikilink grammar: [[file#heading^block|display]]. Obsidian's own link, as opposed to
// the markdown one in markdown.js. Text in, text out — resolving a target against the vault
// needs the index and belongs to the plugin.

const { isProtected } = require('./markdown');

const wikiRegex = () => /\[\[([^\]]+)\]\]/g;

// A wikilink's parts. The pipe splits target from display; inside a table cell the pipe is
// written "\|", so the trailing backslash is not part of the target. `#` opens a subpath and
// `^` a block reference, and either may hold characters a heading may not.
function parseWiki(inner) {
  const s = String(inner == null ? '' : inner);
  const pipe = s.indexOf('|');
  const rawTarget = (pipe >= 0 ? s.slice(0, pipe) : s).replace(/\\$/, '').trim();
  const display = (pipe >= 0 ? s.slice(pipe + 1) : '').trim();
  const block = rawTarget.indexOf('^');
  const withoutBlock = block >= 0 ? rawTarget.slice(0, block) : rawTarget;
  const hash = withoutBlock.indexOf('#');
  return {
    file: (hash >= 0 ? withoutBlock.slice(0, hash) : withoutBlock).trim(),
    heading: hash >= 0 ? withoutBlock.slice(hash + 1).trim() : '',
    block: block >= 0 ? rawTarget.slice(block + 1).trim() : '',
    display,
    hasSubpath: hash >= 0 || block >= 0,
  };
}

// Written back out. A link inside a table cell escapes its pipe, or the row splits; a link with
// no display keeps none, since Obsidian shows the target itself.
function formatWiki(parts, inTable) {
  const target = parts.file
    + (parts.heading ? '#' + parts.heading : '')
    + (parts.block ? '^' + parts.block : '');
  if (!parts.display) return '[[' + target + ']]';
  return '[[' + target + (inTable ? '\\|' : '|') + parts.display + ']]';
}

// Every wikilink in `text` that sits where a link may sit, as { start, end, source, parts }.
// Code, frontmatter and the rest of the protected ranges are skipped: a [[…]] written there is
// not a link, and rewriting it would edit an example.
function findWikiLinks(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  const re = wikiRegex();
  let m;
  while ((m = re.exec(s))) {
    if (isProtected(s, m.index)) continue;
    out.push({ start: m.index, end: m.index + m[0].length, source: m[0], parts: parseWiki(m[1]) });
  }
  return out;
}

// Rewrite each wikilink through `fn(parts, link) -> parts | null`; null leaves it untouched.
// Applied right to left so the offsets of the links still to come stay true.
function rewriteWikiLinks(text, fn, inTableAt) {
  const s = String(text == null ? '' : text);
  const links = findWikiLinks(s);
  let out = s;
  let count = 0;
  for (let i = links.length - 1; i >= 0; i--) {
    const next = fn(links[i].parts, links[i]);
    if (!next) continue;
    const replaced = formatWiki(next, inTableAt ? inTableAt(s, links[i].start) : false);
    if (replaced === links[i].source) continue;
    out = out.slice(0, links[i].start) + replaced + out.slice(links[i].end);
    count += 1;
  }
  return { text: out, count };
}

module.exports = { wikiRegex, parseWiki, formatWiki, findWikiLinks, rewriteWikiLinks };
