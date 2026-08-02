'use strict';

// Obsidian scrolls the very element a settings tab empties to redraw itself, and a redraw is
// what every fold, toggle and list edit triggers. Without this the pane jumps to the top the
// moment you open a section halfway down it.

const { describe, it, assert } = require('../harness');
const { redraw } = require('../../settings-redraw');

const tabAt = (top) => ({ containerEl: { scrollTop: top } });

describe('redraw', () => {
  it('puts the reader back where they were', () => {
    const tab = tabAt(420);
    redraw(tab, () => { tab.containerEl.scrollTop = 0; });
    assert.strictEqual(tab.containerEl.scrollTop, 420);
  });

  it('draws before restoring, so the offset applies to the new content', () => {
    const tab = tabAt(120);
    const order = [];
    redraw(tab, () => { order.push('draw'); tab.containerEl.scrollTop = 0; });
    order.push('after');
    assert.deepStrictEqual(order, ['draw', 'after']);
    assert.strictEqual(tab.containerEl.scrollTop, 120);
  });

  it('leaves a pane already at the top alone', () => {
    const tab = tabAt(0);
    let drawn = 0;
    redraw(tab, () => { drawn++; });
    assert.strictEqual(drawn, 1);
    assert.strictEqual(tab.containerEl.scrollTop, 0);
  });

  // The tab is constructed before Obsidian gives it a container, and the first display() runs
  // through the same path as every later redraw.
  it('draws anyway when there is no container yet', () => {
    let drawn = 0;
    redraw({}, () => { drawn++; });
    redraw(null, () => { drawn++; });
    assert.strictEqual(drawn, 2);
  });
});
