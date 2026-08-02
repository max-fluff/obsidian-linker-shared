'use strict';

// Obsidian's own link, as opposed to the markdown one. The parts that matter are the file, the
// subpath and the display, and the pipe that separates them is also the pipe that splits a
// table row — which is why a link in a cell writes it escaped.

const { describe, it, assert } = require('../harness');
const { parseWiki, formatWiki, findWikiLinks, rewriteWikiLinks } = require('../../wikilink');
const { inTableCell } = require('../../markdown');

describe('parseWiki', () => {
  it('reads a bare file link', () => {
    assert.deepStrictEqual(parseWiki('Guide'), { file: 'Guide', heading: '', block: '', display: '', hasSubpath: false });
  });

  it('reads a heading and a display apart', () => {
    const p = parseWiki('Guide#Projectile|projectiles');
    assert.strictEqual(p.file, 'Guide');
    assert.strictEqual(p.heading, 'Projectile');
    assert.strictEqual(p.display, 'projectiles');
  });

  it('reads a block reference', () => {
    const p = parseWiki('Guide^abc123');
    assert.strictEqual(p.block, 'abc123');
    assert.strictEqual(p.heading, '');
    assert.ok(p.hasSubpath);
  });

  // In a table cell the pipe is written "\|", and the backslash belongs to the escaping, not
  // to the heading it would otherwise end up inside.
  it('does not take a table cell’s escape for part of the target', () => {
    assert.strictEqual(parseWiki('Guide#Projectile\\|projectiles').heading, 'Projectile');
  });

  it('survives an empty target', () => {
    assert.deepStrictEqual(parseWiki(''), { file: '', heading: '', block: '', display: '', hasSubpath: false });
  });
});

describe('formatWiki', () => {
  it('round-trips a heading link', () => {
    assert.strictEqual(formatWiki(parseWiki('Guide#Projectile|word')), '[[Guide#Projectile|word]]');
  });

  it('writes no pipe where there is no display', () => {
    assert.strictEqual(formatWiki(parseWiki('Guide')), '[[Guide]]');
  });

  it('escapes the pipe inside a table cell', () => {
    assert.strictEqual(formatWiki(parseWiki('Guide#P|w'), true), '[[Guide#P\\|w]]');
  });
});

describe('findWikiLinks', () => {
  it('finds every link with its span', () => {
    const found = findWikiLinks('see [[A]] and [[B#C|c]]');
    assert.deepStrictEqual(found.map((l) => l.source), ['[[A]]', '[[B#C|c]]']);
    assert.strictEqual(found[0].start, 4);
  });

  // A [[…]] inside a fence is an example of a link, not a link.
  it('skips a link inside a fenced block', () => {
    assert.deepStrictEqual(findWikiLinks('```\n[[A]]\n```\n[[B]]').map((l) => l.source), ['[[B]]']);
  });

  it('skips a link inside inline code and frontmatter', () => {
    assert.deepStrictEqual(findWikiLinks('`[[A]]`').map((l) => l.source), []);
    assert.deepStrictEqual(findWikiLinks('---\nx: "[[A]]"\n---\n[[B]]').map((l) => l.source), ['[[B]]']);
  });
});

describe('rewriteWikiLinks', () => {
  const renameHeading = (from, to) => (parts) => (parts.heading === from ? Object.assign({}, parts, { heading: to }) : null);

  it('rewrites only the links the callback answers for', () => {
    const out = rewriteWikiLinks('[[Guide#Old|w]] and [[Guide#Other|x]]', renameHeading('Old', 'New'));
    assert.strictEqual(out.text, '[[Guide#New|w]] and [[Guide#Other|x]]');
    assert.strictEqual(out.count, 1);
  });

  // Right to left, or the second rewrite would land at an offset the first one moved.
  it('keeps later spans true while rewriting several', () => {
    const out = rewriteWikiLinks('[[G#Old|a]] [[G#Old|bbbb]]', renameHeading('Old', 'Much longer'));
    assert.strictEqual(out.text, '[[G#Much longer|a]] [[G#Much longer|bbbb]]');
    assert.strictEqual(out.count, 2);
  });

  it('counts nothing when the rewrite produces what was already there', () => {
    const out = rewriteWikiLinks('[[G#Old|a]]', renameHeading('Old', 'Old'));
    assert.strictEqual(out.count, 0);
  });

  // A link already in a cell carries "\|"; the escape belongs to the table, so it is stripped
  // on the way in and put back on the way out rather than ending up inside the heading.
  it('keeps the pipe escaped when the link sits in a table cell', () => {
    const text = '| h |\n|---|\n| [[G#Old\\|w]] |';
    const out = rewriteWikiLinks(text, renameHeading('Old', 'New'), inTableCell);
    assert.strictEqual(out.text, '| h |\n|---|\n| [[G#New\\|w]] |');
  });

  it('leaves a protected link alone', () => {
    const out = rewriteWikiLinks('`[[G#Old|a]]`', renameHeading('Old', 'New'));
    assert.strictEqual(out.count, 0);
  });
});
