# Branding & visual assets

Shared look for the linker plugin family (Code Linker, Glossary Linker, …). Every plugin
ships the same *kinds* of assets with the same palette and structure, so a new plugin only
has to swap its mark, motif words, and copy. This folder also holds the generators that
build those assets from one config per plugin: `make-banner.mjs` and `make-plates.mjs`.

## Palette

One palette across the whole family — the plugins differ by mark and motif, not colour.

| Token | Value | Used for |
| --- | --- | --- |
| App-tile fill | `#6f5bd0` | the rounded-square icon background |
| Backdrop top | `#27243d` | banner / social / plate gradient (top) |
| Backdrop bottom | `#191826` | …gradient (bottom) |
| Motif | `#b6a6e8` | the faint token/word cloud |
| Heading text | `#f4f4f6` | wordmark, plate titles |
| Subtle text | `#c2bfd2` | taglines, captions |

Type is the system UI stack (`-apple-system, 'Segoe UI', Roboto, …`); code/mono motifs use
`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.

## The mark

Each plugin has one **white-only** glyph that reads at 16px. Keep it monochrome — colour
comes from the tile, never the mark.

- **Code Linker** — the text glyph `[{}]` in the monospace stack, weight 700.
- **Glossary Linker** — a white bar with a dashed underline (a highlighted term): a filled
  `rect` plus a `stroke-dasharray` line.

A new plugin picks a glyph in the same spirit (simple, geometric, legible tiny) and reuses
it everywhere: icon, banner, and store-plate corner mark.

## Assets every plugin ships

All vector (SVG) except the raw screenshots — SVG stays crisp at any size and is easy to
diff and re-theme. Live in each plugin's `docs/images/`.

| File | Size (viewBox) | What it is | Source |
| --- | --- | --- | --- |
| `icon.svg` | 512×512 | store/app icon: `#6f5bd0` rounded square (`rx=116`), white mark centered at ~30% width | hand-written |
| `icon-mono.svg` | 100×100 | monochrome mark in `currentColor`, no tile — for one-colour contexts | hand-written |
| `banner.svg` | 960×260 | README hero card | `npm run banner` |
| `social-preview.svg` | 1280×640 | GitHub "social preview" image (Settings → General) | `npm run banner` |

### Icon

The two icons are hand-written — they're small and rarely change. Rounded square,
`rx = 116/512` of the side. Mark centered, white, roughly a third of the tile so it
survives downscaling to 16px. The mono variant drops the tile and paints the mark in
`currentColor` so Obsidian can tint it.

### Banner & social preview (`make-banner.mjs`)

Both are **generated** from the brand config — no browser involved, SVG is just built as
text:

```sh
npm run banner            # → docs/images/banner.svg + social-preview.svg
```

The two canvases share one recipe:

1. Vertical gradient `gradient[0] → gradient[1]` on a rounded card (`rx=24` on the banner;
   full bleed on the social image).
2. A faint **motif cloud** — `brand.tokens` cycled onto fixed slots at low opacity
   (`0.06–0.12`), in the mono or sans stack per `tokenMono`.
3. A **focal scrim** (a soft radial `ellipse`) behind the banner's wordmark, so the text
   stays legible over the cloud.
4. **Wordmark** (700, `#f4f4f6`) + **tagline** (`#c2bfd2`), and the **mark** — flush right
   on the banner, centered above the wordmark on the social image.

Keep `brand.tagline` identical to `manifest.json`'s description so the family reads
consistently.

Layout constants (slot positions, mark box, type sizes) live in `banner-template.mjs` —
the config supplies only content and colour, so every plugin's header lines up.

## Screenshots

Raw feature screenshots for the README, saved as `docs/images/<name>.png`.

- Shoot in Obsidian's **default dark theme** with a purpose-built demo note/vault (the
  plugins keep one under `test-vault/`), so the content is clean and self-explanatory.
- Crop tight to the feature — the popover, the dialog, the settings block — not the whole
  window. Zoom the view in for a retina-crisp capture.
- Embed centered with an explicit width and descriptive alt text:
  ```html
  <p align="center">
    <img src="docs/images/hover.png" alt="The hover preview popover over a code link" width="560">
  </p>
  ```
- Name by feature (`hover.png`, `overview.png`), matching the README section.

## Store plates (`make-plates.mjs`)

The Obsidian community-store listing takes its own screenshots (recommended **1200×800**,
3:2). `make-plates.mjs` floats each raw screenshot on the branded backdrop — gradient, motif
cloud, corner mark + wordmark, and a title/caption — and rasterizes it with headless
Chromium (Chrome or Edge; auto-detected, or set `PLATES_BROWSER`).

```sh
npm run plates            # reads docs/branding.config.mjs
npm run plates -- docs/other.config.mjs
```

Output lands in `docs/images/store/`, committed alongside the repo and regenerable — re-run
whenever a source screenshot or caption changes, then upload the set to the store listing.

Canvas size and layout (mark position, caption band, screenshot max-box) live in
`plate-template.mjs`; the config only supplies content and colour.

## The config (`docs/branding.config.mjs`)

One file per plugin, read by **both** generators — so a new plugin's whole visual identity
is this object.

```js
export default {
  imagesDir: 'docs/images',        // raw screenshots in, banners out (default)
  outDir: 'docs/images/store',     // where plates are written (default)
  brand: {
    gradient: ['#27243d', '#191826'],
    tokenColor: '#b6a6e8',
    tokenMono: true,               // monospace motif (Code) vs sans (Glossary)
    tokens: ['.cs', 'TypeScript', /* … */],   // cycled onto fixed slots
    mark: { kind: 'glyph', text: '[{}]' },
    wordmark: { text: 'Code Linker' },
    tagline: 'Autocomplete code references, jump to the exact line.',
  },
  plates: [
    { src: 'suggest.png', title: 'Autocomplete code references',
      caption: 'Type @@ and pick a class, function, or file.' },
    // …one entry per plate
  ],
};
```

| Field | Notes |
| --- | --- |
| `brand.gradient` | `[top, bottom]` backdrop colours |
| `brand.tokenColor` / `tokenMono` | motif-cloud colour and monospace-vs-sans |
| `brand.tokens` | strings for the cloud; cycled onto fixed slots (14 per plate, 12 per banner) |
| `brand.mark` | `{ kind:'glyph', text, mono? }` — a text mark; or `{ kind:'svg', viewBox, body }` — vector body in its own coordinate space, scaled and centered by each renderer |
| `brand.wordmark` | `{ text }` — drawn beside the mark |
| `brand.tagline` | one line under the wordmark; keep it equal to `manifest.json`'s description |
| `plates[]` | `{ src, title, caption }` — `src` is a filename in `imagesDir` |

Defining `mark` once as data (rather than as ready-made markup) is what lets the same glyph
render as HTML in a plate and as vector in a banner.

## Adding a new plugin to the family

1. Copy a `docs/branding.config.mjs` and swap `tokens`, `mark`, `wordmark`, `tagline`,
   and the `plates` list.
2. Add both scripts to `package.json`:
   ```json
   "plates": "node src/shared/branding/make-plates.mjs",
   "banner": "node src/shared/branding/make-banner.mjs"
   ```
3. `npm run banner` — the README header and social preview are done.
4. Hand-write `icon.svg` / `icon-mono.svg` from the icon recipe, reusing the same mark.
5. Capture feature screenshots into `docs/images/`, embed them in the README, list them in
   `plates`, then `npm run plates` and upload `docs/images/store/*` to the store listing.
