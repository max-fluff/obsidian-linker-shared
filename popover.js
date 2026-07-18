'use strict';

// The shell of a hover popover: when it appears, when it goes away, and where it sits.
//
// Obsidian's own HoverPopover hides as soon as the pointer leaves the link, so you cannot
// scroll or select inside it. Every linker that needs a preview you can actually reach into
// ended up writing the same shell — the show delay, the grace period so a diagonal mouse
// path doesn't kill it, the measure-off-screen-then-flip-at-the-edge placement, and the
// token that stops a slow async render from revealing itself after you have moved on.
//
// Only the contents differ: a code snippet, a rendered PDF page, or a list of the terms a
// word could mean. So the shell lives here and the contents are a callback.
//
//   const pop = new Popover({ cls: 'code-linker-hover' });
//   pop.schedule('some-key', x, y, async (el, ctx) => { … return false to abort … });
//
// `build` receives the emptied element and a context with isCurrent(), which it should check
// after every await — anything newer invalidates it. Returning false aborts the show;
// returning a function runs it after the element is revealed but before it is measured,
// which is where a scroll-into-view belongs.

const SHOW_DELAY = 200;
const HIDE_GRACE = 250;
const EDGE_PAD = 12;

class Popover {
  // `cls` is the plugin's own class on the root element; `hiddenCls` defaults to `${cls}`
  // with a -hidden suffix on the plugin's prefix, but both can be passed explicitly.
  constructor(opts) {
    this.cls = opts.cls;
    this.hiddenCls = opts.hiddenCls;
    this.showDelay = opts.showDelay == null ? SHOW_DELAY : opts.showDelay;
    this.hideGrace = opts.hideGrace == null ? HIDE_GRACE : opts.hideGrace;
    this.onHide = opts.onHide || null;
    this.onDestroy = opts.onDestroy || null;
    // Asked just before hiding: return true and the popover stays up and asks again later.
    // The duplicate list needs it because the preview a row opens is a separate element in
    // the body, so walking from the row into that preview counts as leaving us.
    this.keepAlive = opts.keepAlive || null;

    this.el = null;
    this.timer = null;
    this.hideTimer = null;
    this.key = '';        // what is currently shown
    this.pendingKey = ''; // what is scheduled next
    this.token = 0;       // guards against a stale async render revealing itself
  }

  ensureEl() {
    if (!this.el) {
      this.el = document.body.createDiv({ cls: `${this.cls} ${this.hiddenCls}` });
      // Moving onto the popover must keep it alive — that is the whole point of having our
      // own rather than Obsidian's.
      this.el.addEventListener('mouseenter', () => this.cancelHide());
      this.el.addEventListener('mouseleave', () => this.leave());
    }
    return this.el;
  }

  isVisible() { return !!this.el && !this.el.classList.contains(this.hiddenCls); }
  contains(node) { return !!this.el && !!node && this.el.contains(node); }
  cancelHide() { clearTimeout(this.hideTimer); this.hideTimer = null; }

  // Ask for `key` to be shown after the delay. Re-asking for what is already up, or already
  // on its way, changes nothing — otherwise every mouse move would restart the timer.
  schedule(key, x, y, build) {
    this.cancelHide();
    if (key === this.key && this.isVisible()) return;
    if (key === this.pendingKey) return;
    this.pendingKey = key;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.pendingKey = ''; this.show(key, x, y, build); }, this.showDelay);
  }

  leave() {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.keepAlive && this.keepAlive()) { this.leave(); return; }
      this.hide();
    }, this.hideGrace);
  }

  async show(key, x, y, build) {
    const token = ++this.token;
    const ctx = { isCurrent: () => token === this.token };
    const el = this.ensureEl();
    el.empty();

    const after = await build(el, ctx);
    if (after === false || !ctx.isCurrent()) return;

    this.key = key;
    // Revealed off-screen so it can be measured, then placed by the cursor, flipping to the
    // other side when it would run past the edge of the window.
    el.style.visibility = 'hidden';
    el.style.left = '-9999px';
    el.style.top = '0px';
    el.removeClass(this.hiddenCls);
    if (typeof after === 'function') after();

    const r = el.getBoundingClientRect();
    let left = x + EDGE_PAD;
    let top = y + EDGE_PAD;
    if (left + r.width > window.innerWidth - EDGE_PAD) left = Math.max(EDGE_PAD, x - EDGE_PAD - r.width);
    if (top + r.height > window.innerHeight - EDGE_PAD) top = Math.max(EDGE_PAD, y - EDGE_PAD - r.height);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = 'visible';
  }

  hide() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.pendingKey = '';
    this.key = '';
    this.token++;
    if (this.onHide) this.onHide();
    if (this.el) { this.el.addClass(this.hiddenCls); this.el.empty(); }
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.hideTimer);
    this.token++;
    if (this.onDestroy) this.onDestroy();
    if (this.el) { this.el.remove(); this.el = null; }
  }
}

module.exports = { Popover, SHOW_DELAY, HIDE_GRACE };
