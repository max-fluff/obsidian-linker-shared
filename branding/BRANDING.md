# Branding & visual assets

Shared look for the linker plugin family (Code Linker, Glossary Linker, …). Every plugin
ships the same *kinds* of assets with the same palette and structure, so a new plugin only
has to swap its mark, motif words, and accent. This folder also holds `make-plates.mjs`,
the generator for the store screenshot backdrops.

## Palette

One palette across the family; only the **accent** shifts per plugin.

| Token | Value | Used for |
| --- | --- | --- |
| App-tile fill | `#6f5bd0` | the rounded-square icon background |
| Backdrop top | `#27243d` | banner / social / plate gradient (top) |
| Backdrop bottom | `#191826` | …gradient (bottom) |
| Motif | `#b6a6e8` | the faint token/word cloud |
| Heading text | `#f4f4f6` | wordmark, plate titles |
| Subtle text | `#c2bfd2` | taglines, captions |
| Accent | plugin-specific | dotted underline, highlights — Glossary `#a68cff`, Code `#7c6cf0` |

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

| File | Size (viewBox) | What it is |
| --- | --- | --- |
| `icon.svg` | 512×512 | store/app icon: `#6f5bd0` rounded square (`rx=116`), white mark centered at ~30% width |
| `icon-mono.svg` | 100×100 | monochrome mark in `currentColor`, no tile — for one-colour contexts |
| `banner.svg` | 960×260 | README hero card |
| `social-preview.svg` | 1280×640 | GitHub "social preview" image (Settings → General) |

### Icon

Rounded square, `rx = 116/512` of the side. Mark centered, white, roughly a third of the
tile so it survives downscaling to 16px. The mono variant drops the tile and paints the
mark in `currentColor` so Obsidian can tint it.

### Banner & social preview

Same recipe at two aspect ratios:

1. Vertical gradient `#27243d → #191826` on a rounded card (`rx=24` on the banner; full
   bleed on the social image).
2. A faint **motif cloud** — short strings scattered at low opacity (`0.06–0.12`) in the
   plugin's own vocabulary: Code Linker uses file extensions and language names in the mono
   stack; Glossary Linker uses the word "word" in several languages, in the sans stack.
3. A **focal scrim** (a soft radial `ellipse`) behind the wordmark on busy layouts, so the
   text stays legible over the cloud.
4. **Wordmark** (700, `#f4f4f6`) + **tagline** (`#c2bfd2`), and the **mark** placed to one
   side. Glossary underlines its first word with the dotted accent.

Keep the tagline identical to `manifest.json`'s description so the family reads consistently.

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
npm run plates            # reads docs/store-plates.config.mjs
npm run plates -- docs/other.config.mjs
```

Output lands in `docs/images/store/`, committed alongside the repo and regenerable — re-run
whenever a source screenshot or caption changes, then upload the set to the store listing.

### Config (`docs/store-plates.config.mjs`)

```js
export default {
  imagesDir: 'docs/images',        // where the raw screenshots are (default)
  outDir: 'docs/images/store',     // where plates are written (default)
  brand: {
    gradient: ['#27243d', '#191826'],
    accent: '#7c6cf0',
    tokenColor: '#b6a6e8',
    tokenMono: true,               // monospace motif (Code) vs sans (Glossary)
    tokens: ['.cs', 'TypeScript', /* … */],   // scattered onto fixed slots, cycled
    mark: { kind: 'glyph', text: '[{}]' },     // or { kind: 'svg', svg: '<svg…>' }
    wordmark: { text: 'Code Linker' },         // add underline:'Word' for the dotted accent
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
| `brand.accent` | dotted-underline colour (only visible when `wordmark.underline` is set) |
| `brand.tokenColor` / `tokenMono` | motif-cloud colour and monospace-vs-sans |
| `brand.tokens` | words/strings for the cloud; mapped onto 14 fixed slots, cycling if fewer |
| `brand.mark` | `{ kind:'glyph', text, mono? }` or `{ kind:'svg', svg }` |
| `brand.wordmark` | `{ text, underline? }` — `underline` must be a leading substring of `text` |
| `plates[]` | `{ src, title, caption }` — `src` is a filename in `imagesDir` |

Canvas size and layout (mark position, caption band, screenshot max-box) live in
`plate-template.mjs`; the config only supplies content and colour.

## Adding a new plugin to the family

1. Pick an accent and a white mark; write `icon.svg`, `icon-mono.svg`, `banner.svg`,
   `social-preview.svg` from the recipes above.
2. Capture feature screenshots into `docs/images/`, embed them in the README.
3. Copy a `docs/store-plates.config.mjs`, swap `accent`, `tokens`, `mark`, `wordmark`, and
   the `plates` list; add `"plates": "node src/shared/branding/make-plates.mjs"` to
   `package.json`.
4. `npm run plates`, then upload `docs/images/store/*` to the store listing.
