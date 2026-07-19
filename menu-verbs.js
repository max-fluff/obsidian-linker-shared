'use strict';

// Grouping menu items by what they do, across every linker that offers the same thing.
//
// A *verb* is an action more than one plugin can offer on the same object. Items are
// declared rather than written, so the builder can count them — ours plus, through offers(),
// the siblings' — before deciding whether the verb earns a submenu. It has to be decided up
// front: an item already in Obsidian's menu cannot be pulled back out and reparented.

const { sharedSection, menuSection } = require('./menu');
const { peersOffering } = require('./discover');
const { t } = require('./i18n');

// The family's verb vocabulary. A new shared verb is a line here plus an answer from each
// plugin's offers(). `label` may interpolate {value}, the object the verb acts on.
const VERBS = {
  convert: { label: 'menu.convert.group', icon: 'link' },
  open: { label: 'menu.open.group', icon: 'file-search' },
  exclude: { label: 'exclude.group', icon: 'ban' },
};

// Records what the handler asks for, then writes it. Stands in for Obsidian's Menu, so a
// handler that already builds items against `menu` needs no changes beyond tagging.
class MenuBuilder {
  constructor(plugin, menu) {
    this.plugin = plugin;
    this.menu = menu;
    this.entries = [];
  }

  // Untagged: written where it stands, exactly as Obsidian's own Menu would.
  addItem(cb) { this.entries.push({ cb }); return this; }
  addSeparator() { this.entries.push({ separator: true }); return this; }

  // Tagged. `cb(item, grouped)` is told whether it ended up in a submenu, since the wording
  // differs: inside one, the parent already names the object.
  tagged(verb, opts, cb) {
    if (!VERBS[verb]) throw new Error('unknown menu verb: ' + verb);
    this.entries.push({ cb, verb, value: opts && opts.value });
    return this;
  }

  // A submenu of this plugin's own — the several ways to link one word, say. Unlike a verb it
  // is never shared, and it is built even for a single item because the items only read as a
  // set. Takes items the way a menu does.
  section(label, icon) {
    const entry = { section: { label, icon }, children: [] };
    this.entries.push(entry);
    const child = {
      addItem(cb) { entry.children.push({ cb }); return child; },
      addSeparator() { entry.children.push({ separator: true }); return child; },
    };
    return child;
  }

  // Verb -> the object it acts on, for those that earned a submenu. All items of one verb in
  // one menu act on the same object, so the first one's value names the group.
  groupedVerbs() {
    const counts = new Map();
    for (const e of this.entries) {
      if (!e.verb) continue;
      const seen = counts.get(e.verb) || { count: 0, value: e.value };
      seen.count++;
      counts.set(e.verb, seen);
    }
    const provider = this.plugin.api && this.plugin.api.linker;
    const grouped = new Map();
    for (const [verb, { count, value }] of counts) {
      // A peer may contribute more than one item, but any peer at all is enough: with
      // something of ours and something of theirs the group has earned itself.
      const peers = provider ? peersOffering(this.plugin.app, provider, verb, value).length : 0;
      if (count + peers > 1) grouped.set(verb, value);
    }
    return grouped;
  }

  // menuSection builds the group on its first item, so an empty one leaves no trace, and it
  // falls back to prefixed titles where the app has no submenus.
  writeSection(entry) {
    if (!entry.children.length) return;
    const sub = menuSection(this.menu, entry.section.label, true, entry.section.icon);
    for (const child of entry.children) {
      if (child.separator) sub.addSeparator();
      else sub.addItem((item) => child.cb(item, true));
    }
  }

  sectionFor(verb, value) {
    const spec = VERBS[verb];
    const label = t(spec.label, value == null ? undefined : { value });
    return sharedSection(this.menu, 'linker:' + verb, label, spec.icon);
  }

  // Replayed in declaration order, so a verb's submenu appears where its first item would
  // have. Anything else keeps its place.
  flush() {
    const grouped = this.groupedVerbs();
    const sections = new Map();
    for (const e of this.entries) {
      if (e.separator) { this.menu.addSeparator(); continue; }
      if (e.section) { this.writeSection(e); continue; }
      if (!e.verb || !grouped.has(e.verb)) {
        this.menu.addItem((item) => e.cb(item, false));
        continue;
      }
      if (!sections.has(e.verb)) sections.set(e.verb, this.sectionFor(e.verb, grouped.get(e.verb)));
      sections.get(e.verb).addItem((item) => e.cb(item, true));
    }
  }
}

// Run a menu handler against a builder, then write what it asked for.
function buildMenu(plugin, menu, fn) {
  const builder = new MenuBuilder(plugin, menu);
  fn(builder);
  builder.flush();
}

module.exports = { VERBS, MenuBuilder, buildMenu };
