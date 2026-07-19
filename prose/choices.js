'use strict';

// The candidate list for an ambiguous span. Hovering a row asks Obsidian's own Page Preview
// for that one target — we never render a preview ourselves. Obsidian ties a hover popover's
// lifetime to the component that asked for it, so passing the list as `hoverParent` keeps the
// preview alive while the pointer travels from the row into it.

const { Popover } = require('../popover');
const { Component } = require('obsidian');

// A candidate is one of our own targets (a plain string, acted on through the constructor
// callbacks) or a peer's `{ label, describe(), open(), hover(...) }`, already bound by the
// caller. The reader is picking a meaning, not a plugin, so both kinds draw identically.
const labelOf = (c) => (typeof c === 'object' && c ? c.label : c);

// Captioned by whoever owns the row; `display` is the word the reader touched, which is how
// an owner can say "you clicked A, this is B under its alias A". Takes the plugin rather than
// a callback: wiring this per surface is how the hover list and the picker once disagreed.
function captionFor(plugin, c, display) {
  const provider = plugin && plugin.api && plugin.api.linker;
  let own = null;
  if (typeof c === 'object' && c !== null) {
    own = typeof c.describe === 'function' ? c.describe(display) : null;
  } else if (provider && typeof provider.describe === 'function') {
    own = provider.describe(c, display);
  }
  if (own && own.title) return { title: own.title, note: own.note || '' };
  // Never the plugin's name: the reader is choosing between meanings, not between plugins,
  // and which one answers is machinery they are not picking from.
  return { title: labelOf(c), note: '' };
}

class ChoicePopover {
  // `hover(target, event, el, hoverParent)` previews one of our own targets; `open(target)`
  // follows it.
  constructor(opts) {
    this.opts = opts;
    this.component = null;
    this.pop = new Popover({
      cls: `${opts.cls}-choices`,
      hiddenCls: `${opts.cls}-hidden`,
      onHide: () => this.unloadComponent(),
      onDestroy: () => this.unloadComponent(),
      // The preview a row opens is Obsidian's own element in the body, not a child of ours,
      // so moving the pointer into it reads as leaving the list.
      keepAlive: () => !!document.querySelector('.hover-popover:hover'),
    });
  }

  isVisible() { return this.pop.isVisible(); }
  contains(node) { return this.pop.contains(node); }
  cancelHide() { this.pop.cancelHide(); }
  leave() { this.pop.leave(); }
  hide() { this.pop.hide(); }
  destroy() { this.pop.destroy(); }

  // Unloading the component closes any preview still hanging off it.
  unloadComponent() {
    if (this.component) { this.component.unload(); this.component = null; }
  }

  schedule(candidates, x, y, display) {
    if (!candidates || candidates.length < 2) return;
    // NUL as the separator: labels can contain spaces, and two different candidate lists
    // must never collapse onto one key.
    const key = candidates.map(labelOf).join('\0');
    this.pop.schedule(key, x, y, (el) => this.build(candidates, el, display));
  }

  // A fresh component per preview, so opening one closes the last instead of stacking one
  // preview per row the pointer crossed.
  newComponent() {
    this.unloadComponent();
    this.component = new Component();
    this.component.load();
    return this.component;
  }

  build(candidates, el, display) {
    this.unloadComponent();

    const cls = this.opts.cls;
    el.createDiv({ cls: `${cls}-choices-title`, text: this.opts.title });
    const list = el.createDiv({ cls: `${cls}-choices-list` });

    for (const c of candidates) {
      const foreign = typeof c === 'object' && c !== null;
      const { title, note } = captionFor(this.opts.plugin, c, display);
      const row = list.createDiv({ cls: `${cls}-choices-item` });
      row.createDiv({ cls: `${cls}-choices-item-title`, text: title });
      if (note) row.createDiv({ cls: `${cls}-choices-item-note`, text: note });
      row.addEventListener('mouseenter', (event) => {
        const parent = this.newComponent();
        if (foreign) {
          if (typeof c.hover === 'function') c.hover(event, row, parent);
        } else {
          this.opts.hover(c, event, row, parent);
        }
      });
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        if (foreign) c.open();
        else this.opts.open(c);
      });
    }
  }
}

module.exports = { ChoicePopover, captionFor };
