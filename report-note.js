'use strict';

// A report written into the vault as a note. A report is a snapshot — an earlier one may still
// be open — so an existing note is never overwritten; the next free name is taken instead.

const { normalizePath } = require('obsidian');

const MAX_TRIES = 50;

// Returns the created file, or null when 50 names in a row were taken or the vault refused
// every one of them. The caller says so; there is nothing useful to throw here.
async function writeReportNote(app, base, body) {
  for (let n = 0; n < MAX_TRIES; n++) {
    const name = n ? `${base} ${n + 1}.md` : `${base}.md`;
    try {
      return await app.vault.create(normalizePath(name), body);
    } catch { /* taken, or unwritable — try the next name */ }
  }
  return null;
}

module.exports = { writeReportNote };
