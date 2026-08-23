'use strict';

// The plugins ship a Style Settings block in styles.css but never appeared in its UI: the
// block was fine, nobody told Style Settings the sheet had arrived. Both halves are checked
// here, because either one alone leaves the panel empty.

const fs = require('fs');
const path = require('path');
const { describe, it, assert } = require('../harness');
const { announceStyleSettings } = require('../../style-settings');

// Style Settings' own patterns, copied from its parseCSSStyleSheet.
const BLOCK = /\/\*!?\s*@settings[\r\n]+?([\s\S]+?)\*\//g;
const NAME = /^name:\s*(.+)$/m;

const ROOT = path.join(__dirname, '..', '..', '..', '..');

describe('style settings', () => {
  it('tells Style Settings to re-read the sheet once the layout is up', () => {
    const triggered = [];
    const plugin = {
      app: { workspace: { onLayoutReady: (fn) => fn(), trigger: (name) => triggered.push(name) } },
    };
    announceStyleSettings(plugin);
    assert.deepStrictEqual(triggered, ['parse-style-settings']);
  });

  it('ships a block Style Settings can find in the built styles.css', () => {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    BLOCK.lastIndex = 0;
    const block = BLOCK.exec(css);
    assert.ok(block, 'no @settings block in styles.css');
    const body = block[1];
    assert.ok(NAME.test(body), 'the block has no name: line, so Style Settings drops it');
    assert.ok(/^id:\s*\S+/m.test(body), 'the block has no id: line, so Style Settings drops it');
    assert.ok(/^settings:/m.test(body), 'the block declares no settings');
    assert.ok(!body.includes('%p%'), 'the build left the class-prefix token unsubstituted');
  });
});
