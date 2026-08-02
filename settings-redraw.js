'use strict';

// A settings tab redraws by emptying its container and filling it again, which is also what
// every fold, toggle and list edit triggers. Obsidian scrolls that same container, so a redraw
// sends the reader back to the top of the pane — halfway down a long tab, opening one fold
// makes the whole page jump.

// Redraw `tab` without losing the reader's place. The height may well change (a fold that just
// closed is shorter), and the browser clamps the offset to the new height on its own.
function redraw(tab, draw) {
  const el = tab && tab.containerEl;
  const top = el ? el.scrollTop || 0 : 0;
  draw();
  if (el && top) el.scrollTop = top;
}

module.exports = { redraw };
