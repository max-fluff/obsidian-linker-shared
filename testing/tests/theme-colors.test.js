'use strict';

// Reading a colour variable raw is not enough for Style Settings' picker: a custom property
// keeps calc() unevaluated and drops an undefined var(). These guard the sheet built from the
// browser's own resolution instead.

const { describe, it, assert } = require('../harness');
const {
  themeColorSheet, capAlpha, asSrgb, pickedIn, hueShifted, trackThemeColors,
  PROSE_COLORS, SIGIL_COLORS, PROSE_PICKS, PROSE_SHIFTS,
} = require('../../theme-colors');

// Stands in for the browser: every expression settles into a plain rgb(), which is what
// getComputedStyle(el).color always returns.
const resolver = (answers) => (expr) => (Object.prototype.hasOwnProperty.call(answers, expr) ? answers[expr] : 'rgb(0, 0, 0)');

describe('theme colours', () => {
  it('writes one rule naming every colour with the plugin prefix', () => {
    const css = themeColorSheet('glossary', { 'link-color': 'var(--link-color)' }, () => 'rgb(155, 131, 242)');
    assert.strictEqual(css, ':root { --glossary-link-color: rgb(155, 131, 242); }');
  });

  // On body it met a snippet's own body rule as an equal, and the sheet Obsidian happened to
  // attach later won — which changed on every reload and every snippet edit.
  it('keeps the selector below body, so anything set there outranks it', () => {
    const css = themeColorSheet('heading', PROSE_COLORS, () => 'rgb(1, 2, 3)');
    assert.ok(css.startsWith(':root {'), 'on body a snippet and this rule win by stylesheet order alone');
    assert.ok(!css.includes('.css-settings-manager'), 'the sheet must not name Style Settings’ own class');
  });

  it('skips a colour the browser could not settle rather than writing an empty value', () => {
    const css = themeColorSheet('glossary', { a: 'var(--x)', b: 'var(--y)' }, resolver({ 'var(--x)': '' , 'var(--y)': 'rgb(9, 9, 9)' }));
    assert.strictEqual(css, ':root { --glossary-b: rgb(9, 9, 9); }');
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

  // 1.6.0 left a set colour on the underline and the theme's own on the word: a colour the
  // reader set is the only one allowed to outrank a theme, and this is what tells them apart.
  describe('colours the reader set', () => {
    const theme = {
      'var(--glossary-link-color)': 'rgb(1, 1, 1)',
      'var(--glossary-link-color-hover)': 'rgb(2, 2, 2)',
      'var(--glossary-ambiguous-color)': 'rgb(1, 1, 1)',
      [PROSE_PICKS['link-color']]: 'rgb(1, 1, 1)',
      [PROSE_PICKS['link-color-hover']]: 'rgb(2, 2, 2)',
    };
    const asResolved = (over) => resolver(Object.assign({}, theme, over));

    it('names none of them while every one stands as the stylesheet declares it', () => {
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, asResolved()), []);
    });

    it('names a colour that no longer resolves to the theme colour behind it', () => {
      const resolve = asResolved({ 'var(--glossary-link-color-hover)': 'rgb(255, 204, 0)' });
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, resolve), ['link-color-hover']);
    });

    // Style Settings stores a hex and the theme settles as rgb(): compared as text, every
    // colour would read as set.
    it('compares them as colours, not as the text they were written in', () => {
      const resolve = (expr) => (expr === 'var(--glossary-link-color)' ? 'rgb(1, 1, 1)' : asResolved()(expr));
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, resolve), []);
    });

    // The ambiguous colour starts at the theme's link colour, not the highlight's (#4 in
    // glossary-linker): picking the highlight leaves it standing, picking it names it alone.
    it('keeps the ambiguous colour on the theme when only the highlight is picked', () => {
      const resolve = asResolved({ 'var(--glossary-link-color)': 'rgb(255, 0, 136)' });
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, resolve), ['link-color']);
    });

    it('names the ambiguous colour once it is picked on its own', () => {
      const resolve = asResolved({ 'var(--glossary-ambiguous-color)': 'rgb(0, 160, 80)' });
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, resolve), ['ambiguous-color']);
    });

    it('names nothing on a colour the browser could not settle', () => {
      assert.deepStrictEqual(pickedIn('glossary', PROSE_PICKS, () => ''), []);
    });
  });

  // Obsidian 1.13 moved its base colours to OKLCH, and Style Settings draws a swatch only for
  // a value starting with #, rgb or hsl: unconverted, such a colour leaves the row blank.
  describe('a colour the swatch can take', () => {
    const pixel = (bytes) => () => bytes;
    const never = () => { throw new Error('painted a colour that needed no painting'); };

    it('passes one already in sRGB through rather than round-tripping it', () => {
      assert.strictEqual(asSrgb('rgb(123, 108, 217)', never), 'rgb(123, 108, 217)');
      assert.strictEqual(asSrgb('rgba(80, 120, 200, 0.35)', never), 'rgba(80, 120, 200, 0.35)');
      assert.strictEqual(asSrgb('#7b6cd9', never), '#7b6cd9');
      assert.strictEqual(asSrgb('hsl(254, 80%, 68%)', never), 'hsl(254, 80%, 68%)');
    });

    it('paints one in any other space and reads the pixel back', () => {
      assert.strictEqual(asSrgb('oklch(0.63 0.16 29)', pixel([217, 92, 77, 255])), 'rgb(217, 92, 77)');
      assert.strictEqual(asSrgb('color(display-p3 0.2 0.9 0.4)', pixel([0, 234, 82, 255])), 'rgb(0, 234, 82)');
    });

    it('keeps the alpha the pixel came back with', () => {
      assert.strictEqual(asSrgb('oklch(0.63 0.16 29 / 0.4)', pixel([217, 92, 77, 102])), 'rgba(217, 92, 77, 0.4)');
    });

    it('leaves the value alone when nothing could be painted', () => {
      assert.strictEqual(asSrgb('lab(52 40 59)', () => null), 'lab(52 40 59)');
    });

    it('has nothing to convert on a colour that did not settle', () => {
      assert.strictEqual(asSrgb('', never), '');
    });
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
      assert.strictEqual(css, ':root { --code-linker-band: rgba(80, 120, 200, 0.35); --code-linker-ink: rgb(80, 120, 200); }');
    });
  });

  // The slider is a variable and a rule needs a class: only a shift that turns the colour may
  // answer the theme, so 0 leaves a vault exactly as it was with no shift offered at all.
  describe('a hue shift', () => {
    it('turns the colour at any angle short of a whole turn', () => {
      for (const v of ['45', ' -90', '180', '5.5']) assert.strictEqual(hueShifted(v), true, v);
    });

    it('turns nothing at 0, a whole turn, or with nothing set', () => {
      for (const v of ['0', ' 0', '-0', '360', '-360', '', 'none']) {
        assert.strictEqual(hueShifted(v), false, v);
      }
    });

    // The class is what the stylesheet keys on, so it has to follow the slider: on at load,
    // and off again on the css-change a Style Settings write fires. Each slider has its own.
    const track = (shifts, ...rest) => {
      const values = Object.assign({}, shifts);
      const classes = new Set();
      let onCssChange = null;
      const el = () => ({ style: {}, remove() {}, createEl: el });
      const body = {
        createEl: el,
        classList: {
          toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
          remove: (c) => classes.delete(c),
        },
      };
      // A page just real enough for one paint, in place only while it runs.
      const onPage = (fn) => {
        const saved = { document: global.document, getComputedStyle: global.getComputedStyle };
        global.document = { head: { createEl: el }, body };
        global.getComputedStyle = (node) => (node === body
          ? { getPropertyValue: (name) => values[name] || '' }
          : { color: 'rgb(1, 1, 1)' });
        try { fn(); } finally { Object.assign(global, saved); }
      };
      onPage(() => trackThemeColors({
        register() {},
        registerEvent() {},
        app: { workspace: { onLayoutReady: (fn) => fn(), on: (_e, fn) => { onCssChange = fn; } } },
      }, 'glossary', PROSE_COLORS, PROSE_PICKS, ...rest));
      const classesNow = () => [...classes].sort();
      const set = (name, value) => {
        values[name] = value;
        onPage(onCssChange);
        return classesNow();
      };
      return { classes: classesNow, set };
    };

    it('puts the class on the body while the slider turns, and takes it off at 0', () => {
      const t = track({ '--glossary-hue-shift': '45' });
      assert.deepStrictEqual(t.classes(), ['glossary-hue-shifted']);
      assert.deepStrictEqual(t.set('--glossary-hue-shift', '0'), []);
    });

    it('gives the ambiguous slider a class of its own', () => {
      const t = track({ '--glossary-ambiguous-hue-shift': '-30' }, PROSE_SHIFTS);
      assert.deepStrictEqual(t.classes(), ['glossary-ambiguous-hue-shifted']);
    });

    it('reads only the hue shift unless told of more', () => {
      const t = track({ '--glossary-ambiguous-hue-shift': '-30' });
      assert.deepStrictEqual(t.classes(), []);
    });
  });
});
