'use strict';

// The `api.linker` contract as the two prose linkers implement it. This is the surface
// siblings read, so drift between the two is the expensive kind: a member added to one and
// forgotten in the other fails silently, in a vault neither author runs.
//
// createProseProvider(plugin, config):
//   id, displayName  as published to siblings
//   spanOf(match)    one of our matches as {start, end, label, target}
//   suggestionsFor   (plugin, query, sourcePath) -> autocomplete rows
//   excludes(text)   whether this text sits on one of our exclusion lists
//   describe(target, display) how one of our targets reads in a list: {title, note}

const { LINKER_API } = require('../discover');
const { t } = require('../i18n');

// Compared through the matcher's keys, not string equality: the word in the note is usually
// an inflection of the alias, which is the case the caption exists for.
function aliasHit(plugin, term, mainForm, display) {
  const aliases = (term && term.aliases) || [];
  if (!display || !aliases.length) return null;

  const sameForm = (a, b) => {
    const wa = plugin.tokenizeForm(String(a));
    const wb = plugin.tokenizeForm(String(b));
    if (!wa.length || wa.length !== wb.length) return String(a).toLowerCase() === String(b).toLowerCase();
    return wa.every((w, i) => w.keys.some((k) => wb[i].keys.includes(k)));
  };

  if (sameForm(mainForm, display)) return null;
  const hit = aliases.find((a) => sameForm(a, display));
  return hit ? t('kind.viaAlias', { form: hit }) : null;
}

// Whether we would put anything on `surface` of `sourcePath`. Out of scope we draw nothing
// anywhere; otherwise the switch belonging to that surface decides. 'menu' is not drawing —
// acting on a word does not require its highlight to be visible.
function drawsIn(plugin, sourcePath, surface) {
  if (sourcePath && !plugin.inScope(sourcePath)) return false;
  if (surface === 'reading') return !!plugin.settings.highlightInReading;
  if (surface === 'editing') return plugin.settings.editingHighlight !== 'off';
  return true;
}

function createProseProvider(plugin, config) {
  const { id, displayName, spanOf, suggestionsFor, excludes, describe } = config;
  const str = (v) => String(v || '');

  return {
    apiVersion: LINKER_API,
    id,
    displayName,
    kind: 'prose',
    // A getter, so a settings change is seen without rebuilding the api object.
    get precedence() { return plugin.settings.linkPrecedence; },
    // Protected ranges are skipped, so the answer matches what we would decorate. Whether we
    // are switched on anywhere is `drawsIn`'s question, not this one's.
    matches: (text) => plugin.findMatches(str(text), null, { protect: true }).map(spanOf),
    // Asked by a sibling before it yields us a span: claiming a word we will not draw would
    // leave it shown by nobody.
    drawsIn: (sourcePath, surface) => drawsIn(plugin, sourcePath, surface),
    // How one of our targets reads when a sibling lists it beside its own: several notes can
    // claim one word, and without this every row renders as the same string.
    describe: (target, display) => describe(target, display),
    open: (target, sourcePath, newTab) => plugin.openTerm(target, sourcePath, newTab),
    // Our own preview of one of our targets, anchored to someone else's element.
    hover: (target, event, targetEl, sourcePath, hoverParent) =>
      plugin.hoverTerm(event, targetEl, target, sourcePath, hoverParent),
    suggest: (query, sourcePath) => suggestionsFor(plugin, str(query), sourcePath),
    // What choosing our row writes — ours to decide, not the popup owner's.
    insertFor: (target, display, inTable) =>
      (plugin.settings.suggestPlainText ? display : plugin.wikiLink(target, display, inTable)),
    // Superseded by insertFor; kept for peers that predate it.
    linkFor: (target, display, inTable) => plugin.wikiLink(target, display, inTable),
    // Whether we would add a menu item of this verb for this text — asked before either
    // plugin writes one, since the grouping has to be settled first.
    offers: (kind, text) => kind === 'exclude' && !!plugin.settings.menuExclude
      && (plugin.findMatches(str(text), null).length > 0 || excludes(str(text))),
    refresh: () => plugin.rerenderViews(),
  };
}

module.exports = { createProseProvider, drawsIn, aliasHit };
