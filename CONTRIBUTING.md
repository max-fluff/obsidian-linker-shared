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
| `matches(text)` | Spans this plugin claims: `{start, end, label, target}`, plus an optional `alts: [{label, target}]` for the other meanings this plugin has for the same span. Without `alts` a consumer sees only the one this plugin settled on, and a word two of its notes claim reads as a single row. A pure index question — whether the plugin is switched on anywhere is `drawsIn`'s business, not this one's. |
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
  (code), `sec:`/`cite:` (reference), `{code-root}`/`{ref-root}`/legacy `{root}`. Notes
  outlive every plugin version.

### Facets: one projection, three uses

A sigil plugin declares each way an index entry can be addressed once, as a **facet** — a
projection from an entry to a value (`facets.js`). That one projection answers all three
questions the plugins used to answer separately: which entries a typed filter keeps, what the
typed text is matched against, and what a link pins to. Adding a way to address an entry is a
row in the plugin's facet list, not an edit in three files.

How a facet is typed follows from how many values it has, and this is the rule to apply when
adding one:

- **Enumerable** (a language, a kind) — typed as the value alone: `py:`, `def:`. Declare
  `typed: VALUE` and a `resolve(token)`.
- **Unbounded** (a citation key, a section name) — typed after its own token:
  `cite:knuth1984`. Declare `typed: TOKEN`. It ends the prefix run, takes the rest as the
  value, and redirects what the suggest matches against.

A facet that also declares an `anchor` is pinnable, and the anchor must be a row in
`binding.js`'s `ANCHOR_LIST` — that list is the frozen wire format (tokens, fields, owners and
the order `formatBinding` writes them), so one anchor is one row there and nowhere else. Where
the pinned value comes from is the plugin's: reference reads it off the entry (`of`), code off
the spot in the file the link points at (`pinFrom`), since that is what each pins from.

Not every facet does both, and forcing it would lie: `line:` pins to a hash of the source
line, which no one can type, and a file extension filters well but is already in the path, so
pinning it would say nothing the link does not.

### Two link grammars

`markdown.js` owns `[text](url "title")` and `wikilink.js` owns `[[file#heading^block|display]]`.
The sigil pair writes markdown links, the prose pair writes wikilinks, and neither grammar is
ever re-implemented in a plugin. Two things are worth knowing before touching `wikilink.js`:
a rewrite walks right to left so the offsets still to come stay true, which means a caller
keying its changes by a counter numbers them backwards — key by `link.start` instead; and
inside a table cell the alias pipe is written `\|`, stripped on the way in and put back on the
way out, or it ends up inside the heading.

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
- The `/* @settings */` block at the head of `src/styles.css` is the Style Settings plugin's
  wire format, and `announceStyleSettings(this)` in `onload` is what makes it show up there:
  Style Settings reads the document's sheets when it loads, and ours arrive with us.
- Inside that block, `%rows:<name>%` alone on a line is replaced by
  `styles/<name>.settings.yml` from here — the rows a plugin shares with its kind
  (`prose`, `sigil`), with the autocomplete (`pickers`) or with the other plugin that has a
  side panel (`panels`). A plugin takes only the fragments it can honour: a panel row in a
  plugin with no panel is a setting that does nothing. Its own rows follow a token and
  continue whichever section that fragment ended on, so a fragment's last heading is the one
  a plugin extends. Lines starting with `#` are the fragment's own notes and are dropped
  rather than shipped.
- Style Settings emits a variable only once the user stores a value for it, into
  `body.css-settings-manager`. So an untouched row shows whatever the CSS says on its own,
  and a stored one always outranks it.
- **Colours are `variable-color` with no `default:`, and the variable is declared on `:root`.**
  Given no default, Style Settings shows the variable's live computed value, so the picker
  opens on the colour actually in use — declare it as the theme's own (`var(--link-color)`,
  `var(--text-warning)`) and both the picker and the rendering follow the theme until someone
  picks otherwise. An undeclared variable reads as empty and the row does not render at all;
  a suite test catches that. Do not use `variable-themed-color`: it hands its picker `c || ""`
  for an untouched setting, so the swatch comes up blank.
- **A theme colour must be resolved before Style Settings can draw it** — that is what
  `trackThemeColors(plugin, prefix, colors)` is for, and every plugin calls it in `onload`. A
  custom property keeps `calc()` unevaluated and drops an undefined `var()`, and Obsidian's
  accent chain uses both, so `--link-color` reads back as
  `hsl(calc(254 - 1), calc(80% * 1.01), …)` or as nothing. Style Settings' own check is only
  `/^(#|rgb|hsl)/`, so the first passes it and then chroma throws on it and the swatch is
  blank. The module settles each colour through a real `color` property, giving a plain
  `rgb()`, and rewrites it on `css-change`. Its sheet selects `:root`, one step of inheritance
  below `body`, so a colour set there — by Style Settings or by a snippet — reaches the mark
  first; on `body` the sheet and a snippet met as equals and the later stylesheet won, which
  Obsidian reshuffles on every reload. Anything chained off a resolved colour in CSS
  (`--%p%-ambiguous-color: var(--%p%-link-color)`) comes out resolved too.
- Everything that is not a colour keeps its resting value as the `var()` fallback in the rule,
  not as the row's `default:` — the `default:` only fills the widget.
- **A link's appearance is decided in `--pl-*` / `--sl-*`, and spent by one rule.** State goes
  into private variables no theme competes for; one declaration block spends them. Add a
  property to that block rather than giving it a rule of its own.
- **Specificity is frozen at what each state already had.** Reading view builds a match as a
  real `<a>`, so a theme's link rules land on ours too and sometimes win. With nothing set that
  is not a bug to fix: the plugins must render exactly as they did before any of this was
  configurable, and raising a selector to beat a theme changes the default look for everyone
  using that theme. The applying rule therefore lists `:hover` with no declarations of its own,
  purely so each state keeps the specificity its old rule had, and `text-decoration` is the one
  property answered higher up — a theme's underline lands a second line under our own.
- **Every colour resolved here comes back in sRGB.** Style Settings' own check is
  `/^(#|rgb|hsl)/`, and since Obsidian 1.13 a base colour settles as `oklch(...)`, so a theme
  that maps `--link-color` onto one leaves the picker with nothing to draw. Nothing in CSS
  converts a colour back — `rgb(from ...)` serialises as `color(srgb ...)`, which that check
  rejects too — so `asSrgb` paints anything outside those three into a 1×1 canvas and reads the
  pixel. A value already in sRGB is passed through rather than round-tripped, which would drift
  it by a step and undo `capAlpha`'s own rounding.
- **What the reader asked for outranks the theme; what they left alone does not.** A colour
  the reader set no longer resolves to what the stylesheet declares for it, whether it was
  stored by Style Settings or written in a snippet, and that is what `PROSE_PICKS` /
  `SIGIL_PICKS` name: each entry is the expression the colour settles to while untouched, and
  `trackThemeColors` puts `<prefix>-<name>-picked` on the body for the ones that no longer
  match. Both sides settle through the same probe, so a stored hex and a theme's rgb() compare
  as colours; a colour set to exactly the theme's own reads as untouched, and looks it. Those
  classes, the hue modes and the class-toggle `<prefix>-quiet` are the only selectors that
  answer a theme, with `color: var(--pl-ink) !important` — 1.6.0 shipped without them, and a
  set colour reached the underline while the theme's own stayed on the word. A colour that no
  theme competes for (a background, a stale or broken mark) belongs in neither map.
- **A relative colour lives inside `@supports (color: oklch(from red l c h))`.** The hue modes
  derive the ink from the theme's own link colour where the mark sits. An installer without
  relative colours keeps such a custom property and drops it where it is spent, which would
  leave the mark with the inherited text colour; the block keeps the mode out of that build
  instead, and the picked or themed colour stands. A suite test fails on one outside a block.
- **An unpicked colour is read where the mark sits.** `--pl-ink: var(--link-color)`, not the
  body-level `--<prefix>-link-color`: a theme that recolours links per note sets `--link-color`
  on the container, which is what a `cssclass` does, and the body-level copy freezes the mark
  to the global colour. The body-level declaration exists for the picker, and the picked rules
  are what spend it.
  Check it rather than trust it: render the same markup under `git show HEAD:styles.css` and
  under the build, and diff `getComputedStyle` for every state. A difference with no setting
  applied is a regression.
- A `--<prefix>-*` custom property means a Style Settings knob, and the suites enforce it in
  both directions: a declared row nothing reads fails, and a property read but not offered
  fails. A variable the plugin sets from code is named off the prefix instead (`--cl-lh`,
  `--rl-player-fill`).
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
  missing guard would break, a bug that was actually shipped here. Not what the next line
  does. The default is none: code that needs a comment usually needs a better name.
  - One or two lines. A paragraph belongs in this file, with the code pointing at it.
  - One place per fact. A reason worth writing in two files belongs here and nowhere else —
    repeating it across the five working copies is how they drift apart.
  - Module headers say what the module is for in three lines at most, not how it works.
  - Tests document themselves: the `describe`/`it` names are the documentation. Comment a
    test only when the reason it exists is not already in its name.
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
- An embed's **toolbar carries only what changes the view** — a page, a zoom, how a snippet is
  wrapped. Anything that edits the note the block sits in — pinning, unpinning, fixing a drifted
  window, writing a view back — belongs to the menu behind `⋯`, which is the right-click menu
  and repeats the toolbar's own actions for an embed that failed and has no toolbar to show.
  A stray click on a toolbar must never rewrite a note.
- Commits: one-line imperative subject, no body.
- Keep the Obsidian plugin review guidelines in mind: `this.app` only, `vault.process` for
  note edits, feature-detect APIs newer than the minimum app version.
