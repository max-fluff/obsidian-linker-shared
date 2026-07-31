'use strict';

// Recursive folder watching for the desktop index scanners, with a Linux fallback. Node's
// fs.watch({recursive:true}) throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM on Linux; there we
// watch every directory in the tree non-recursively and add a watcher whenever a new
// subdirectory appears. Events arrive as (rel, filename): rel is the changed path relative
// to the scan root, the shape both plugins already filter on. `fsImpl` is injectable so the
// fallback can be tested without real filesystem events.

const nodeFs = require('fs');
const nodePath = require('path');

const toPosix = (s) => String(s || '').split('\\').join('/');
const joinRel = (rel, name) => (name ? (rel ? rel + '/' + toPosix(name) : toPosix(name)) : rel);

// roots: [{ dir, rel }] — an absolute directory and its scan-root-relative prefix ('' for a
// root itself). opts: onEvent(rel, filename); onUnsupported() fired once when the platform
// forces the fallback or watches run out; shouldDescend(rel) keeps the fallback out of
// skipped folders (node_modules); fsImpl for tests. Returns a handle with close().
function watchTree(roots, opts = {}) {
  const { onEvent = () => {}, onUnsupported, shouldDescend = () => true, fsImpl = nodeFs } = opts;
  const watchers = [];
  const watched = new Set(); // abs dirs already watched in the fallback, so we add each once
  let noted = false;

  const noteDegraded = () => { if (!noted) { noted = true; if (onUnsupported) onUnsupported(); } };

  const arm = (dir, cb) => {
    try { watchers.push(fsImpl.watch(dir, cb)); return true; }
    catch (e) {
      // Out of inotify watches, or a transient error: degrade rather than throw.
      if (e && (e.code === 'ENOSPC' || e.code === 'EMFILE')) noteDegraded();
      return false;
    }
  };

  // Non-recursive fallback: a change in `dir`. Report it, and if it created a new
  // subdirectory start watching that too, so deeper changes are still seen.
  const onDirEvent = (dir, rel, _evt, filename) => {
    const childRel = joinRel(rel, filename);
    onEvent(childRel, filename ? toPosix(filename) : '');
    if (filename) {
      const abs = nodePath.join(dir, String(filename));
      let st; try { st = fsImpl.statSync(abs); } catch { st = null; }
      if (st && st.isDirectory()) watchSubtree(abs, childRel);
    }
  };

  const watchSubtree = (dir, rel) => {
    if (watched.has(dir) || !shouldDescend(rel)) return;
    watched.add(dir);
    arm(dir, (evt, filename) => onDirEvent(dir, rel, evt, filename));
    let entries;
    try { entries = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory()) watchSubtree(nodePath.join(dir, e.name), joinRel(rel, e.name));
  };

  for (const { dir, rel } of roots) {
    if (!fsImpl.existsSync(dir)) continue;
    try {
      watchers.push(fsImpl.watch(dir, { recursive: true }, (_evt, filename) => onEvent(joinRel(rel, filename), filename ? toPosix(filename) : '')));
    } catch (e) {
      if (e && e.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') { noteDegraded(); watchSubtree(dir, rel); }
      /* else transient FS issue; a manual rebuild re-arms the watchers */
    }
  }

  return {
    close() { for (const w of watchers) { try { w.close(); } catch { /* already closed */ } } watchers.length = 0; watched.clear(); },
  };
}

module.exports = { watchTree, joinRel };
