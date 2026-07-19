'use strict';

// What a push has to pass: only what is frozen. A push should be blocked by a promise broken,
// not by logic changed. Matched on basename, so a plugin's file and a shared one both count.

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
