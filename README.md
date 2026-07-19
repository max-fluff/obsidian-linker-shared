# obsidian-linker-shared

Shared modules for the four linker plugins:

| Plugin | Kind | Links |
|---|---|---|
| [Heading Linker](https://github.com/max-fluff/obsidian-heading-linker) | prose | bare words → `[[Note#Heading]]` |
| [Glossary Linker](https://github.com/max-fluff/obsidian-glossary-linker) | prose | bare words → `[[Term note]]` |
| [Code Linker](https://github.com/max-fluff/obsidian-code-linker) | sigil | `@@ref` → deep links into a code tree |
| [Reference Linker](https://github.com/max-fluff/obsidian-reference-linker) | sigil | `@!ref` → deep links into documents |

Included in each plugin as a git submodule at `src/shared/` and inlined into the plugin
bundle by esbuild at build time, so nothing here ships on its own.

## What is in here

**Interop** — how the plugins stay out of each other's way when several are installed. One
word claimed by two of them is highlighted once, offered once in the menu, and completed from
one merged list.

- `discover.js` — finds the installed siblings and settles who owns a span
- `precedence.js` — the priority order and the settings control for it
- `link-owner.js` — who owns an existing link in a note
- `menu-verbs.js`, `menu.js` — menu items are declared with a verb; the builder decides when several plugins' items collapse into one submenu

**The prose pair** (`prose/`) — matching bare words and drawing them.

- `matcher.js` — the scan, smart case, protected ranges
- `highlight.js` — reading-view and editor decoration
- `provider.js` — the `api.linker` contract as both prose plugins implement it
- `editor-suggest.js`, `suggest.js` — autocomplete, merged across plugins
- `choices.js`, `modals.js` — the ambiguity list and the dialogs that edit notes
- `settings.js`, `folder-suggest.js` — the shared half of the settings tab

**The sigil pair** (`deeplink/`) — `suggest.js`, `folder-suggest.js`, plus `binding.js`,
`actualize.js`, `root-token.js` and `update-preview.js` for the link-binding grammar.

**Shared surface** — `i18n.js` + `locales/`, `markdown.js`, `morphology/` (the language
modules both prose plugins use), `folder-list.js`, `popover.js`, `index-events.js`,
`styles/`.

**Not shipped** — `build.mjs` (the esbuild driver), `testing/` (harness, stubs and the tests
all four suites run), `branding/` (asset conventions in [`BRANDING.md`](branding/BRANDING.md)
plus the generators driven by each plugin's `docs/branding.config.mjs`).

## Working on a plugin

Clone with submodules:

    git clone --recurse-submodules <plugin-url>

or, in an existing clone:

    git submodule update --init

After changing a module here, commit it, then bump the submodule pointer in each plugin
(`git add src/shared`) and rebuild.

[`CONTRIBUTING.md`](CONTRIBUTING.md) is the one to read first: it has the architecture, the
`api.linker` contract, the submodule discipline and the commit order, and the rules for
menus, CSS and locales.
