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

// Obsidian's mark from simple-icons (CC0), the same one shields.io draws for logo=obsidian.
const OBSIDIAN = 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';

function badge(label, message, { logo, color = '#7c3aed' } = {}) {
  const lead = logo ? 17 : 0;
  const lw = Math.round(textWidth(label) + 10 + lead);
  const mw = Math.round(textWidth(message) + 10);
  const w = lw + mw;
  const text = (x, s) => `<text x="${x}" y="15" fill="#010101" fill-opacity=".3">${s}</text><text x="${x}" y="14">${s}</text>`;
  const [l, m] = [escape(label), escape(message)];
  const icon = logo ? `<svg x="5" y="3" width="14" height="14" viewBox="0 0 24 24"><path fill="whitesmoke" d="${logo}"/></svg>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${m}"><title>${l}: ${m}</title>`
    + `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`
    + `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>`
    + `<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>`
    + icon
    + `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${text(lead + (lw - lead) / 2, l)}${text(lw + mw / 2, m)}</g></svg>\n`;
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
  writeFileSync(join(out, `${id}-downloads.svg`), badge('downloads', String(downloads), { logo: OBSIDIAN }));
  writeFileSync(join(out, `${id}-release.svg`), badge('release', `v${version}`));
}
