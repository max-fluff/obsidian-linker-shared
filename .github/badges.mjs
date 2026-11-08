// Renders each plugin's downloads and release badge as a flat SVG into the directory given as argv[2].
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGINS = ['code-linker', 'glossary-linker', 'heading-linker', 'reference-linker'];
const STATS = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json';

// Verdana 11px advance widths, the font shields.io measures with.
const WIDTH = {
  a: 6.66, b: 6.82, c: 5.73, d: 6.82, e: 6.55, f: 3.87, g: 6.82, h: 6.97, i: 3.02, j: 3.79, k: 6.43, l: 3.02, m: 10.67,
  n: 6.97, o: 6.68, p: 6.82, q: 6.82, r: 4.69, s: 5.73, t: 4.33, u: 6.97, v: 6.43, w: 8.97, x: 6.43, y: 6.43, z: 5.62,
  '.': 3.64, '-': 4.55, ' ': 3.87,
};
const textWidth = (s) => [...s].reduce((w, ch) => w + (WIDTH[ch] ?? (/\d/.test(ch) ? 6.98 : 7.5)), 0);
const escape = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function badge(label, message, color = '#7c3aed') {
  const lw = Math.round(textWidth(label) + 10);
  const mw = Math.round(textWidth(message) + 10);
  const w = lw + mw;
  const text = (x, s) => `<text x="${x}" y="15" fill="#010101" fill-opacity=".3">${s}</text><text x="${x}" y="14">${s}</text>`;
  const [l, m] = [escape(label), escape(message)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${m}"><title>${l}: ${m}</title>`
    + `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`
    + `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>`
    + `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>`
    + `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${text(lw / 2, l)}${text(lw + mw / 2, m)}</g></svg>\n`;
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      if (attempt === 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const stats = await getJson(STATS);
for (const id of PLUGINS) {
  const downloads = stats[id]?.downloads;
  if (!Number.isInteger(downloads)) throw new Error(`no download count for ${id}`);
  const { version } = await getJson(`https://raw.githubusercontent.com/max-fluff/obsidian-${id}/main/manifest.json`);
  writeFileSync(join(out, `${id}-downloads.svg`), badge('downloads', String(downloads)));
  writeFileSync(join(out, `${id}-release.svg`), badge('release', `v${version}`));
}
