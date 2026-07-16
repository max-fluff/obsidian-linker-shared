# obsidian-linker-shared

Shared modules for the [Code Linker](https://github.com/max-fluff/obsidian-code-linker)
and [Glossary Linker](https://github.com/max-fluff/obsidian-glossary-linker) Obsidian
plugins. Included in each plugin as a git submodule at `src/shared/` and inlined into the
plugin bundle by esbuild at build time, so nothing here ships on its own.

- `markdown.js` — markdown source-context helpers (protected ranges, fences, links, GFM table cells)
- `i18n.js` — interface localization engine; the plugin injects its own locale set via `initI18n(locales)`
- `folder-list.js` — reusable folder-set settings editor, parameterized by CSS prefix and suggest source
- `build.mjs` — shared esbuild driver
- `branding/` — visual-asset conventions ([`BRANDING.md`](branding/BRANDING.md)) plus the generators driven by each plugin's `docs/branding.config.mjs`: `make-banner.mjs` (README banner + social preview, as SVG) and `make-plates.mjs` (store screenshot backdrops)

The runtime modules are bundled into `main.js`; `build.mjs` and `branding/` are dev tooling
that never ships.

## Working on a plugin

Clone with submodules:

    git clone --recurse-submodules <plugin-url>

or, in an existing clone:

    git submodule update --init

After changing a module here, commit it, then bump the submodule pointer in each plugin
(`git add src/shared`) and rebuild.
