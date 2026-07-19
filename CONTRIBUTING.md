# Contributing to the Linker family

Four Obsidian plugins share this repository as a git submodule:

| Plugin | Kind | Links |
|---|---|---|
| `obsidian-heading-linker` | prose | bare words → `[[Note#Heading]]` |
| `obsidian-glossary-linker` | prose | bare words → `[[Term note]]` |
| `obsidian-code-linker` | sigil | `@@ref` → deep links into a code tree |
| `obsidian-reference-linker` | sigil | `@!ref` → deep links into documents (PDF pages, images) |

The prose pair matches words in running text; the sigil pair resolves explicit references.
Within a pair the plugins are near twins; across pairs they share little beyond this
repository and the interop contract.

## Repository layout

Each plugin vendors this repo at `src/shared/` (a submodule checkout). There are five
working copies: the canonical repo plus four vendored ones. **They must stay byte-identical.**

The working discipline:

1. Edit the canonical repo (or one vendored copy — but pick one and sync from it).
2. Copy the tree over every `src/shared/` (everything except `.git`).
3. Rebuild and run tests in all four plugins.
4. Commit here first, fast-forward each `src/shared/` to that commit, then commit the
   plugins with the submodule bump.
5. Push this repo **before** pushing any plugin — a pushed plugin pointing at an unpushed
   submodule commit breaks everyone's checkout and CI.

## How the plugins talk to each other

Interop is **data-only**, through the documented plugin-API route:

```js
const provider = this.app.plugins.plugins['glossary-linker']?.api?.linker;
```

No plugin ever loads another's code. No globals, nothing behind the app's back, and always
`this.app` — never the global `app` (an Obsidian review requirement). A plugin with no
siblings installed must behave exactly as it did before any of this existed.

`api.linker` is the provider contract. All fields are read through `shared/discover.js`,
`shared/link-owner.js` and `shared/precedence.js`, which guard every access:

| Member | Meaning |
|---|---|
| `apiVersion` | Contract version, currently `1`. Consumers filter on `>=`. |
| `id`, `displayName` | Plugin id; human name for UI. |
| `kind` | `'prose'` or `'sigil'`. Self-description; nothing consumes it today. |
| `precedence` | Getter onto the plugin's setting. Higher wins a contested span; ties break by `id` so both sides reach the same verdict. |
| `matches(text)` | Spans this plugin claims: `{start, end, label, target}`. A pure index question — whether the plugin is switched on anywhere is `drawsIn`'s business, not this one's. |
| `describe(target, display)` | How one of this plugin's targets reads in a list of a word's meanings: `{title, note}`. One word can be claimed by several notes, so a row showing only the target renders as the same string repeated; the `note` is what tells it from its neighbour — the kind, where it lives, and which of your forms matched. `display` is the word the reader actually touched, which is the only way to say "you clicked A, this is B under its alias A" — drop it and every alias caption silently disappears. Asked only when a list is drawn. Optional; without it a row falls back to the bare target. |
| `drawsIn(sourcePath, surface)` | Whether this plugin would put anything on that surface of that note — `'reading'`, `'editing'` or `'menu'`. Consumers ask before yielding a span: a plugin that claims a word it will not draw leaves the word shown by nobody. Optional; a peer without it is taken to draw everywhere, as it did before the member existed. |
| `open(target, sourcePath, newTab)` | Open one of this plugin's targets. Only the owner interprets its own target format. |
| `hover(target, event, el, sourcePath, hoverParent)` | Preview one of this plugin's targets anchored to someone else's element. |
| `suggest(query, sourcePath)` | Autocomplete candidates: `{label, note, target, display}`. `display: null` means "keep what the reader typed". Apply your own autocomplete switch, scope and thresholds here: Obsidian gives the popup to whichever suggester triggered first, and that one cannot answer them for you. |
| `insertFor(target, display, inTable)` | What choosing this plugin's suggestion writes — a link, or the bare display when this plugin is in plain-text mode. The popup owner writes it but never composes it: the popup goes to whichever suggester triggered first, so the decision has to follow the row's owner. |
| `linkFor(target, display, inTable)` | Compose this plugin's link text. Superseded by `insertFor`, which answers the same question but may decline to make a link; kept because peers built before `insertFor` call this one. Consumers try `insertFor` first. |
| `claim(target, title)` | `'binding'` \| `'index'` \| `null` — how strongly a markdown link is this plugin's. A binding anchor beats an index hit. |
| `offers(kind, text)` | Whether this plugin would add a menu entry of that verb (`'convert'`, `'open'`), asked before either plugin writes one. |
| `refresh()` | Re-render after a sibling changed the precedence order. |

Two more shared surfaces exist besides `api.linker`:

- **`__linkerMenuSections`** — a non-enumerable property parked on the menu object Obsidian
  hands round, holding shared submenus keyed by verb. It is the only memory two bundled
  copies of `menu.js` have in common.
- **Binding anchors and root tokens in the notes themselves** — `sym:`/`kind:`/`line:`
  (code), `sec:` (reference), `{code-root}`/`{ref-root}`/legacy `{root}`. Notes outlive
  every plugin version.

## Version drift

Plugins update independently, so one vault can run plugins built from different commits of
this repo. That is a supported configuration, not an error. The rules that keep it working:

- **Grow the contract additively.** New members are fine; consumers already
  `typeof`-check everything. Do not change the meaning, signature or return shape of an
  existing member — that is the one thing that would require bumping `LINKER_API`, and the
  price is that older siblings stop seeing the plugin entirely. Prefer a new member.
- **Frozen names.** The `__linkerMenuSections` key, the menu verb kinds, the `RANK` claim
  grades, the binding anchor words and the root tokens are wire format. Never rename them;
  the parked submenu value must stay whatever `setSubmenu()` returns.
- **Degrade, never crash.** A peer missing a member contributes nothing (menus fall back to
  flat per-plugin entries, no merged suggestions, no ownership deference — the pre-interop
  behaviour). A peer that throws costs only its own contribution. An unknown `claim` grade
  reads as no claim.
- The drift cases are pinned in `testing/tests/discover.test.js` and
  `testing/tests/link-owner.test.js`, which every plugin's suite runs. If you touch the
  contract, extend them.

## Building and testing

- Plain CommonJS, no TypeScript. `obsidian` and `@codemirror/*` are externals; esbuild
  bundles everything else — including this repo — into each plugin's `main.js`.
- `main.js` and `styles.css` are **committed build artifacts**; CI fails if they drift from
  their sources. After any change: `npm run build` in each plugin, then `npm test`.
- **Never edit a plugin's root `styles.css`** — it is assembled by the build from
  `styles/common.css` + `styles/{prose,sigil}.css` here and the plugin's own
  `src/styles.css`, in that order, so a plugin rule wins a tie. `%p%` stands for the
  plugin's class prefix (declared in its `esbuild.config.mjs`) and is substituted in both,
  so moving a rule between shared and plugin is a plain cut and paste.
- Keep styling native: reach for Obsidian's CSS variables (`--text-muted`,
  `--background-modifier-border`, `--radius-s`, `--layer-popover`) rather than literal
  values, and scope every selector to a `%p%-` class — an unscoped `.setting-item` rule
  restyles other plugins' settings panes.
- `.github/workflows/build.yml` is byte-identical in all four plugins and cannot move here —
  GitHub only reads workflows from the repository itself. Change one, copy to the others.
- Tests use the zero-dependency harness at `testing/harness.js` (Node 16 has no
  `node:test`; the API is the same `describe`/`it` subset, plain `node:assert`). Tests for
  this repo's modules live in `testing/tests/` and are run by all four plugin suites;
  plugin-specific tests live in each plugin's `test/`.
- When you add a test, break the code it guards and watch it fail before trusting it. More
  than one bug here has hidden behind a stub that silently dropped the code path.

## Style

- Comments state constraints the code cannot show — why something must not change, what a
  missing guard would break. Not what the next line does.
- Menu items are **declared, not written**. An editor-menu handler runs inside
  `buildMenu(this, menu, (menu) => …)` and tags anything several plugins might offer on the
  same object with its verb: `menu.tagged('exclude', { value }, (item, grouped) => …)`. Once
  the handler finishes, the builder counts its items plus — through `offers(verb, text)` —
  the siblings', and past one the verb becomes a shared submenu. Nothing counts by hand, so
  adding a second item anywhere regroups the menu on its own.
  - The verb vocabulary is `VERBS` in `menu-verbs.js`. A new shared verb is a line there
    plus an answer from each plugin's `offers()`.
  - Only tag what **more than one plugin can offer at once**. Actions with a single owner —
    unlink, collect alias, link this word — are already unique by ownership, so tagging them
    would produce a submenu holding one line.
  - A submenu must earn itself: a lone item stays flat. `menu.section(label, icon)` is the
    exception, for a plugin's own set of related items that only read together.
  - Deciding up front is not a style choice: an item already in Obsidian's menu cannot be
    pulled back out and reparented.
- Commits: one-line imperative subject, no body.
- Keep the Obsidian plugin review guidelines in mind: `this.app` only, `vault.process` for
  note edits, feature-detect APIs newer than the minimum app version.
