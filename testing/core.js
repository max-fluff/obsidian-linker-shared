'use strict';

// Which tests a push has to pass.
//
// The criterion is not importance but visibility: a failure here is one the author of the
// change cannot see for themselves. The cross-plugin contract breaks in someone else's vault,
// with the other plugin installed and possibly built from a different commit; a bundle that
// will not load fails in Obsidian rather than in Node. Neither shows up while you work.
//
// Everything else pins behaviour, and behaviour is meant to change between pushes — the whole
// point of most commits. Those tests are the developer's own net, run by `npm test`, and a
// deliberate change to matching or to a dialog should not have to argue with CI.
//
// Names are matched against the file's basename, so a plugin's own file and a shared one of
// the same name are both covered.

const CORE = [
  // The provider contract and how it degrades across versions — the whole reason two of
  // these plugins can be installed together and built from different commits.
  'discover.test.js',
  'link-owner.test.js',
  'scope-deferral.test.js',
  'provider-scope.test.js',
  'broker.test.js',

  // The priority order. Its arithmetic is easy to get subtly wrong and the symptom is a
  // control that silently does nothing.
  'precedence-order.test.js',

  // esbuild will happily bundle a call to something that isn't there, and a computed require
  // it cannot resolve. Both load fine in Node and fail in the app.
  'bundle.test.js',
  'onload.test.js',

  // A missing locale key renders as the key itself in the reader's language.
  'i18n.test.js',
];

const isCore = (file) => CORE.includes(file);

module.exports = { CORE, isCore };
