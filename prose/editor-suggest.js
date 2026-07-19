'use strict';

// Inline autocomplete for the prose linkers: while typing a bare word in an in-scope note,
// offer to link it. Two kinds of candidate, both plugins:
//   'form'   — the typed word is an inflection of a term (the highlighter's engine);
//              inserts the link keeping the reader's own wording.
//   'prefix' — the typed text starts a term or one of its aliases; completes to it.
//
// The popup itself is shared with every sibling linker (see ./suggest.js), so a row may be
// ours or a peer's. A peer's carries an `insert` closure and is drawn identically — the
// reader is choosing a destination, not a plugin.
//
// createProseSuggest(config):
//   cls          class prefix for the suggestion rows
//   ownId        (plugin) -> the id of the note being typed in, when it is itself a term
//                source; its own terms are never offered, matching the highlighter
//   collect      (plugin, query, ownId) -> this plugin's candidates, ranked
//   noteFor      (item) -> the second line of one of our own rows
//   labelOf      (item) -> the title of one of our own rows
//   targetOf     (item) -> what one of our own rows links to
//   displayFor   (item, query) -> the visible text of the link we insert

const { EditorSuggest } = require('obsidian');
const { inTableCell } = require('../markdown');
const { mergeSuggestions, suggestionsAllowed } = require('./suggest');

function createProseSuggest(config) {
  const { cls, ownId, collect, noteFor, labelOf, targetOf, displayFor } = config;

  return class ProseSuggest extends EditorSuggest {
    constructor(app, plugin) {
      super(app);
      this.plugin = plugin;
    }

    onTrigger(cursor, editor, file) {
      const plugin = this.plugin;
      if (!file) return null;

      const line = editor.getLine(cursor.line);
      // Only complete at the end of a word — not while the cursor sits inside one.
      if (/[\p{L}\p{Nd}]/u.test(line[cursor.ch] || '')) return null;
      const m = line.slice(0, cursor.ch).match(/[\p{L}\p{Nd}]+$/u);
      if (!m) return null;
      const query = m[0];
      if (!suggestionsAllowed(plugin, query, file.path)) return null;

      // A word glued to a sigil belongs to another suggester (a sigil linker's trigger, a
      // tag, math), not to prose — yield so it keeps the slot.
      const before = line[cursor.ch - query.length - 1] || '';
      if (before && (plugin.settings.suggestSkipAfter || '').includes(before)) return null;

      // Skip code/links/frontmatter/urls/headings — the same ranges the linker protects.
      // A position check, not a document scan: this runs on every keystroke.
      const off = editor.posToOffset(cursor);
      if (plugin.isProtectedAt(editor.getValue(), off)) return null;

      // Built here rather than in getSuggestions: claiming the popup with nothing to offer
      // would silence a sibling suggester that does know this word.
      const items = this.merged(query, file.path);
      if (!items.length) return null;
      this.cached = { query, items };

      return { start: { line: cursor.line, ch: cursor.ch - query.length }, end: cursor, query };
    }

    // Ours plus every sibling linker's, in one list. `sourcePath` travels with the query so
    // each sibling can decline a note outside its own scope — we are only in scope for us.
    merged(query, sourcePath) {
      return mergeSuggestions(this.plugin, query, collect(this.plugin, query, ownId(this.plugin)), sourcePath);
    }

    getSuggestions(context) {
      // onTrigger already built these to decide whether to trigger at all; recompute only if
      // something moved on between the two calls.
      if (this.cached && this.cached.query === context.query) return this.cached.items;
      return this.merged(context.query, context.file && context.file.path);
    }

    renderSuggestion(item, el) {
      el.addClass(`${cls}-suggestion`);
      el.createSpan({ cls: `${cls}-suggestion-title`, text: item.insert ? item.label : labelOf(item) });
      const note = item.insert ? item.note : noteFor(item);
      if (note) el.createSpan({ cls: `${cls}-suggestion-note`, text: note });
    }

    selectSuggestion(item) {
      const ctx = this.context;
      if (!ctx) return;
      const editor = ctx.editor;
      const inTable = inTableCell(editor.getValue(), editor.posToOffset(ctx.start));
      // Each row is composed by the plugin that owns it, our switch included — Obsidian hands
      // the popup to whichever suggester triggered first, so ours must not govern a peer's row.
      let text;
      if (item.insert) {
        // `display: null` from a peer means "keep what the reader typed".
        text = item.insert(item.display == null ? ctx.query : item.display, inTable);
      } else {
        const display = displayFor(item, ctx.query);
        // Plain text needs no table escaping: a display never carries the pipe that splits a row.
        text = this.plugin.settings.suggestPlainText
          ? display
          : this.plugin.wikiLink(targetOf(item), display, inTable);
      }
      if (!text) return;
      editor.replaceRange(text, ctx.start, ctx.end);
      editor.setCursor(editor.offsetToPos(editor.posToOffset(ctx.start) + text.length));
    }
  };
}

// EditorSuggest predates the plugins' minAppVersion, but callers still feature-detect.
const suggestAvailable = () => typeof EditorSuggest === 'function';

module.exports = { createProseSuggest, suggestAvailable };
