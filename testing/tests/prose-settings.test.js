'use strict';

// What a control does after it is changed, not that it renders: a setting that changes what
// the index yields must rebuild it, one that only changes what is drawn must not.

const { describe, it, assert } = require('../harness');
const { installStubs, obsidianStub, RecordingSetting, elLike, elTree } = require('../stubs');

installStubs();

// Settings are looked up by their rendered name, so the keys go through the same
// translation the renderer used — the assertions pin the wiring, not the wording.
const { t } = require('../../i18n');

// Must be installed before the module under test destructures `Setting` from 'obsidian'.
obsidianStub.Setting = RecordingSetting;

const { createProseSettings } = require('../../prose/settings');


// A tab and plugin exposing only what the sections reach for, with every after-save hook
// counted so a test can tell a rebuild from a redraw.
function fakeTab(settings, extra) {
  const calls = { save: [], rerenderViews: 0, refreshEditors: 0, updateStatusBar: 0, rebuildIndex: 0, display: 0, saveSettings: 0, refreshActiveLanguages: 0, moved: [] };
  const plugin = Object.assign({
    settings,
    languages: [],
    languageErrors: [],
    saveSettings: async () => { calls.saveSettings++; },
    rebuildIndex: () => { calls.rebuildIndex++; },
    rerenderViews: () => { calls.rerenderViews++; },
    refreshEditors: () => { calls.refreshEditors++; },
    updateStatusBar: () => { calls.updateStatusBar++; },
    refreshActiveLanguages: () => { calls.refreshActiveLanguages++; },
    moveLanguage: (id, d) => { calls.moved.push([id, d]); },
  }, extra || {});
  const tab = { plugin, display: () => { calls.display++; } };
  const sections = createProseSettings(tab, { cls: 'prose', save: async (rebuild) => { calls.save.push(rebuild); } });
  return { tab, sections, calls };
}

// The exclusion list is raw DOM under a folded header, so a test opens it through the
// header's chevron and then reaches into the host for the boxes the widget drew. The last
// matching row wins: every redraw records a fresh header.
const listHeader = (name) => [...RecordingSetting.entries].reverse()
  .find((e) => e.name === name || e.name.startsWith(`${name} (`));
const openList = (name) => listHeader(name).controls[0].click();
const inputsIn = (host) => elTree(host).filter((e) => e.tag === 'input');
const settle = () => new Promise((r) => setTimeout(r, 0));

const addToList = async (host, value) => {
  const boxes = inputsIn(host);
  const add = boxes[boxes.length - 1];
  add.value = value;
  add.fire('keydown', { key: 'Enter', preventDefault: () => {} });
  await settle();
};

const baseSettings = () => ({
  matchMode: 'stemmer', minTermLength: 3, linkFirstOnly: false, excludeTerms: '',
  highlightInReading: true, editingHighlight: 'live', skipHeadings: false,
  statusBar: true, statusBarIncludeLinks: false,
  linkSuggest: true, suggestMinChars: 2, suggestSkipAfter: '',
  enabledLanguages: [], scopeMode: 'folders',
});

describe('prose settings sections', () => {
  it('rebuilds the index for the settings that change what matches', async () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections, calls } = fakeTab(s);
    sections.matchMode(elLike());

    await RecordingSetting.control(t('set.matchMode.name')).change('exact');
    assert.strictEqual(s.matchMode, 'exact');
    assert.deepStrictEqual(calls.save, [true]);

    await RecordingSetting.control(t('set.minTermLength.name')).change('5');
    assert.strictEqual(s.minTermLength, 5);
    assert.deepStrictEqual(calls.save, [true, true]);
  });

  it('leaves the index alone for the settings that only change what is drawn', async () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections, calls } = fakeTab(s);
    sections.matchLimits(elLike());

    await RecordingSetting.control(t('set.linkFirstOnly.name')).change(true);
    assert.strictEqual(s.linkFirstOnly, true);
    assert.deepStrictEqual(calls.save, [false]);

    // The exclusion list is the exception in this section: it changes what matches.
    const host = elLike();
    const s2 = baseSettings();
    const two = fakeTab(s2);
    two.sections.exclusionList(host, 'excludeTerms');
    openList(t('set.excludeTerms.name'));
    await addToList(host, 'foo');
    assert.strictEqual(s2.excludeTerms, 'foo');
    assert.deepStrictEqual(two.calls.save, [true]);
  });

  it('keeps the exclusion list folded until the reader opens it', () => {
    RecordingSetting.reset();
    const host = elLike();
    fakeTab(baseSettings()).sections.exclusionList(host, 'excludeTerms');
    assert.strictEqual(inputsIn(host).length, 0, 'drew the list before it was opened');

    openList(t('set.excludeTerms.name'));
    assert.strictEqual(inputsIn(host).length, 1, 'opening it should leave the add box');
  });

  it('writes an edited row back to the setting', async () => {
    RecordingSetting.reset();
    const host = elLike();
    const s = baseSettings();
    s.excludeTerms = 'lead\nspawn';
    const { calls } = fakeTab(s);
    fakeTab(s).sections.exclusionList(host, 'excludeTerms');
    openList(t('set.excludeTerms.name'));

    const [first] = inputsIn(host);
    first.value = 'leads';
    first.fire('change');
    await settle();
    assert.strictEqual(s.excludeTerms, 'leads\nspawn');
    assert.ok(listHeader(t('set.excludeTerms.name')).name.endsWith('(2)'), 'the header should count the rows');
    assert.strictEqual(calls.rebuildIndex, 0, 'the tab\'s own save hook does the rebuilding');
  });

  it('turns the rows into a scroller once the list is long', () => {
    RecordingSetting.reset();
    const host = elLike();
    const s = baseSettings();
    s.excludeTerms = Array.from({ length: 11 }, (_, i) => `word${i}`).join('\n');
    fakeTab(s).sections.exclusionList(host, 'excludeTerms');
    openList(t('set.excludeTerms.name'));

    assert.ok(elTree(host).some((e) => /-list-scroll\b/.test(e.cls)), 'eleven rows should scroll, not grow');
  });

  it('floors the number boxes at 1 rather than storing 0 or NaN', async () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections } = fakeTab(s);
    sections.matchMode(elLike());
    const box = RecordingSetting.control(t('set.minTermLength.name'));

    await box.change('0');
    assert.strictEqual(s.minTermLength, 1);
    await box.change('-4');
    assert.strictEqual(s.minTermLength, 1);
    await box.change('');
    assert.strictEqual(s.minTermLength, 1);
    await box.change('abc');
    assert.strictEqual(s.minTermLength, 1);
  });

  it('nudges the surface each highlighting setting actually affects', async () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections, calls } = fakeTab(s);
    sections.highlighting(elLike());

    await RecordingSetting.control(t('set.editingHighlight.name')).change('off');
    assert.strictEqual(calls.refreshEditors, 1, 'the editor extension has to be told');
    assert.strictEqual(calls.rerenderViews, 0);

    await RecordingSetting.control(t('set.highlightInReading.name')).change(false);
    assert.strictEqual(calls.rerenderViews, 1, 'reading views redraw');
    assert.strictEqual(calls.refreshEditors, 1);

    await RecordingSetting.control(t('set.statusBar.name')).change(false);
    assert.strictEqual(calls.updateStatusBar, 1);

    // None of them touch the index.
    assert.deepStrictEqual(calls.save, [false, false, false]);
  });

  it('renders the menu toggles the caller asked for, in that order', async () => {
    RecordingSetting.reset();
    const s = Object.assign(baseSettings(), { menuOpen: true, menuUnlink: false, menuExclude: true });
    const { sections, calls } = fakeTab(s);
    sections.menuToggles(elLike(), ['menuOpen', 'menuUnlink', 'menuExclude']);

    assert.deepStrictEqual(RecordingSetting.names(), [
      t('set.heading.contextMenu'),
      t('set.menuOpen.name'), t('set.menuUnlink.name'), t('set.menuExclude.name'),
    ]);
    // Each toggle shows its own key's value, not a neighbour's.
    assert.strictEqual(RecordingSetting.control(t('set.menuOpen.name')).value, true);
    assert.strictEqual(RecordingSetting.control(t('set.menuUnlink.name')).value, false);

    await RecordingSetting.control(t('set.menuUnlink.name')).change(true);
    assert.strictEqual(s.menuUnlink, true);
    assert.strictEqual(s.menuOpen, true, 'writes its own key');
    assert.deepStrictEqual(calls.save, [false]);
  });

  it('keeps the language list folded until asked, then rebuilds on every change', async () => {
    RecordingSetting.reset();
    const s = Object.assign(baseSettings(), { enabledLanguages: ['ru'] });
    const langs = [{ id: 'ru', name: 'Russian' }, { id: 'en', name: 'English' }];
    const { tab, sections, calls } = fakeTab(s, { languages: langs, languageErrors: [{ id: 'bad', error: 'boom' }] });

    sections.languages(elLike());
    assert.deepStrictEqual(RecordingSetting.names(), [t('set.languages.name')], 'folded by default');

    RecordingSetting.control(t('set.languages.name'), 'button').click();
    RecordingSetting.reset();
    sections.languages(elLike());
    assert.deepStrictEqual(RecordingSetting.names(), [t('set.languages.name'), 'Russian', 'English', 'bad'],
      'a language that failed to load stays visible instead of vanishing');

    // Toggling one re-reads every stem, so the index goes and the tab redraws. Counted as a
    // rise, since opening the list already redrew once.
    const redrawsBefore = calls.display;
    await RecordingSetting.control('English', 'toggle').change(true);
    assert.deepStrictEqual(s.enabledLanguages, ['ru', 'en']);
    assert.strictEqual(calls.rebuildIndex, 1);
    assert.strictEqual(calls.refreshActiveLanguages, 1);
    assert.strictEqual(calls.display, redrawsBefore + 1);
  });

  it('scopes its class names to the caller prefix', () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections } = fakeTab(s, { languages: [{ id: 'ru', name: 'Russian' }] });
    sections.languages(elLike());
    RecordingSetting.control(t('set.languages.name'), 'button').click();
    RecordingSetting.reset();
    sections.languages(elLike());

    const row = RecordingSetting.entries.find((e) => e.name === 'Russian');
    assert.ok(row.classes.includes('prose-lang-row'), `expected the caller prefix, got ${row.classes}`);
  });

  it('redraws the tab when the scope mode changes, since it decides what renders below', async () => {
    RecordingSetting.reset();
    const s = baseSettings();
    const { sections, calls } = fakeTab(s);
    let scopeSaves = 0;
    sections.scopeMode(elLike(), async () => { scopeSaves++; });

    await RecordingSetting.control(t('set.scopeMode.name')).change('vault');
    assert.strictEqual(s.scopeMode, 'vault');
    assert.strictEqual(scopeSaves, 1, 'scope uses the caller save, not the rebuilding one');
    assert.deepStrictEqual(calls.save, [], 'scope never rebuilds the index');
    assert.strictEqual(calls.display, 1);
  });
});
