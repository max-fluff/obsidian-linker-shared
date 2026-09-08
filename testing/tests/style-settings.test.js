'use strict';

// The plugins ship a Style Settings block in styles.css but never appeared in its UI: the
// block was fine, nobody told Style Settings the sheet had arrived. Both halves are checked
// here, because either one alone leaves the panel empty.
//
// The rest of this file guards the panel itself. A knob is two things in two files — a row
// here, a var() or a body class there — and nothing but a test notices when one of them goes.

const fs = require('fs');
const path = require('path');
const { describe, it, assert } = require('../harness');
const { announceStyleSettings } = require('../../style-settings');
const { PROSE_PICKS, SIGIL_PICKS } = require('../../theme-colors');

// Style Settings' own patterns, copied from its parseCSSStyleSheet.
const BLOCK = /\/\*!?\s*@settings[\r\n]+?([\s\S]+?)\*\//g;
const NAME = /^name:\s*(.+)$/m;

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const config = fs.readFileSync(path.join(ROOT, 'esbuild.config.mjs'), 'utf8');
const prefix = /prefix:\s*'([^']+)'/.exec(config)[1];
const kind = /kind:\s*'([^']+)'/.exec(config)[1];

const blockOf = (text) => {
  BLOCK.lastIndex = 0;
  const m = BLOCK.exec(text);
  return m && m[1];
};

// The block's rows, without a YAML parser: the suites run on bare Node.
const rowsOf = (body) =>
  body
    .split(/^ {2}-\s*$/m)
    .slice(1)
    .map((chunk) => ({
      id: (/^ {4}id:\s*(\S+)/m.exec(chunk) || [])[1],
      type: (/^ {4}type:\s*(\S+)/m.exec(chunk) || [])[1],
      hasDefault: /^ {4}default(-light)?:/m.test(chunk),
      values: (chunk.match(/^ {8}value:\s*(\S+)/gm) || []).map((l) => l.split(/:\s*/)[1]),
    }));

// What a row has to be wired to for it to do anything: a class-* row puts its own id (or its
// options' values) on the body, everything else declares a custom property.
const hooksOf = (row) => {
  if (row.type === 'class-toggle') return ['.' + row.id];
  if (row.type === 'class-select') return row.values.map((v) => '.' + v);
  return ['var(--' + row.id];
};

describe('style settings', () => {
  it('tells Style Settings to re-read the sheet once the layout is up', () => {
    const triggered = [];
    const plugin = {
      app: { workspace: { onLayoutReady: (fn) => fn(), trigger: (name) => triggered.push(name) } },
    };
    announceStyleSettings(plugin);
    assert.deepStrictEqual(triggered, ['parse-style-settings']);
  });

  it('ships a block Style Settings can find in the built styles.css', () => {
    const body = blockOf(css);
    assert.ok(body, 'no @settings block in styles.css');
    assert.ok(NAME.test(body), 'the block has no name: line, so Style Settings drops it');
    assert.ok(/^id:\s*\S+/m.test(body), 'the block has no id: line, so Style Settings drops it');
    assert.ok(/^settings:/m.test(body), 'the block declares no settings');
    assert.ok(!body.includes('%p%'), 'the build left the class-prefix token unsubstituted');
    assert.ok(!/%rows:/.test(css), 'the build left a shared-rows token unspliced');
  });

  it('carries every row the family shares for its kind', () => {
    const fragment = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', kind + '.settings.yml'), 'utf8');
    const shared = rowsOf('\n' + fragment).map((r) => r.id.split('%p%').join(prefix));
    const mine = rowsOf(blockOf(css)).map((r) => r.id);
    assert.ok(shared.length, 'the shared fragment declares no rows');
    for (const id of shared) assert.ok(mine.includes(id), `${id} is in the shared fragment but not in the built block`);
  });

  it('declares no row that nothing is wired to', () => {
    const rest = css.split(blockOf(css)).join('');
    for (const row of rowsOf(blockOf(css))) {
      if (row.type === 'heading' || row.type === 'info-text') continue;
      const hooks = hooksOf(row);
      assert.ok(hooks.length, `${row.id} offers nothing to select`);
      for (const hook of hooks) assert.ok(rest.includes(hook), `${row.id} is offered in the panel but ${hook} appears nowhere in the CSS`);
    }
  });

  it('reads no variable of its own that the panel does not offer', () => {
    const body = blockOf(css);
    const declared = new Set(rowsOf(body).map((r) => '--' + r.id));
    const rest = css.split(body).join('');
    const read = rest.match(new RegExp('--' + prefix + '-[a-z0-9-]+', 'g')) || [];
    for (const name of read) {
      assert.ok(declared.has(name), `${name} is read by the CSS but no row offers it — either add the row, or name it off the prefix if it is set from code`);
    }
  });

  // A colour row with no default is how the picker comes up showing the colour actually in
  // use — Style Settings reads the variable's computed value. Undeclared, that value is empty
  // and the row does not render at all.
  it('declares every colour it offers without a default', () => {
    const body = blockOf(css);
    const rest = css.split(body).join('');
    for (const row of rowsOf(body)) {
      if (row.type !== 'variable-color' || row.hasDefault) continue;
      assert.ok(rest.includes('--' + row.id + ':'), `${row.id} has no default, so Style Settings reads its computed value — but the CSS never declares --${row.id}`);
    }
  });

  // 1.6.0 shipped the set colour on the underline and the theme's own on the word: such a
  // colour needs both a name in the JS map and a class in the CSS to reach the text at all.
  it('answers the theme for every colour the reader may set', () => {
    const body = blockOf(css);
    const rest = css.split(body).join('');
    const offered = rowsOf(body).map((r) => r.id);
    for (const name of Object.keys(kind === 'prose' ? PROSE_PICKS : SIGIL_PICKS)) {
      const spends = new RegExp(`body\\.${prefix}-${name}-picked[^{]*\\{[^}]*var\\(--${prefix}-${name}\\)`);
      assert.ok(offered.includes(`${prefix}-${name}`), `${name} is tracked as pickable but no row offers it`);
      assert.ok(spends.test(rest), `nothing in the CSS reads --${prefix}-${name} once it is picked`);
    }
    assert.ok(/color: var\(--[ps]l-ink\) !important/.test(rest), 'a picked colour is spent at a weight a theme can outrank');
  });

  // An installer without relative colours keeps a custom property it cannot resolve and drops
  // it where it is spent, leaving the mark with the inherited text colour. The @supports block
  // is what keeps the whole mode out of such a build instead.
  it('keeps every relative colour inside an @supports block', () => {
    // Comments go first, and a block is read from column one to column one: the word @supports
    // inside a comment opened a region of its own, and everything after it read as guarded.
    const rest = css.split(blockOf(css)).join('').replace(/\/\*[\s\S]*?\*\//g, '');
    const guarded = (rest.match(/^@supports[\s\S]*?^\}/gm) || []).join('\n');
    const reads = (text) => (text.match(/oklch\(from/g) || []).length;
    assert.strictEqual(reads(rest), reads(guarded), 'a relative colour is read outside @supports');
    // The rule that answers the theme has to go with the mode it answers for: left outside, it
    // pinned the mark to the plain link colour on an installer where the mode does nothing.
    const names = (text) => (text.match(new RegExp(prefix + '-hue-(turned|fixed)', 'g')) || []).length;
    assert.strictEqual(names(rest), names(guarded), 'a hue-mode class is selected outside @supports');
  });

  it('gives every id to one row only', () => {
    const ids = rowsOf(blockOf(css)).map((r) => r.id);
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    assert.deepStrictEqual(dupes, [], 'a repeated id makes Style Settings drop one of the rows');
  });
});
