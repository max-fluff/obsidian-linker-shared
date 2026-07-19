'use strict';

// The family-wide priority order and the settings control for it. A plugin can only write
// its own settings, so the control does not reorder the list — it moves us within it, and
// every arrangement is reachable by moving each plugin from its own tab. Both sides publish
// their own number and read the others', so they cannot disagree.

const { discoverLinkers, outranks, siblingLinkers } = require('./discover');
const { t } = require('./i18n');

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

// Where `self` would land if it stored `value` — counted through `outranks` itself, so the
// answer cannot drift from how the order is actually resolved.
function indexForPrecedence(others, self, value) {
  const hypothetical = { precedence: value, id: self.id };
  return others.filter((o) => outranks(o, hypothetical)).length;
}

// The precedence `self` has to store to sit at `index`. Arithmetic cannot answer it: peers
// sharing a number are ordered by id, so a midpoint between equal neighbours reproduces the
// order it started from and the click does nothing. Candidates are tried against the real
// comparison instead.
function precedenceForIndex(app, self, index) {
  const others = rankedLinkers(app).filter((p) => p.id !== self.id);
  if (!others.length) return self.precedence || 0;

  const at = Math.max(0, Math.min(index, others.length));
  const values = others.map((p) => p.precedence || 0);

  // Gaps and ends first: they leave the order spread out, so the next move has somewhere to
  // land. Joining a tie is a last resort — it is what makes a run that later moves stick in.
  const candidates = [values[0] + STEP, values[values.length - 1] - STEP];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== values[i]) candidates.push((values[i - 1] + values[i]) / 2);
  }
  for (const v of values) candidates.push(v);

  // An exact hit wins outright. Failing that the slot sits inside a run of equal precedences,
  // which our own number cannot split, so we take the nearest slot in the direction asked —
  // moving further than requested beats leaving the click doing nothing.
  const from = currentIndex(app, self);
  const wanted = Math.sign(at - from);
  let best = null;
  let bestLanded = null;
  for (const v of candidates) {
    const landed = indexForPrecedence(others, self, v);
    if (landed === at) return v;
    if (Math.sign(landed - from) !== wanted) continue;
    if (best === null || Math.abs(landed - at) < Math.abs(bestLanded - at)) { best = v; bestLanded = landed; }
  }
  return best === null ? (self.precedence || 0) : best;
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

// The same control with the family's own wording filled in. All four plugins render it
// identically apart from their CSS prefix and where they store the number, so only those
// two are asked for; `renderPrecedence` stays label-agnostic for anyone outside the family.
function renderPrecedenceSetting(containerEl, opts) {
  renderPrecedence(containerEl, {
    app: opts.app,
    provider: opts.provider,
    Setting: opts.Setting,
    cls: opts.cls,
    name: t('set.precedence.name'),
    desc: t('set.precedence.desc'),
    otherDesc: t('set.precedence.other'),
    upTooltip: t('set.precedence.up'),
    downTooltip: t('set.precedence.down'),
    save: opts.save,
  });
}

module.exports = { STEP, rankedLinkers, precedenceForIndex, currentIndex, renderPrecedence, renderPrecedenceSetting };
