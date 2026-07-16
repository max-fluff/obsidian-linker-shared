// The family's two vector headers, built from the same brand config as the store plates:
//
//   banner.svg          960x260  — rounded card at the top of the README
//   social-preview.svg  1280x640 — GitHub's social preview image
//
// Pure string builders — SVG needs no browser, and stays crisp and diffable.

import { esc, MONO, SANS, markSvg } from './common.mjs';

// Scatter slots [x, y, fontPx, opacity] per canvas: a top and a bottom row hugging the
// edges, leaving the wordmark's band clear. Tokens are cycled onto them.
const BANNER_SCATTER = [
  [48, 50, 24, 0.11], [252, 42, 22, 0.09], [430, 52, 20, 0.08],
  [560, 46, 28, 0.12], [724, 50, 24, 0.10], [864, 48, 18, 0.08],
  [60, 222, 22, 0.10], [206, 240, 18, 0.08], [338, 224, 20, 0.09],
  [500, 238, 22, 0.11], [648, 222, 22, 0.10], [838, 236, 20, 0.09],
];

const SOCIAL_SCATTER = [
  [80, 96, 40, 0.10], [360, 80, 36, 0.08], [560, 100, 32, 0.07],
  [720, 86, 44, 0.11], [920, 96, 38, 0.09], [1120, 90, 30, 0.07],
  [90, 586, 36, 0.09], [300, 600, 30, 0.07], [470, 588, 34, 0.08],
  [680, 600, 38, 0.10], [850, 586, 36, 0.09], [1110, 598, 32, 0.08],
];

function cloud(brand, slots) {
  if (!brand.tokens || !brand.tokens.length) return '';
  const fam = brand.tokenMono ? MONO : SANS;
  const items = slots.map(([x, y, s, o], i) =>
    `    <text x="${x}" y="${y}" font-size="${s}" fill-opacity="${o}">${esc(brand.tokens[i % brand.tokens.length])}</text>`
  ).join('\n');
  return `  <g fill="${brand.tokenColor}" font-family="${fam}" font-weight="500">\n${items}\n  </g>`;
}

export function renderBanner(brand) {
  const [top, bottom] = brand.gradient;
  const wm = brand.wordmark || {};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 260" width="960" height="260" font-family="${SANS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
    <radialGradient id="scrim" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${bottom}" stop-opacity="0.92"/>
      <stop offset="0.6" stop-color="${bottom}" stop-opacity="0.82"/>
      <stop offset="1" stop-color="${bottom}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="card"><rect x="1" y="1" width="958" height="258" rx="24"/></clipPath>
  </defs>

  <rect x="1" y="1" width="958" height="258" rx="24" fill="url(#bg)" stroke="#ffffff" stroke-opacity="0.07"/>

  <g clip-path="url(#card)">
${cloud(brand, BANNER_SCATTER)}
  </g>

  <!-- focal scrim so the wordmark stays legible over the cloud -->
  <ellipse cx="380" cy="128" rx="360" ry="96" fill="url(#scrim)"/>

  <text x="60" y="124" font-size="56" font-weight="700" fill="#f4f4f6">${esc(wm.text || '')}</text>
  <text x="62" y="176" font-size="23" fill="#c2bfd2">${esc(brand.tagline || '')}</text>

${markSvg(brand.mark, 836, 130, 68)}
</svg>
`;
}

export function renderSocial(brand) {
  const [top, bottom] = brand.gradient;
  const wm = brand.wordmark || {};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640" font-family="${SANS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="1280" height="640" fill="url(#bg)"/>

${cloud(brand, SOCIAL_SCATTER)}

${markSvg(brand.mark, 640, 236, 118)}

  <text x="640" y="432" font-size="100" font-weight="700" fill="#f4f4f6" text-anchor="middle">${esc(wm.text || '')}</text>
  <text x="640" y="496" font-size="36" fill="#c2bfd2" text-anchor="middle">${esc(brand.tagline || '')}</text>
</svg>
`;
}
