'use strict';

// The family-wide priority order and the settings control for it. A plugin can only write
// its own settings, so the control does not reorder the list — it moves us within it, and
// every arrangement is reachable by moving each plugin from its own tab. Both sides publish
// their own number and read the others', so they cannot disagree.

const { discoverLinkers, outranks, siblingLinkers } = require('./discover');

// Gap left between ranks so a later move has somewhere to go without landing on a tie.
const STEP = 10;

// Highest priority first, ties by id — the same order `outranks` resolves in.
function rankedLinkers(app) {
  return discoverLinkers(app).slice().sort((a, b) => {
    if (outranks(a, b)) return -1;
    if (outranks(b, a)) return 1;
    return 0;
  });
}

// The precedence `self` has to store to sit at `index` of the order. Midway between the two
// neighbours rather than a fixed step, because their values are theirs, not ours, and may
// already sit closer together than STEP.
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

function currentIndex(app, self) {
  return rankedLinkers(app).findIndex((p) => p.id === self.id);
}

// Renders nothing when no sibling is installed — alone there is no order to argue about.
// `opts.Setting` is Obsidian's, passed in so this file stays free of bundle wiring;
// `opts.save(value)` persists our new precedence.
function renderPrecedence(containerEl, opts) {
  const { app, provider, Setting, name, desc, save } = opts;
  if (!provider || !siblingLinkers(app, provider).length) return;

  new Setting(containerEl).setName(name).setDesc(desc);

  // Class names are global and all four plugins render this, so the prefix is the caller's.
  const cls = opts.cls || 'linker';
  const list = containerEl.createDiv({ cls: `${cls}-precedence-list` });
  const draw = () => {
    list.empty();
    const ranked = rankedLinkers(app);
    ranked.forEach((p, i) => {
      const mine = p.id === provider.id;
      const row = new Setting(list).setName(`${i + 1}. ${p.displayName || p.id}`);
      if (!mine) {
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

  // A move changes the whole order, so peers re-render their highlights too.
  const refresh = () => {
    for (const p of siblingLinkers(app, provider)) {
      if (typeof p.refresh === 'function') { try { p.refresh(); } catch (e) { /* peer threw */ } }
    }
    draw();
  };

  draw();
}

module.exports = { STEP, rankedLinkers, precedenceForIndex, currentIndex, renderPrecedence };
