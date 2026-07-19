'use strict';

const { Setting } = require('obsidian');
const { t } = require('../i18n');
const { renderFolderList } = require('../folder-list');

// The two prose settings tabs differ in which sections they show and what they slip between
// them, not in what a section holds. A tab is the call order plus its own extras; see
// createProseSettings at the foot of the file for the entry point.

const settingsOf = (ctx) => ctx.tab.plugin.settings;

// Which tabs have the language list open. Off the tab because that object is the plugin's:
// a plugin with a `showLanguages` of its own would collide with ours in silence. It outlives
// display(), which runs again the moment the chevron is hit.
const openLanguages = new WeakSet();

// A number box holding a count of characters. Anything below 1 is stored as 1, so the
// settings file never carries a 0 that reads as "no minimum" but behaves as 1.
function positiveNumber(containerEl, ctx, key, rebuild) {
  const s = settingsOf(ctx);
  new Setting(containerEl)
    .setName(t(`set.${key}.name`))
    .setDesc(t(`set.${key}.desc`))
    .addText((c) => {
      c.inputEl.type = 'number';
      c.inputEl.min = '1';
      c.setValue(String(s[key])).onChange(async (v) => {
        const n = parseInt(v, 10);
        s[key] = Number.isFinite(n) && n > 0 ? n : 1;
        await ctx.save(rebuild);
      });
    });
}

// How a bare word is matched against the index. The mode and the length floor both
// change what the index yields, so each one rebuilds.
function renderMatchMode(containerEl, ctx) {
  const s = settingsOf(ctx);

  new Setting(containerEl)
    .setName(t('set.matchMode.name'))
    .setDesc(t('set.matchMode.desc'))
    .addDropdown((d) => d
      .addOption('stemmer', t('set.matchMode.stemmer'))
      .addOption('endingStrip', t('set.matchMode.endingStrip'))
      .addOption('exact', t('set.matchMode.exact'))
      .setValue(s.matchMode)
      .onChange(async (v) => { s.matchMode = v; await ctx.save(true); }));

  positiveNumber(containerEl, ctx, 'minTermLength', true);

  new Setting(containerEl)
    .setName(t('set.smartCase.name'))
    .setDesc(t('set.smartCase.desc'))
    .addToggle((c) => c.setValue(s.smartCase).onChange(async (v) => { s.smartCase = v; await ctx.save(true); }));
}

// Closes the matching section. `linkFirstOnly` only changes how many matches are drawn,
// so it skips the rebuild that the exclusion list needs.
function renderMatchLimits(containerEl, ctx) {
  const s = settingsOf(ctx);

  new Setting(containerEl)
    .setName(t('set.linkFirstOnly.name'))
    .setDesc(t('set.linkFirstOnly.desc'))
    .addToggle((c) => c.setValue(s.linkFirstOnly).onChange(async (v) => { s.linkFirstOnly = v; await ctx.save(false); }));

  new Setting(containerEl)
    .setName(t('set.excludeTerms.name'))
    .setDesc(t('set.excludeTerms.desc'))
    .addTextArea((c) => {
      c.setValue(s.excludeTerms).onChange(async (v) => { s.excludeTerms = v; await ctx.save(true); });
      c.inputEl.rows = 3;
    });
}

// Re-reading the language set changes every stem, so the whole index goes and the tab
// redraws — the enabled count in the section description is part of what changed.
async function applyLanguageChange(ctx) {
  const plugin = ctx.tab.plugin;
  await plugin.saveSettings();
  plugin.refreshActiveLanguages();
  plugin.rebuildIndex();
  plugin.rerenderViews();
  ctx.tab.display();
}

// A folded list of morphologies, in priority order. Languages that failed to load are
// listed after the good ones rather than dropped, so a broken pack is visible instead of
// silently absent.
function renderLanguages(containerEl, ctx) {
  const { tab, cls } = ctx;
  const s = settingsOf(ctx);
  const langs = tab.plugin.languages;
  const errors = tab.plugin.languageErrors || [];
  const enabledCount = langs.filter((l) => (s.enabledLanguages || []).includes(l.id)).length;
  const open = openLanguages.has(tab);

  const desc = t('set.languages.desc', { enabled: enabledCount, total: langs.length })
    + (errors.length ? t('set.languages.invalidSuffix', { n: errors.length }) : '') + '.';

  new Setting(containerEl)
    .setName(t('set.languages.name'))
    .setDesc(desc)
    .addExtraButton((b) => b.setIcon(open ? 'chevron-up' : 'chevron-down')
      .setTooltip(open ? t('set.languages.hide') : t('set.languages.show'))
      .onClick(() => {
        if (open) openLanguages.delete(tab); else openLanguages.add(tab);
        tab.display();
      }));

  if (!open) return;

  langs.forEach((lang, i) => {
    const row = new Setting(containerEl)
      .setName(lang.name)
      .setDesc(`id: ${lang.id}`)
      .addExtraButton((b) => b.setIcon('chevron-up').setTooltip(t('set.lang.higher')).setDisabled(i === 0)
        .onClick(async () => { tab.plugin.moveLanguage(lang.id, -1); await applyLanguageChange(ctx); }))
      .addExtraButton((b) => b.setIcon('chevron-down').setTooltip(t('set.lang.lower')).setDisabled(i === langs.length - 1)
        .onClick(async () => { tab.plugin.moveLanguage(lang.id, 1); await applyLanguageChange(ctx); }))
      .addToggle((c) => c.setValue((s.enabledLanguages || []).includes(lang.id)).onChange(async (v) => {
        const set = new Set(s.enabledLanguages || []);
        if (v) set.add(lang.id); else set.delete(lang.id);
        s.enabledLanguages = [...set];
        await applyLanguageChange(ctx);
      }));
    row.settingEl.addClass(`${cls}-lang-row`);
  });

  for (const bad of errors) {
    const row = new Setting(containerEl)
      .setName(bad.id)
      .setDesc(t('set.lang.invalid', { error: bad.error }))
      .addExtraButton((b) => b.setIcon('alert-triangle').setTooltip(t('set.lang.invalid', { error: bad.error })).setDisabled(true));
    row.nameEl.addClass(`${cls}-lang-error`);
    row.settingEl.addClass(`${cls}-lang-row`);
    row.settingEl.addClass('mod-warning');
  }
}

// None of these change the index, so all of them save without a rebuild — they only
// decide what gets drawn, and each nudges the surface it affects.
function renderHighlighting(containerEl, ctx) {
  const { tab } = ctx;
  const s = settingsOf(ctx);

  new Setting(containerEl).setName(t('set.heading.highlighting')).setHeading();

  new Setting(containerEl)
    .setName(t('set.highlightInReading.name'))
    .setDesc(t('set.highlightInReading.desc'))
    .addToggle((c) => c.setValue(s.highlightInReading).onChange(async (v) => { s.highlightInReading = v; await ctx.save(false); tab.plugin.rerenderViews(); }));

  new Setting(containerEl)
    .setName(t('set.editingHighlight.name'))
    .setDesc(t('set.editingHighlight.desc'))
    .addDropdown((d) => d
      .addOption('off', t('set.editingHighlight.off'))
      .addOption('live', t('set.editingHighlight.live'))
      .addOption('onSave', t('set.editingHighlight.onSave'))
      .setValue(s.editingHighlight)
      .onChange(async (v) => { s.editingHighlight = v; await ctx.save(false); tab.plugin.refreshEditors(); }));

  new Setting(containerEl)
    .setName(t('set.skipHeadings.name'))
    .setDesc(t('set.skipHeadings.desc'))
    .addToggle((c) => c.setValue(s.skipHeadings).onChange(async (v) => { s.skipHeadings = v; await ctx.save(false); tab.plugin.rerenderViews(); }));

  new Setting(containerEl)
    .setName(t('set.statusBar.name'))
    .setDesc(t('set.statusBar.desc'))
    .addToggle((c) => c.setValue(s.statusBar).onChange(async (v) => { s.statusBar = v; await ctx.save(false); tab.plugin.updateStatusBar(); }));

  new Setting(containerEl)
    .setName(t('set.statusBarIncludeLinks.name'))
    .setDesc(t('set.statusBarIncludeLinks.desc'))
    .addToggle((c) => c.setValue(s.statusBarIncludeLinks).onChange(async (v) => { s.statusBarIncludeLinks = v; await ctx.save(false); tab.plugin.updateStatusBar(); }));
}

function renderAutocomplete(containerEl, ctx) {
  const s = settingsOf(ctx);

  new Setting(containerEl).setName(t('set.heading.autocomplete')).setHeading();

  new Setting(containerEl)
    .setName(t('set.linkSuggest.name'))
    .setDesc(t('set.linkSuggest.desc'))
    .addToggle((c) => c.setValue(s.linkSuggest).onChange(async (v) => { s.linkSuggest = v; await ctx.save(false); }));

  positiveNumber(containerEl, ctx, 'suggestMinChars', false);

  new Setting(containerEl)
    .setName(t('set.suggestSkipAfter.name'))
    .setDesc(t('set.suggestSkipAfter.desc'))
    .addText((c) => c.setValue(s.suggestSkipAfter).onChange(async (v) => { s.suggestSkipAfter = v; await ctx.save(false); }));

  new Setting(containerEl)
    .setName(t('set.suggestPlainText.name'))
    .setDesc(t('set.suggestPlainText.desc'))
    .addToggle((c) => c.setValue(s.suggestPlainText).onChange(async (v) => { s.suggestPlainText = v; await ctx.save(false); }));
}

// Which context-menu entries this plugin contributes. The keys are the caller's, in the
// order they should read; every one names its locale strings after itself.
function renderMenuToggles(containerEl, ctx, keys) {
  const s = settingsOf(ctx);

  new Setting(containerEl).setName(t('set.heading.contextMenu')).setHeading();

  for (const key of keys) {
    new Setting(containerEl)
      .setName(t(`set.${key}.name`))
      .setDesc(t(`set.${key}.desc`))
      .addToggle((c) => c.setValue(s[key]).onChange(async (v) => { s[key] = v; await ctx.save(false); }));
  }
}

// Whole vault or a chosen set of folders. Scope never touches the index, so the caller's
// `saveScope` refreshes views without a rebuild; changing the mode redraws the tab
// because it decides whether the folder list below exists at all.
function renderScopeMode(containerEl, ctx, saveScope) {
  const s = settingsOf(ctx);

  new Setting(containerEl)
    .setName(t('set.scopeMode.name'))
    .setDesc(t('set.scopeMode.desc'))
    .addDropdown((d) => d
      .addOption('folders', t('set.scopeMode.folders'))
      .addOption('vault', t('set.scopeMode.vault'))
      .setValue(s.scopeMode)
      .onChange(async (v) => { s.scopeMode = v; await saveScope(); ctx.tab.display(); }));
}

// A path-set editor wired to one settings key. `labels` picks the string family —
// 'folderList' for scope, 'sourceList' for the sets an index is built from. Scope and source
// saves are neither of `ctx.save(true|false)`, so this one takes its own.
function renderPathList(containerEl, ctx, opts) {
  const s = settingsOf(ctx);
  const labels = opts.labels;
  renderFolderList(containerEl, {
    cls: ctx.cls,
    name: opts.name,
    desc: opts.desc,
    get: () => s[opts.key],
    set: async (v) => { s[opts.key] = v; await opts.save(); },
    normalize: opts.normalize,
    attachSuggest: opts.attachSuggest,
    placeholder: t(`set.${labels}.add`),
    removeLabel: t(`set.${labels}.remove`),
    addLabel: t(`set.${labels}.addAria`),
  });
}

// The module's whole surface. The plugin behind `tab` has to carry: settings, saveSettings,
// rebuildIndex, rerenderViews, refreshEditors, updateStatusBar, refreshActiveLanguages,
// moveLanguage, languages, languageErrors.
function createProseSettings(tab, opts) {
  const ctx = { tab, cls: opts.cls, save: opts.save };
  return {
    matchMode: (el) => renderMatchMode(el, ctx),
    languages: (el) => renderLanguages(el, ctx),
    matchLimits: (el) => renderMatchLimits(el, ctx),
    highlighting: (el) => renderHighlighting(el, ctx),
    autocomplete: (el) => renderAutocomplete(el, ctx),
    menuToggles: (el, keys) => renderMenuToggles(el, ctx, keys),
    scopeMode: (el, saveScope) => renderScopeMode(el, ctx, saveScope),
    pathList: (el, o) => renderPathList(el, ctx, o),
    positiveNumber: (el, key, rebuild) => positiveNumber(el, ctx, key, rebuild),
  };
}

module.exports = { createProseSettings };
