'use strict';

// A per-note scan cache for the usage reports the prose linkers build. Reading every
// in-scope note on each rescan is the cost; this reuses a note's result while its file mtime
// and the caller's signature both hold. The caller owns compute(file) and its return value.

function createUsageCache() {
  let store = new Map(); // path -> { mtime, signature, value }
  return {
    // Returns [{ file, value }] in input order; onFile(i, total) fires per file, hit or miss.
    // A file absent from a later run drops from the cache, so a shrinking scope can't leak.
    async run(files, signature, compute, onFile) {
      const next = new Map();
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (onFile) onFile(i, files.length);
        const mtime = (file && file.stat && file.stat.mtime) || 0;
        const prev = store.get(file.path);
        const value = prev && prev.signature === signature && prev.mtime === mtime
          ? prev.value
          : await compute(file);
        next.set(file.path, { mtime, signature, value });
        out.push({ file, value });
      }
      store = next;
      return out;
    },
    clear() { store = new Map(); },
  };
}

module.exports = { createUsageCache };
