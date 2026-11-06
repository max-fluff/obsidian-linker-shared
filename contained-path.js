'use strict';

// Where a note is allowed to make a sigil plugin read from disk. An embed's path comes from
// note text, and notes travel — a shared vault, a page pasted from the web — so the text must
// not choose what gets read: "../../.ssh/id_rsa:1-40" in a code-link block would otherwise
// render the key in the note, and a reference embed would do the same for any document.
//
// Desktop only: requires Node's fs. The prose pair never loads it.

const fs = require('fs');
const nodePath = require('path');

// The absolute path for `rel` under `root`, or null when the note is reaching outside it.
//
// - An indexed file passes as is: the scan folders are the user's choice and may sit beside
//   the root ("../lib"), and the index only ever holds what the user asked to scan.
// - Anything else must really be under the root with symlinks resolved, or a vault shipping
//   a link to ~/.ssh would walk straight out through it. The indexer never follows a link,
//   so nothing the index can find is lost to this.
// - A file that isn't there is judged by its spelling: there is nothing behind it to leak,
//   and the read that follows reports it missing the way it always has.
// - The root itself is refused: it is a folder, never a file to show.
function containedPath(root, rel, indexed) {
  if (!root || typeof rel !== 'string' || !rel) return null;
  const abs = nodePath.resolve(root, rel);
  if (indexed) return abs;
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { return null; }
  let real;
  try { real = fs.realpathSync(abs); } catch { real = nodePath.resolve(realRoot, rel); }
  return isInside(realRoot, real) ? abs : null;
}

// Whether `abs` lies strictly below `base`. path.relative is case-insensitive on Windows and
// answers with an absolute path across drives, so both are caught without string games.
function isInside(base, abs) {
  const back = nodePath.relative(base, abs);
  if (back === '' || nodePath.isAbsolute(back)) return false;
  return back !== '..' && !back.startsWith('..' + nodePath.sep);
}

module.exports = { containedPath, isInside };
