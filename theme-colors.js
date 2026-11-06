'use strict';

// Style Settings shows a colour row's live computed value when the row carries no default, so
// the picker opens on the colour actually in use. Reading the variable is not enough: a custom
// property keeps calc() unevaluated and drops an undefined var(), and Obsidian's accent chain
// is built from both — read raw, --link-color comes out as
// `hsl(calc(254 - 1), calc(80% * 1.01), calc(68% * 1.075))`, which its picker cannot draw, or
// empty, which makes it drop the row. Letting the browser settle each one as a real `color`
// yields a plain rgb() instead — and every colour resolved here comes back in sRGB, which is
// the only kind that plugin can draw.
//
// The sheet's selector is `:root`, one step of inheritance below `body`, so anything set there
// — Style Settings' own rule, or a snippet's — reaches the mark before this does. On `body` the
// two met as equals and the later stylesheet won, which Obsidian reshuffles on every reload.

// Each expression carries its own fallback: an undefined var() computes to the inherited text
// colour, which would paint a hover colour black rather than leave it alone.
const PROSE_LINK = 'var(--link-color, var(--text-accent))';
const PROSE_COLORS = {
  'link-color': PROSE_LINK,
  'link-color-hover': 'var(--link-color-hover, var(--text-accent-hover, var(--link-color, var(--text-accent))))',
  // The theme's link colour, not the highlight's: a collision keeps its own colour.
  'ambiguous-color': PROSE_LINK,
};

const SIGIL_COLORS = {
  'link-color': 'var(--link-external-color, var(--link-color, var(--text-accent)))',
  'stale-color': 'var(--text-warning, var(--color-orange))',
  'broken-color': 'var(--text-error, var(--color-red))',
};

// What each colour resolves to while nobody has set it. One that resolves to anything else has
// been set — in Style Settings or in a snippet — and only such a colour is allowed to outrank a
// theme's own link rule. `%p%` stands for the plugin's prefix, as in the stylesheets. A colour
// no theme competes for (a background, a stale or broken mark) belongs in neither map.
const PROSE_PICKS = {
  'link-color': PROSE_COLORS['link-color'],
  'link-color-hover': PROSE_COLORS['link-color-hover'],
  'ambiguous-color': PROSE_COLORS['ambiguous-color'],
};

// Whether a hue shift read off the page turns the colour at all. 0 — or a whole turn, or
// nothing set — leaves the theme's own link rule to win, exactly as with no shift offered.
function hueShifted(value) {
  const deg = parseFloat(value);
  return Number.isFinite(deg) && deg % 360 !== 0;
}

const SIGIL_PICKS = { 'link-color': SIGIL_COLORS['link-color'] };

// The hue-shift sliders each kind offers. A slider `x` turns its rules on through the body
// class `<prefix>-xed`, so `hue-shift` sets `<prefix>-hue-shifted`.
const PROSE_SHIFTS = ['hue-shift', 'ambiguous-hue-shift'];
const SIGIL_SHIFTS = ['hue-shift'];

// Style Settings draws a swatch only for a value starting with #, rgb or hsl, and since
// Obsidian 1.13 a base colour settles as `oklch(...)`. Nothing in CSS converts one back —
// `rgb(from ...)` serialises as `color(srgb ...)`, which its check rejects too — so a colour in
// any other space is painted and read back as a pixel. `readPixel` answers [r, g, b, a] in
// bytes, and out-of-gamut colours arrive clamped, as the reader will see them anyway. A value
// already in one of the three is passed through untouched rather than round-tripped, which
// would drift it by a step. See CONTRIBUTING.md.
function asSrgb(value, readPixel) {
  if (!value || /^(#|rgb|hsl)/.test(value)) return value;
  const px = readPixel(value);
  if (!px) return value;
  const [r, g, b, a] = px;
  if (a === 255) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}

// A colour meant to sit behind text has to stay behind it. Themes set --text-selection at
// full strength, which buries a snippet's target line, so such an entry names the most it may
// carry. A colour already fainter than that is left alone.
function capAlpha(value, max) {
  const m = /^rgba?\(([^)]*)\)$/.exec(value);
  if (!m) return value;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length < 3) return value;
  const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
  if (!(alpha > max)) return value;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${max})`;
}

// An entry is the expression to settle, or { from, maxAlpha } when it is drawn behind text.
function themeColorSheet(prefix, colors, resolve) {
  const rows = [];
  for (const name of Object.keys(colors)) {
    const spec = colors[name];
    const from = typeof spec === 'string' ? spec : spec.from;
    let value = resolve(from);
    if (value && typeof spec !== 'string' && spec.maxAlpha != null) value = capAlpha(value, spec.maxAlpha);
    if (value) rows.push(`--${prefix}-${name}: ${value};`);
  }
  return rows.length ? `:root { ${rows.join(' ')} }` : '';
}

// Which colours no longer stand as the stylesheet declares them. Both sides settle through the
// same probe, so a hex stored by Style Settings and an rgb() from the theme compare as colours
// rather than as text; a colour set to exactly the theme's own reads as untouched, and looks it.
function pickedIn(prefix, picks, resolve) {
  return Object.keys(picks).filter((name) => {
    const inUse = resolve(`var(--${prefix}-${name})`);
    const declared = resolve(picks[name].split('%p%').join(prefix));
    return Boolean(inUse) && Boolean(declared) && inUse !== declared;
  });
}

function trackThemeColors(plugin, prefix, colors, picks, shifts = SIGIL_SHIFTS) {
  // No document under the test harness, and nothing to resolve against without one. The
  // stylesheet's own declarations stand in — they render correctly, they just read back
  // unresolved.
  if (typeof document === 'undefined' || !document.head || !document.body) return;

  const sheet = document.head.createEl('style');
  plugin.register(() => sheet.remove());

  const names = picks ? Object.keys(picks) : [];
  const classOf = (name) => `${prefix}-${name}-picked`;
  // Style Settings writes a slider as a variable; only a class can turn a rule on.
  const shiftedOf = (name) => `${prefix}-${name}ed`;
  plugin.register(() => {
    for (const name of names) document.body.classList.remove(classOf(name));
    for (const name of shifts) document.body.classList.remove(shiftedOf(name));
  });

  const paint = () => {
    const probe = document.body.createEl('span', { cls: `${prefix}-probe` });
    // Made only for a colour the swatch cannot take, which in most vaults is none at all, and
    // it leaves with the probe it hangs on.
    let canvas = null;
    const readPixel = (value) => {
      canvas = canvas || probe.createEl('canvas', { attr: { width: 1, height: 1 } });
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    const resolve = (expr) => {
      probe.style.color = '';
      probe.style.color = expr;
      return asSrgb(getComputedStyle(probe).color, readPixel);
    };
    sheet.textContent = themeColorSheet(prefix, colors, resolve);
    // After the sheet, not before: what a colour resolves to now is what the reader will see.
    const set = new Set(names.length ? pickedIn(prefix, picks, resolve) : []);
    for (const name of names) document.body.classList.toggle(classOf(name), set.has(name));
    const page = getComputedStyle(document.body);
    for (const name of shifts) {
      const deg = page.getPropertyValue(`--${prefix}-${name}`);
      document.body.classList.toggle(shiftedOf(name), hueShifted(deg));
    }
    probe.remove();
  };

  plugin.app.workspace.onLayoutReady(paint);
  // Fires on a theme change, a snippet toggle, an accent-colour change and a Style Settings
  // write alike.
  plugin.registerEvent(plugin.app.workspace.on('css-change', paint));
}

module.exports = {
  trackThemeColors,
  themeColorSheet,
  capAlpha,
  asSrgb,
  pickedIn,
  hueShifted,
  PROSE_COLORS,
  SIGIL_COLORS,
  PROSE_PICKS,
  SIGIL_PICKS,
  PROSE_SHIFTS,
  SIGIL_SHIFTS,
};
