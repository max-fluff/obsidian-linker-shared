'use strict';

// The order the linker plugins take priority in, and the settings control for it.
//
// One number per plugin, one order across the whole family. The number is only ever consulted
// when two of them claim the same thing — a word both prose linkers match, a link both sigil
// linkers recognise — so a pair that never contests anything simply never reads it. That is
// why the order is family-wide rather than one per kind: the reader keeps a single list in
// their head, not two half-lists whose interaction they have to work out.
//
// The awkward part is that a plugin can only write its *own* settings. So this does not
// reorder the list; it moves us within it, and the others keep whatever they had. That is
// enough to reach any arrangement — move each plugin to where it belongs from its own tab —
// and it means the two sides never disagree, because each one publishes its own number and
// everybody reads the published values.

const { discoverLinkers, outranks, siblingLinkers } = require('./discover');

// Gap left between ranks so a later move has somewhere to go without landing on a tie.
const STEP = 10;

// Every installed linker, highest priority first. Ties fall back to the id, exactly as
// `outranks` does, so the list reads in the same order the matcher resolves in.
function rankedLinkers(app) {
  return discoverLinkers(app).slice().sort((a, b) => {
    if (outranks(a, b)) return -1;
    if (outranks(b, a)) return 1;
    return 0;
  });
}

// The precedence `self` has to store to sit at `index` of the family-wide order.
//
// Above everyone, below everyone, or midway between the two it lands between. Midway rather
// than a fixed step because the neighbours' values are theirs, not ours, and may already sit
// closer together than STEP.
function precedenceForIndex(app, self, index) {
  const others = rankedLinkers(app).filter((p) => p.id !== self.id);
  if (!others.length) return self.precedence || 0;
  const at = Math.max(0, Math.min(index, others.length));
  const above = at > 0 ? (others[at - 1].precedence || 0) : null;
  const below = at < others.length ? (others[at].precedence || 0) : null;
  if (above === null) return below + STEP;
  if (below === null) return above - STEP;
  return (above + below) / 2;
}

// Where we currently sit in that order.
function currentIndex(app, self) {
  return rankedLinkers(app).findIndex((p) => p.id === self.id);
}

// The setting itself: the whole family in priority order, with our own row the one that
// moves. Renders nothing at all when no sibling is installed — alone there is no order to
// argue about, and an empty ranking would only raise a question the reader doesn't have.
//
// `opts.save(value)` stores our new precedence and persists it; `opts.Setting` is Obsidian's,
// passed in rather than imported so this file stays free of the plugin's own bundle wiring.
function renderPrecedence(containerEl, opts) {
  const { app, provider, Setting, name, desc, save } = opts;
  if (!provider || !siblingLinkers(app, provider).length) return;

  new Setting(containerEl).setName(name).setDesc(desc);

  // Class names are a global namespace and all four plugins render this component, so the
  // prefix comes from the caller — same arrangement as the folder-list component.
  const cls = opts.cls || 'linker';
  const list = containerEl.createDiv({ cls: `${cls}-precedence-list` });
  const draw = () => {
    list.empty();
    const ranked = rankedLinkers(app);
    ranked.forEach((p, i) => {
      const mine = p.id === provider.id;
      const row = new Setting(list).setName(`${i + 1}. ${p.displayName || p.id}`);
      if (!mine) {
        // Another plugin's position is its own to change; saying so is kinder than a
        // disabled button with no explanation.
        row.setDesc(opts.otherDesc || '');
        return;
      }
      row.settingEl.addClass(`${cls}-precedence-self`);
      row.addExtraButton((b) => b
        .setIcon('arrow-up')
        .setTooltip(opts.upTooltip || '')
        .setDisabled(i === 0)
        .onClick(async () => { await save(precedenceForIndex(app, provider, i - 1)); refresh(); }));
      row.addExtraButton((b) => b
        .setIcon('arrow-down')
        .setTooltip(opts.downTooltip || '')
        .setDisabled(i === ranked.length - 1)
        .onClick(async () => { await save(precedenceForIndex(app, provider, i + 1)); refresh(); }));
    });
  };

  // Everyone reads everyone's published number, so a move has to redraw the others too —
  // otherwise the setting only half-applies until something else rebuilds.
  const refresh = () => {
    for (const p of siblingLinkers(app, provider)) {
      if (typeof p.refresh === 'function') { try { p.refresh(); } catch (e) { /* peer threw */ } }
    }
    draw();
  };

  draw();
}

module.exports = { STEP, rankedLinkers, precedenceForIndex, currentIndex, renderPrecedence };
