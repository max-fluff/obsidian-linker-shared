'use strict';

// Highlighting matched words in Reading view (DOM) and in the editor (CM6), shared by the
// two prose linkers.
//
// The pair had two copies of this file differing in about seventy lines, and every one of
// those lines was a name rather than a decision: `heading-link` against `glossary-link`,
// `data-heading-target` against `data-glossary-target`, `m.linktext` against `m.canonical`,
// and each plugin's own way of asking "which note am I in?". The behaviour — what counts as
// a protected node, when a span is ambiguous, what a middle-click does, how a peer's readings
// ride along on a decoration — was identical, so a fix to one copy had to be transcribed into
// the other by hand. That is the duplication this removes.
//
// `createHighlight(config)` returns the mixin; the names live in the config.
//
//   cls          prefix for CSS classes and data attributes ('heading' -> `heading-link`,
//                `cm-heading-link`, `data-heading-target`). A global namespace, so it must be
//                the plugin's own.
//   displayName  used only in the console warning when CodeMirror is missing.
//   targetOf     match -> the string this plugin links to and reopens from.
//   selfIdFor    (plugin, path) -> how the matcher recognises the note's own entry, so a note
//                doesn't link to itself.

const { t } = require('../i18n');
const { ownedMatches, yieldedCandidates, candidatesFor, discoverLinkers } = require('../discover');

function createHighlight(config) {
  const { cls, displayName, targetOf, selfIdFor } = config;

  const LINK_CLASS = `${cls}-link`;
  const AMBIGUOUS_CLASS = `${cls}-ambiguous`;
  const CM_LINK_CLASS = `cm-${cls}-link`;
  const CM_AMBIGUOUS_CLASS = `cm-${cls}-ambiguous`;
  const ATTR_TARGET = `data-${cls}-target`;
  const ATTR_ALTS = `data-${cls}-alts`;
  const ATTR_FOREIGN = `data-${cls}-foreign`;

  return {
    // Our matches minus the ones a higher-ranked sibling linker also claims. With no sibling
    // installed this is the list itself and costs nothing; with one, a word both know is
    // drawn once, by the same plugin in both render modes, rather than by whichever ran
    // first. See shared/discover.js.
    ownSpans(text, matches) {
      const provider = this.api && this.api.linker;
      if (!provider) return matches;
      return ownedMatches(this.app, provider, text, matches);
    },

    // What the linkers that yielded a span to us would have offered there. Empty in a solo
    // vault, so the caller pays nothing for asking.
    yieldedIn(text) {
      const provider = this.api && this.api.linker;
      if (!provider) return [];
      return yieldedCandidates(this.app, provider, text);
    },

    processReadingMode(el, ctx) {
      if (!this.settings.highlightInReading) return;
      const sourcePath = ctx.sourcePath;
      if (sourcePath && !this.inScope(sourcePath)) return;
      const selfId = selfIdFor(this, sourcePath);

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          let p = node.parentElement;
          while (p) {
            const tag = p.tagName;
            if (tag === 'CODE' || tag === 'PRE' || tag === 'A') return NodeFilter.FILTER_REJECT;
            if (this.settings.skipHeadings && /^H[1-6]$/.test(tag)) return NodeFilter.FILTER_REJECT;
            if (p.classList && p.classList.contains(LINK_CLASS)) return NodeFilter.FILTER_REJECT;
            if (p === el) break;
            p = p.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) this.decorateTextNode(node, selfId, sourcePath);
    },

    decorateTextNode(node, selfId, sourcePath) {
      const text = node.textContent;
      if (!text || text.length < 2) return;
      // protect:true keeps this in step with the materialize path, so the Nth
      // highlighted occurrence here is the Nth occurrence that gets linked.
      const matches = this.ownSpans(text, this.findMatches(text, selfId, { protect: true }));
      if (!matches.length) return;
      // Collected once for the whole node, not per match.
      const yielded = this.yieldedIn(text);

      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const m of matches) {
        if (m.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
        const target = targetOf(m);
        const display = m.display;
        // Another linker's readings of the same word sit alongside our own alternatives: a
        // word that means two things is ambiguous whether or not one plugin knows both.
        const foreign = candidatesFor(yielded, m.start, m.end);
        const alts = [...(m.alts || []), ...foreign];
        const a = document.createElement('a');
        a.textContent = display;
        a.setAttribute(ATTR_TARGET, target); // used for occurrence counting below
        if (alts.length) {
          // Ambiguous: no data-href, so Obsidian shows no (misleading) single-page
          // preview, just the aria-label tooltip. Click asks which one to open.
          a.className = `${LINK_CLASS} ${AMBIGUOUS_CLASS}`;
          const candidates = [target, ...alts];
          // No aria-label listing the names: hovering now opens the list itself, and the
          // app renders an aria-label as a tooltip, so the two would say the same thing on
          // top of each other.
          const pick = (e, newTab) => {
            e.preventDefault();
            e.stopPropagation();
            // The modal opens a foreign candidate with no arguments, so where and how to open
            // is bound here, at the click that knows both.
            this.chooseTerm(
              candidates.map((c) => (typeof c === 'object' ? { ...c, open: () => c.open(sourcePath, newTab) } : c)),
              newTab ? t('menu.openNewTabTitle') : t('menu.openTitle'),
              (c) => this.openTerm(c, sourcePath, newTab)
            );
          };
          // Hovering lists what the word could mean, and hovering a row in that list asks
          // Obsidian for its ordinary preview of that one target. The span itself still gets
          // no preview: one note's preview for a word that means three would be a lie.
          a.addEventListener('mouseenter', (e) => {
            if (!this.choices) return;
            this.choices.schedule(candidates.map((c) => (typeof c === 'object' ? {
              label: c.label,
              open: () => c.open(sourcePath, false),
              hover: (ev, row, parent) => c.hover(ev, row, sourcePath, parent),
            } : c)), e.clientX, e.clientY);
          });
          a.addEventListener('mouseleave', () => { if (this.choices) this.choices.leave(); });
          a.addEventListener('click', (e) => pick(e, e.ctrlKey || e.metaKey));
          // Middle-click fires auxclick; suppress the default new-tab nav so it routes
          // through the picker too.
          a.addEventListener('auxclick', (e) => { if (e.button === 1) pick(e, true); });
          a.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } });
        } else {
          // A single reading: a real internal link, so hover shows its preview.
          a.className = `internal-link ${LINK_CLASS}`;
          a.href = target;
          a.setAttribute('data-href', target);
        }
        // No context menu here on purpose. Reading view is for reading: a click opens (asking
        // which target when there are several), and everything that edits the note lives in
        // the editor's own menu. Offering "link this word" here but not its opposite was the
        // asymmetry that made the two menus feel like different plugins.
        frag.appendChild(a);
        cursor = m.end;
      }
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      node.parentNode.replaceChild(frag, node);
    },

    // Editor highlight (Live Preview / Source). Always registered; the
    // editingHighlight setting controls if and how often it recomputes.
    registerEditingHighlight() {
      let view, state, language;
      try {
        view = require('@codemirror/view');
        state = require('@codemirror/state');
        language = require('@codemirror/language');
      } catch (e) {
        console.warn(`${displayName}: CM6 modules unavailable, editor highlight disabled`, e);
        return;
      }
      const { ViewPlugin, Decoration } = view;
      const { RangeSetBuilder, StateEffect } = state;
      const { syntaxTree } = language;
      const plugin = this;

      const refresh = StateEffect.define();
      this.cmRefreshEffect = refresh;

      const markCache = new Map();
      const markFor = (target) => {
        let m = markCache.get(target);
        if (!m) {
          m = Decoration.mark({ class: CM_LINK_CLASS, attributes: { [ATTR_TARGET]: target } });
          markCache.set(target, m);
        }
        return m;
      };
      // Collision marks carry a per-match tooltip and the alternatives, so they are not cached.
      // The tooltip lists every match, including the one it resolves to. Another linker's
      // readings ride along as data: a decoration is attributes, not closures, so the candidate
      // keeps the peer's id and the opener is looked up again on click.
      const markWithAlts = (target, alts, foreign) => {
        const attributes = {
          [ATTR_TARGET]: target,
          [ATTR_ALTS]: alts.join('\n'),
        };
        if (foreign.length) {
          attributes[ATTR_FOREIGN] = JSON.stringify(foreign.map((f) => ({ id: f.id, label: f.label, target: f.target, source: f.source })));
        }
        return Decoration.mark({ class: `${CM_LINK_CLASS} ${CM_AMBIGUOUS_CLASS}`, attributes });
      };

      const skipNode = (name) => /code|link|url|header|hashtag|frontmatter|comment|tag|escape/i.test(name);

      const buildDeco = (editorView) => {
        const builder = new RangeSetBuilder();
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile && !plugin.inScope(activeFile.path)) return builder.finish();
        const selfId = activeFile ? selfIdFor(plugin, activeFile.path) : null;
        const tree = syntaxTree(editorView.state);
        for (const { from, to } of editorView.visibleRanges) {
          const text = editorView.state.doc.sliceString(from, to);
          // Once per visible range, not per match.
          const yielded = plugin.yieldedIn(text);
          for (const m of plugin.ownSpans(text, plugin.findMatches(text, selfId))) {
            const start = from + m.start;
            const end = from + m.end;
            let skip = false;
            tree.iterate({ from: start, to: end, enter: (n) => { if (skipNode(n.type.name)) skip = true; } });
            if (skip) continue;
            const alts = m.alts || [];
            const foreign = candidatesFor(yielded, m.start, m.end);
            builder.add(start, end, alts.length || foreign.length ? markWithAlts(targetOf(m), alts, foreign) : markFor(targetOf(m)));
          }
        }
        return builder.finish();
      };

      const targetEl = (e) => (e.target instanceof HTMLElement ? e.target.closest('.' + CM_LINK_CLASS) : null);
      const targetOfEl = (el) => el.getAttribute(ATTR_TARGET);
      const altsOf = (el) => { const v = el.getAttribute(ATTR_ALTS); return v ? v.split('\n') : null; };
      // Another linker's readings, parked on the decoration as data. The opener is resolved
      // now rather than then: the plugin may have been disabled since the mark was drawn.
      const foreignOf = (el, sourcePath, newTab) => {
        const raw = el.getAttribute(ATTR_FOREIGN);
        if (!raw) return [];
        let parsed;
        try { parsed = JSON.parse(raw); } catch (err) { return []; }
        const peers = discoverLinkers(plugin.app);
        return parsed.map((f) => {
          const peerOf = () => peers.find((p) => p.id === f.id);
          return {
            label: f.label,
            source: f.source,
            open: () => {
              const peer = peerOf();
              if (peer && typeof peer.open === 'function') peer.open(f.target, sourcePath, newTab);
            },
            hover: (ev, row, parent) => {
              const peer = peerOf();
              if (peer && typeof peer.hover === 'function') peer.hover(f.target, ev, row, sourcePath, parent);
            },
          };
        });
      };

      // The candidates parked on a decoration, read back out of it.
      const candidatesOn = (el, sourcePath) =>
        [targetOfEl(el), ...(altsOf(el) || []), ...foreignOf(el, sourcePath, false)];

      // Pressing the modifier while already hovering a word has to open the list, exactly as
      // the app shows a link preview when you press it without moving the pointer. mouseover
      // fired long before the key did, so the key press is its own event — the other order
      // (modifier first, then move onto the word) is what the mouseover handler covers.
      let lastX = 0;
      let lastY = 0;
      plugin.registerDomEvent(document, 'mousemove', (e) => { lastX = e.clientX; lastY = e.clientY; });
      plugin.registerDomEvent(document, 'keydown', (e) => {
        if (!plugin.choices || !(e.ctrlKey || e.metaKey)) return;
        const under = document.elementFromPoint(lastX, lastY);
        const el = under && under.closest ? under.closest('.' + CM_LINK_CLASS) : null;
        if (!el || !(el.hasAttribute(ATTR_ALTS) || el.hasAttribute(ATTR_FOREIGN))) return;
        const file = plugin.app.workspace.getActiveFile();
        plugin.choices.schedule(candidatesOn(el, file ? file.path : ''), lastX, lastY);
      });

      const vp = ViewPlugin.fromClass(
        class {
          constructor(v) { this.decorations = plugin.settings.editingHighlight === 'off' ? Decoration.none : buildDeco(v); }
          update(u) {
            const mode = plugin.settings.editingHighlight;
            if (mode === 'off') { if (this.decorations.size) this.decorations = Decoration.none; return; }
            const forced = u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh)));
            if (u.viewportChanged || forced || (mode === 'live' && (u.docChanged || u.selectionSet))) {
              this.decorations = buildDeco(u.view);
            } else if (u.docChanged) {
              this.decorations = this.decorations.map(u.changes);
            }
          }
        },
        {
          decorations: (v) => v.decorations,
          eventHandlers: {
            mousedown(e) {
              const el = targetEl(e);
              if (!el) return;
              const file = plugin.app.workspace.getActiveFile();
              const sourcePath = file ? file.path : '';
              const alts = altsOf(el) || [];
              // Same set of readings the reading view offers, so a word behaves the same in
              // both modes rather than losing half its meanings in the editor.
              const pick = (newTab, title) => {
                const candidates = [targetOfEl(el), ...alts, ...foreignOf(el, sourcePath, newTab)];
                plugin.chooseTerm(candidates, title, (c) => plugin.openTerm(c, sourcePath, newTab));
              };
              // Like Obsidian's links: middle-click opens a tab, Ctrl/Cmd+click follows.
              // An ambiguous word asks which one to open first.
              if (e.button === 1) {
                pick(true, t('menu.openNewTabTitle'));
                e.preventDefault();
                return;
              }
              if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
              pick(false, t('menu.openTitle'));
              e.preventDefault();
            },
            mouseover(e) {
              const el = targetEl(e);
              if (!el) return;
              const file = plugin.app.workspace.getActiveFile();
              const sourcePath = file ? file.path : '';
              // Ambiguous: no single preview, because one target's preview would be a lie
              // about a word that means several things. The list of meanings instead, with
              // the real preview one row-hover away.
              if (el.hasAttribute(ATTR_ALTS) || el.hasAttribute(ATTR_FOREIGN)) {
                // In the editor a link previews only with the modifier held, and this list
                // stands in for a preview, so it follows the same rule. Reading view has no
                // such requirement and does not apply one either.
                if (!plugin.choices || !(e.ctrlKey || e.metaKey)) return;
                plugin.choices.schedule(candidatesOn(el, sourcePath), e.clientX, e.clientY);
                return;
              }
              plugin.hoverTerm(e, el, targetOfEl(el), sourcePath);
            },
            mouseout(e) {
              if (targetEl(e) && plugin.choices) plugin.choices.leave();
            },
            // No handler for contextmenu: a right-click in the editor already raises Obsidian's
            // own menu, and everything we offer for the word under the cursor is added there.
            // One menu, whichever half of the toggle applies.
          },
        }
      );
      this.registerEditorExtension(vp);
    },
  };
}

module.exports = { createHighlight };
