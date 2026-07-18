'use strict';

// Infrastructure for keeping stored links current: the Live Preview underline for links
// that have drifted, the refresh signal that re-scans it, and the two ways a note gets
// rewritten. What a link is pinned to, and what "drifted" means for it, stays with the
// plugin — code links hold a line, document links hold a page — so everything here works
// through the plugin's own linkState() and takes its transforms as arguments.
//
// Each plugin bundles its own copy of this module, so the refresh effect below is per
// plugin. That is what we want: a plugin refreshing its marks must not disturb a sibling's.

const { Notice, MarkdownView } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder, StateEffect } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
const { linkRegex } = require('./markdown');
const { t } = require('./i18n');

// CM6 syntax-node names for contexts where a link is example text, not a live link.
const SKIP_NODE = /code|comment|frontmatter/i;

// Dispatched when the index changes so Live Preview re-scans its marks without waiting for
// the next edit or scroll.
const refreshEffect = StateEffect.define();

function refreshStaleLinks(app) {
  app.workspace.iterateAllLeaves((leaf) => {
    const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
    if (cm) cm.dispatch({ effects: refreshEffect.of(null) });
  });
}

// Live Preview underline for drifted links, styled by the caller's own classes. Links
// inside code are skipped via the syntax tree — there they're example text, so the commands
// won't touch them and marking them would only mislead.
function staleLinksExtension(plugin, classes) {
  const marks = {
    stale: Decoration.mark({ class: classes.stale }),
    broken: Decoration.mark({ class: classes.broken }),
  };
  const build = (view) => {
    const builder = new RangeSetBuilder();
    if (plugin.settings.markStaleLinks) {
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        const re = linkRegex();
        let m;
        while ((m = re.exec(text))) {
          const start = from + m.index;
          const end = start + m[0].length;
          let inCodeNode = false;
          tree.iterate({ from: start, to: end, enter: (n) => { if (SKIP_NODE.test(n.type.name)) inCodeNode = true; } });
          const state = inCodeNode ? null : plugin.linkState(m[2]);
          if (state) builder.add(start, end, marks[state]);
        }
      }
    }
    return builder.finish();
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = build(view); }
      update(u) {
        const refresh = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)));
        if (u.docChanged || u.viewportChanged || refresh) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// An open editor keeps cursor and undo; reading view has none, so the file is rewritten
// through the vault. `transform(plugin, text)` returns { text, count }.
async function rewriteActiveNote(plugin, transform, noticeKey) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view && view.editor;
  if (editor) {
    const { text, count } = transform(plugin, editor.getValue());
    if (count) { const cur = editor.getCursor(); editor.setValue(text); editor.setCursor(cur); }
    new Notice(t(noticeKey, { n: count }));
    return;
  }
  const file = plugin.app.workspace.getActiveFile();
  if (!file) { new Notice(t(noticeKey, { n: 0 })); return; }
  const { text, count } = transform(plugin, await plugin.app.vault.read(file));
  if (count) await plugin.app.vault.modify(file, text);
  new Notice(t(noticeKey, { n: count }));
}

async function rewriteVault(plugin, transform, noticeKey) {
  let files = 0, total = 0;
  for (const f of plugin.app.vault.getMarkdownFiles()) {
    const { text, count } = transform(plugin, await plugin.app.vault.read(f));
    if (count) { await plugin.app.vault.modify(f, text); files++; total += count; }
  }
  new Notice(t(noticeKey, { n: total, files }));
}

module.exports = { SKIP_NODE, refreshEffect, refreshStaleLinks, staleLinksExtension, rewriteActiveNote, rewriteVault };
