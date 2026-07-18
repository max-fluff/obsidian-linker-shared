'use strict';

// Keeping the context menu readable when several linkers are installed.
//
// Each plugin adds its own scope and link items to the menu Obsidian hands round. On its own
// that reads fine. With a sibling installed the same menu collects two sets of near-identical
// entries — "Never link in this note" twice, with nothing to tell them apart, because they
// are genuinely different settings on different plugins.
//
// So once there is a sibling, a plugin puts its items in a submenu under its own name. Here
// the plugin name is the whole point: the reader is choosing which plugin to configure, not
// what a word means. Alone, nothing is grouped and the menu looks exactly as it always did.

const obsidian = require('obsidian');

// Submenus arrived after the minimum app version, so ask once rather than assume. The probe
// menu is built and dropped; it is never shown.
let submenuSupport = null;
function supportsSubmenu() {
  if (submenuSupport !== null) return submenuSupport;
  submenuSupport = false;
  try {
    const probe = new obsidian.Menu();
    probe.addItem((item) => { submenuSupport = typeof item.setSubmenu === 'function'; });
  } catch (e) {
    submenuSupport = false;
  }
  return submenuSupport;
}

// A place to add items to. `grouped` false hands back the menu itself, so a solo plugin is
// untouched. Grouped, items go under `label` — as a submenu where the app has them, else as
// "Label: item", which at least says whose they are.
//
// The group is created on the first item, so a plugin that turns out to have nothing to add
// leaves no empty entry behind.
function menuSection(menu, label, grouped, icon) {
  if (!grouped) return menu;

  if (!supportsSubmenu()) {
    return {
      addItem(cb) {
        return menu.addItem((item) => {
          const setTitle = item.setTitle.bind(item);
          item.setTitle = (title) => setTitle(`${label}: ${title}`);
          cb(item);
        });
      },
      addSeparator() { return menu.addSeparator(); },
    };
  }

  let sub = null;
  const ensure = () => {
    if (!sub) {
      menu.addItem((item) => {
        item.setTitle(label);
        if (icon) item.setIcon(icon);
        sub = item.setSubmenu();
      });
    }
    return sub;
  };
  return {
    addItem(cb) { return ensure().addItem(cb); },
    addSeparator() { return sub ? sub.addSeparator() : null; },
  };
}

// Where the group has to be shared between plugins, not just within one.
//
// Two linkers offering the same verb on the same selection — "find and convert this to a
// link" — should read as one entry with two destinations, not two entries with near-identical
// wording. That needs both plugins to add into the *same* submenu, and they have no shared
// memory: each bundles its own copy of this file, so a module-level cache or a WeakMap here
// is private to whoever loaded it.
//
// The one surface both sides genuinely share is the menu object Obsidian hands round. So the
// group is parked on it under a documented key. Whoever gets the event first builds the
// submenu; the second finds it and adds to it. Nothing is registered globally and the
// property dies with the menu.
const STORE = '__linkerMenuSections';

function sharedSection(menu, key, label, icon) {
  if (!supportsSubmenu()) return menuSection(menu, label, true);
  let store = menu[STORE];
  if (!store) {
    store = {};
    // Non-enumerable so the property can't turn up in anything that walks the menu.
    try {
      Object.defineProperty(menu, STORE, { value: store, enumerable: false, configurable: true });
    } catch (e) {
      return menuSection(menu, label, true, icon);
    }
  }
  if (!store[key]) {
    menu.addItem((item) => {
      item.setTitle(label);
      if (icon) item.setIcon(icon);
      store[key] = item.setSubmenu();
    });
  }
  return store[key];
}

module.exports = { menuSection, sharedSection, supportsSubmenu };
