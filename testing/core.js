'use strict';

// Which tests a push has to pass.
//
// Deliberately almost nothing: only what is frozen. A push should be blocked by a promise
// broken, not by logic changed — changing logic is what most commits are for, and a test that
// argues with a deliberate change is friction, not safety.
//
// Two things qualify. One, the plugin loads at all: esbuild bundles a call to a deleted
// helper without complaint, and the result fails in Obsidian rather than in Node. Two, the
// cross-version promise: every plugin carries its own copy of this submodule, so the sibling
// in the reader's vault was built from another commit, and neither side can see that pairing
// while they work.
//
// Everything else — matching, menus, dialogs, settings, precedence arithmetic — runs on
// `npm test` and is the developer's own net.
//
// Names are matched against the file's basename, so a plugin's own file and a shared one of
// the same name are both covered.

const CORE = [
  // The promise that survives every release: a sibling built from another commit degrades
  // instead of crashing, and the grades it was built against keep their meaning.
  'contract-drift.test.js',

  // esbuild will happily bundle a call to something that isn't there, and a computed require
  // it cannot resolve. Both load fine in Node and fail in the app.
  'bundle.test.js',
  'onload.test.js',
];

const isCore = (file) => CORE.includes(file);

module.exports = { CORE, isCore };
