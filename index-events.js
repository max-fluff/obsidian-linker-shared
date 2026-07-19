'use strict';

// Index-rebuild subscriptions, mixed into the plugin prototype. Published through
// `api.onChange` and used internally by anything that has to redraw when the index moves.

module.exports = {
  // Returns an unsubscribe function.
  onIndexChange(cb) {
    if (typeof cb !== 'function') return () => {};
    if (!this._indexListeners) this._indexListeners = new Set();
    this._indexListeners.add(cb);
    return () => this._indexListeners.delete(cb);
  },

  notifyIndexChange() {
    for (const cb of this._indexListeners || []) {
      // A subscriber throwing must not stop the rest from hearing about the rebuild.
      try { cb(); } catch (e) { console.error(`${this.manifest.id}: index listener failed`, e); }
    }
  },
};
