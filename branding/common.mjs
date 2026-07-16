// Bits shared by the plate (HTML → PNG) and banner (SVG) renderers, so a plugin's mark
// and type stack are defined once and drawn the same way in both.

export const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";
export const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const r = (n, d = 2) => Number(n.toFixed(d));

// A text glyph's drawn height is ~0.72em for the bracket/box marks the family uses.
const GLYPH_CAP = 0.72;

// mark: { kind: 'glyph', text, mono } — a text mark like "[{}]"
//       { kind: 'svg', viewBox, body } — vector body drawn in its own coordinate space
export function markHtml(mark) {
  if (!mark) return '';
  if (mark.kind === 'svg') {
    return `<svg class="mark-glyph" viewBox="${mark.viewBox}" xmlns="http://www.w3.org/2000/svg">${mark.body}</svg>`;
  }
  const fam = mark.mono === false ? 'inherit' : MONO;
  return `<span class="mark-glyph-text" style="font-family:${fam}">${esc(mark.text || '')}</span>`;
}

// The same mark inside an SVG: centered on (cx, cy) and scaled to `h` tall.
export function markSvg(mark, cx, cy, h) {
  if (!mark) return '';
  if (mark.kind === 'svg') {
    const [vx, vy, vw, vh] = mark.viewBox.trim().split(/[\s,]+/).map(Number);
    const s = h / vh;
    return `<g transform="translate(${r(cx - (vx + vw / 2) * s)},${r(cy - (vy + vh / 2) * s)}) scale(${r(s, 4)})">${mark.body}</g>`;
  }
  const fam = mark.mono === false ? SANS : MONO;
  return `<text x="${r(cx)}" y="${r(cy + h / 2)}" fill="#ffffff" font-family="${fam}" font-weight="700" font-size="${r(h / GLYPH_CAP)}" text-anchor="middle">${esc(mark.text || '')}</text>`;
}
