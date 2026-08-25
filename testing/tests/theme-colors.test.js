'use strict';

// Reading a colour variable raw is not enough for Style Settings' picker: a custom property
// keeps calc() unevaluated and drops an undefined var(). These guard the sheet built from the
// browser's own resolution instead.

const { describe, it, assert } = require('../harness');
const { themeColorSheet, capAlpha, PROSE_COLORS, SIGIL_COLORS } = require('../../theme-colors');

// Stands in for the browser: every expression settles into a plain rgb(), which is what
// getComputedStyle(el).color always returns.
const resolver = (answers) => (expr) => (Object.prototype.hasOwnProperty.call(answers, expr) ? answers[expr] : 'rgb(0, 0, 0)');

describe('theme colours', () => {
  it('writes one body rule naming every colour with the plugin prefix', () => {
    const css = themeColorSheet('glossary', { 'link-color': 'var(--link-color)' }, () => 'rgb(155, 131, 242)');
    assert.strictEqual(css, 'body { --glossary-link-color: rgb(155, 131, 242); }');
  });

  it('keeps the selector at body, so Style Settings still outranks it', () => {
    const css = themeColorSheet('heading', PROSE_COLORS, () => 'rgb(1, 2, 3)');
    assert.ok(css.startsWith('body {'), 'a stronger selector would freeze the picker’s own choice out');
    assert.ok(!css.includes('.css-settings-manager'), 'the sheet must not name Style Settings’ own class');
  });

  it('skips a colour the browser could not settle rather than writing an empty value', () => {
    const css = themeColorSheet('glossary', { a: 'var(--x)', b: 'var(--y)' }, resolver({ 'var(--x)': '' , 'var(--y)': 'rgb(9, 9, 9)' }));
    assert.strictEqual(css, 'body { --glossary-b: rgb(9, 9, 9); }');
  });

  it('is empty when nothing settled, so no rule is written at all', () => {
    assert.strictEqual(themeColorSheet('glossary', { a: 'var(--x)' }, () => ''), '');
  });

  // An undefined var() computes to the inherited text colour, so a chain that ends in one
  // would paint a hover colour black instead of leaving it as the theme has it.
  it('gives every expression a fallback of its own', () => {
    for (const colors of [PROSE_COLORS, SIGIL_COLORS]) {
      for (const name of Object.keys(colors)) {
        const spec = colors[name];
        const from = typeof spec === 'string' ? spec : spec.from;
        assert.ok(/var\([^,)]+,/.test(from), `${name} has no fallback: an undefined variable would resolve to the text colour`);
      }
    }
  });

  // A theme's selection colour at full strength buries the code drawn on top of it.
  describe('behind text', () => {
    it('takes a colour down to the most the entry allows', () => {
      assert.strictEqual(capAlpha('rgb(80, 120, 200)', 0.35), 'rgba(80, 120, 200, 0.35)');
      assert.strictEqual(capAlpha('rgba(80, 120, 200, 0.9)', 0.35), 'rgba(80, 120, 200, 0.35)');
    });

    it('leaves a colour that is already fainter alone', () => {
      assert.strictEqual(capAlpha('rgba(80, 120, 200, 0.2)', 0.35), 'rgba(80, 120, 200, 0.2)');
    });

    it('passes anything it cannot read through untouched', () => {
      assert.strictEqual(capAlpha('', 0.35), '');
      assert.strictEqual(capAlpha('color-mix(in srgb, red, blue)', 0.35), 'color-mix(in srgb, red, blue)');
    });

    it('caps only the entries that ask for it', () => {
      const css = themeColorSheet('code-linker', {
        band: { from: 'var(--text-selection)', maxAlpha: 0.35 },
        ink: 'var(--link-color)',
      }, () => 'rgb(80, 120, 200)');
      assert.strictEqual(css, 'body { --code-linker-band: rgba(80, 120, 200, 0.35); --code-linker-ink: rgb(80, 120, 200); }');
    });
  });
});
