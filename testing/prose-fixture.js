'use strict';

// A prose plugin just real enough to run a scan, for the tests of the shared prose matcher:
// one language claiming every word with exact keys, and an index built through formEntry,
// so a form is indexed exactly as a plugin's rebuild indexes it.

const { createMatcher } = require('../prose/matcher');

function fakeProsePlugin(forms, smartCase = false) {
  const plugin = Object.assign({}, createMatcher({
    idOf: (c) => c.id,
    selfIdOf: (c) => c.id,
    fieldsOf: (c) => ({ id: c.id }),
  }));
  plugin.settings = { smartCase, matchMode: 'exact', skipHeadings: false };
  plugin.activeLanguages = [{ match: () => true, keys: (w) => [w.toLowerCase()] }];
  plugin.keysCache = new Map();

  const byKey = new Map();
  for (const { id, text } of forms) {
    const entry = Object.assign({ id }, plugin.formEntry(text));
    for (const k of entry.words[0].keys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(entry);
    }
  }
  plugin.index = { byKey };
  return plugin;
}

// What a scan of `text` links, as the words the note shows.
const hitsIn = (plugin, text) => plugin.findMatches(text, null).map((m) => m.display);

module.exports = { fakeProsePlugin, hitsIn };
