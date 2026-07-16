// Renders one store screenshot "plate": the raw screenshot floated on the family's
// branded backdrop (gradient + faint token cloud + mark/wordmark + caption), sized to
// the Obsidian store's recommended 1200x800 (3:2). Pure string builder — no I/O — so it
// stays easy to test and reuse. make-plates.mjs feeds it a config and rasterizes the
// result with headless Chromium.

import { esc, MONO, markHtml } from './common.mjs';

export const W = 1200;
export const H = 800;

// Fixed scatter slots [x, y, fontPx, opacity], hugging the edges so the centered
// screenshot stays clear. Provided words are mapped onto slots, cycling if fewer.
const SCATTER = [
  [70, 40, 30, 0.10], [250, 80, 22, 0.07], [950, 56, 28, 0.09], [1070, 110, 22, 0.07],
  [44, 170, 22, 0.07], [980, 250, 22, 0.06], [64, 720, 26, 0.09], [240, 762, 20, 0.06],
  [880, 730, 26, 0.09], [1070, 690, 22, 0.07], [1000, 500, 22, 0.07], [50, 512, 24, 0.08],
  [1096, 356, 20, 0.06], [30, 380, 20, 0.06],
];

function scatterHtml(tokens) {
  if (!tokens || !tokens.length) return '';
  return SCATTER.map(([x, y, s, o], i) => {
    const t = tokens[i % tokens.length];
    return `<span class="tok" style="left:${x}px;top:${y}px;font-size:${s}px;opacity:${o}">${esc(t)}</span>`;
  }).join('\n');
}

export function renderPlate(brand, plate, dataUri) {
  const [top, bottom] = brand.gradient;
  const tokenFam = brand.tokenMono ? MONO : "inherit";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body {
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    background:linear-gradient(180deg,${top} 0%,${bottom} 100%);
    position:relative; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
  }
  .tok { position:absolute; color:${brand.tokenColor}; font-weight:500; white-space:nowrap;
    font-family:${tokenFam}; }
  .mark { position:absolute; top:40px; left:48px; display:flex; align-items:center; gap:14px; z-index:2; }
  .mark-glyph { height:30px; width:auto; display:block; }
  .mark-glyph-text { font-weight:700; font-size:30px; color:#fff; }
  .mark .name { font-size:22px; font-weight:700; color:#f4f4f6; letter-spacing:.2px; }
  .stage { position:absolute; top:96px; bottom:150px; left:0; right:0;
    display:flex; align-items:center; justify-content:center; z-index:1; }
  .shot { border-radius:12px; border:1px solid rgba(255,255,255,.09);
    box-shadow:0 30px 70px -18px rgba(0,0,0,.65), 0 6px 18px -6px rgba(0,0,0,.5);
    max-width:820px; max-height:100%; display:block; }
  .caption { position:absolute; bottom:52px; left:0; right:0; text-align:center;
    padding:0 90px; z-index:2; }
  .caption h2 { font-size:33px; font-weight:700; color:#f4f4f6; margin-bottom:11px; letter-spacing:.2px; }
  .caption p { font-size:21px; font-weight:400; color:#c2bfd2; line-height:1.4; }
</style></head><body>
  ${scatterHtml(brand.tokens)}
  <div class="mark">${markHtml(brand.mark)}<span class="name">${esc((brand.wordmark && brand.wordmark.text) || '')}</span></div>
  <div class="stage"><img class="shot" src="${dataUri}"></div>
  <div class="caption"><h2>${esc(plate.title)}</h2><p>${esc(plate.caption)}</p></div>
</body></html>`;
}
