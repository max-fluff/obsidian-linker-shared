'use strict';

// Highlighting matched words in Reading view (DOM) and in the editor (CM6), shared by the
// two prose linkers. `createHighlight(config)` returns the mixin; the names live in the
// config:
//
//   cls          prefix for CSS classes and data attributes ('heading' -> `heading-link`,
//                `cm-heading-link`, `data-heading-target`). A global namespace, so it must
//                be the plugin's own.
//   displayName  used only in the console warning when CodeMirror is missing.
//   targetOf     match -> the string this plugin links to and reopens from.
//   selfIdFor    (plugin, path) -> the matcher's id for the note itself, so a note doesn't
//                link to itself.

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
    // Our matches minus the ones a higher-ranked sibling also claims.
    // `where` is `{ path, surface }` — which note, and which of reading/editing/menu is being
    // built. Peers use it to stand aside where they would draw nothing.
    ownSpans(text, matches, where) {
      const provider = this.api && this.api.linker;
      if (!provider) return matches;
      return ownedMatches(this.app, provider, text, matches, where);
    },

    // The editor keeps a span's foreign candidates in a DOM attribute, so they are rebuilt
    // from JSON rather than handed over as closures. Everything is resolved against the peer
    // at use time, not at draw time: it may have been disabled since the mark was drawn, and
    // a row that captions itself from stale data would read differently here than in reading
    // view.
    foreignFromAttr(raw, sourcePath, newTab) {
      if (!raw) return [];
      let parsed;
      try { parsed = JSON.parse(raw); } catch (err) { return []; }
      const peers = discoverLinkers(this.app);
      return parsed.map((f) => {
        const peerOf = () => peers.find((p) => p.id === f.id);
        const ask = (name, fn) => {
          const peer = peerOf();
          if (!peer || typeof peer[name] !== 'function') return null;
          try { return fn(peer); } catch (err) { return null; }
        };
        return {
          label: f.label,
          source: f.source,
          describe: (display) => ask('describe', (peer) => peer.describe(f.target, display)),
          open: () => ask('open', (peer) => peer.open(f.target, sourcePath, newTab)),
          hover: (ev, row, parent) => ask('hover', (peer) => peer.hover(f.target, ev, row, sourcePath, parent)),
        };
      });
    },

    // What the linkers that yielded a span to us would have offered there.
    yieldedIn(text, where) {
      const provider = this.api && this.api.linker;
      if (!provider) return [];
      return yieldedCandidates(this.app, provider, text, where);
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
      // protect:true keeps this in step with the materialize path, so the Nth highlighted
      // occurrence here is the Nth occurrence that gets linked.
      const where = { path: sourcePath, surface: 'reading' };
      const matches = this.ownSpans(text, this.findMatches(text, selfId, { protect: true }), where);
      if (!matches.length) return;
      const yielded = this.yieldedIn(text, where);

      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const m of matches) {
        if (m.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
        const target = targetOf(m);
        const display = m.display;
        const foreign = candidatesFor(yielded, m.start, m.end);
        const alts = [...(m.alts || []), ...foreign];
        const a = document.createElement('a');
        a.textContent = display;
        a.setAttribute(ATTR_TARGET, target); // used for occurrence counting below
        if (alts.length) {
          // No data-href: Obsidian would show one target's preview for a word that means
          // several. No aria-label either — the hover list already says the same thing, and
          // the app renders aria-labels as tooltips on top of it.
          a.className = `${LINK_CLASS} ${AMBIGUOUS_CLASS}`;
          const candidates = [target, ...alts];
          const pick = (e, newTab) => {
            e.preventDefault();
            e.stopPropagation();
            this.chooseTerm(
              candidates.map((c) => (typeof c === 'object' ? { ...c, open: () => c.open(sourcePath, newTab) } : c)),
              newTab ? t('menu.openNewTabTitle') : t('menu.openTitle'),
              (c) => this.openTerm(c, sourcePath, newTab),
              display
            );
          };
          a.addEventListener('mouseenter', (e) => {
            if (!this.choices) return;
            this.choices.schedule(candidates.map((c) => (typeof c === 'object' ? Object.assign({}, c, {
              open: () => c.open(sourcePath, false),
              hover: (ev, row, parent) => c.hover(ev, row, sourcePath, parent),
            }) : c)), e.clientX, e.clientY, display);
          });
          a.addEventListener('mouseleave', () => { if (this.choices) this.choices.leave(); });
          a.addEventListener('click', (e) => pick(e, e.ctrlKey || e.metaKey));
          // Middle-click fires auxclick; suppress the default new-tab nav so it routes
          // through the picker too.
          a.addEventListener('auxclick', (e) => { if (e.button === 1) pick(e, true); });
          a.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } });
        } else {
          a.className = `internal-link ${LINK_CLASS}`;
          a.href = target;
          a.setAttribute('data-href', target);
        }
        // No context menu on purpose: reading view is for reading, and everything that edits
        // the note lives in the editor's own menu.
        frag.appendChild(a);
        cursor = m.end;
      }
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      node.parentNode.replaceChild(frag, node);
    },

    // Always registered; the editingHighlight setting controls if and how often it recomputes.
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
      // A decoration is attributes, not closures, so a peer's readings ride along as data:
      // the candidate keeps the peer's id and the opener is looked up again on click.
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
          const where = { path: activeFile ? activeFile.path : undefined, surface: 'editing' };
          const yielded = plugin.yieldedIn(text, where);
          for (const m of plugin.ownSpans(text, plugin.findMatches(text, selfId), where)) {
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
      // The opener is resolved at click time, not at draw time: the peer may have been
      // disabled since the mark was drawn.
      const foreignOf = (el, sourcePath, newTab) =>
        plugin.foreignFromAttr(el.getAttribute(ATTR_FOREIGN), sourcePath, newTab);

      const candidatesOn = (el, sourcePath) =>
        [targetOfEl(el), ...(altsOf(el) || []), ...foreignOf(el, sourcePath, false)];

      // Pressing the modifier while already hovering: mouseover fired long before the key,
      // so the key press has to be its own way in.
      let lastX = 0;
      let lastY = 0;
      plugin.registerDomEvent(document, 'mousemove', (e) => { lastX = e.clientX; lastY = e.clientY; });
      plugin.registerDomEvent(document, 'keydown', (e) => {
        if (!plugin.choices || !(e.ctrlKey || e.metaKey)) return;
        const under = document.elementFromPoint(lastX, lastY);
        const el = under && under.closest ? under.closest('.' + CM_LINK_CLASS) : null;
        if (!el || !(el.hasAttribute(ATTR_ALTS) || el.hasAttribute(ATTR_FOREIGN))) return;
        const file = plugin.app.workspace.getActiveFile();
        plugin.choices.schedule(candidatesOn(el, file ? file.path : ''), lastX, lastY, el.textContent);
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
              const pick = (newTab, title) => {
                const candidates = [targetOfEl(el), ...alts, ...foreignOf(el, sourcePath, newTab)];
                plugin.chooseTerm(candidates, title, (c) => plugin.openTerm(c, sourcePath, newTab), el.textContent);
              };
              // Like Obsidian's links: middle-click opens a tab, Ctrl/Cmd+click follows.
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
              if (el.hasAttribute(ATTR_ALTS) || el.hasAttribute(ATTR_FOREIGN)) {
                // The list stands in for a preview, so in the editor it follows the preview's
                // rule and waits for the modifier. Reading view has no such rule.
                if (!plugin.choices || !(e.ctrlKey || e.metaKey)) return;
                plugin.choices.schedule(candidatesOn(el, sourcePath), e.clientX, e.clientY, el.textContent);
                return;
              }
              plugin.hoverTerm(e, el, targetOfEl(el), sourcePath);
            },
            mouseout(e) {
              if (targetEl(e) && plugin.choices) plugin.choices.leave();
            },
            // No contextmenu handler: a right-click already raises Obsidian's menu, and
            // everything we offer for the word under the cursor is added there.
          },
        }
      );
      this.registerEditorExtension(vp);
    },
  };
}

module.exports = { createHighlight };
