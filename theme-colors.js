'use strict';

// Style Settings shows a colour row's live computed value when the row carries no default, so
// the picker opens on the colour actually in use. Reading the variable is not enough: a custom
// property keeps calc() unevaluated and drops an undefined var(), and Obsidian's accent chain
// is built from both — read raw, --link-color comes out as
// `hsl(calc(254 - 1), calc(80% * 1.01), calc(68% * 1.075))`, which its picker cannot draw, or
// empty, which makes it drop the row. Letting the browser settle each one as a real `color`
// yields a plain rgb() instead.
//
// The sheet's selector is `body`, so Style Settings' own `body.css-settings-manager` still wins
// and a chosen colour is untouched.

// Each expression carries its own fallback: an undefined var() computes to the inherited text
// colour, which would paint a hover colour black rather than leave it alone.
const PROSE_COLORS = {
  'link-color': 'var(--link-color, var(--text-accent))',
  'link-color-hover': 'var(--link-color-hover, var(--text-accent-hover, var(--link-color, var(--text-accent))))',
};

const SIGIL_COLORS = {
  'link-color': 'var(--link-external-color, var(--link-color, var(--text-accent)))',
  'stale-color': 'var(--text-warning, var(--color-orange))',
  'broken-color': 'var(--text-error, var(--color-red))',
};

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
  return rows.length ? `body { ${rows.join(' ')} }` : '';
}

function trackThemeColors(plugin, prefix, colors) {
  // No document under the test harness, and nothing to resolve against without one. The
  // stylesheet's own declarations stand in — they render correctly, they just read back
  // unresolved.
  if (typeof document === 'undefined' || !document.head || !document.body) return;

  const sheet = document.createElement('style');
  document.head.appendChild(sheet);
  plugin.register(() => sheet.remove());

  const paint = () => {
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const resolve = (expr) => {
      probe.style.color = '';
      probe.style.color = expr;
      return getComputedStyle(probe).color;
    };
    sheet.textContent = themeColorSheet(prefix, colors, resolve);
    probe.remove();
  };

  plugin.app.workspace.onLayoutReady(paint);
  // Fires on a theme change, a snippet toggle and an accent-colour change alike.
  plugin.registerEvent(plugin.app.workspace.on('css-change', paint));
}

module.exports = { trackThemeColors, themeColorSheet, capAlpha, PROSE_COLORS, SIGIL_COLORS };
