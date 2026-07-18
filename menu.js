'use strict';

// Menu grouping for when several linkers share one context menu. Configuration items group
// under the plugin's name — the reader is choosing which plugin to configure. A solo plugin
// stays flat and the menu looks exactly as it always did.

const obsidian = require('obsidian');

// Submenus arrived after our minimum app version, so probe once rather than assume.
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

// A place to add items to. `grouped` false hands back the menu itself. Grouped, items go
// under `label` — a submenu where the app has them, a "Label: item" prefix where it doesn't.
// The group is created on the first item, so a plugin with nothing to add leaves no empty
// entry behind.
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

// A submenu shared *between* plugins. Each plugin bundles its own copy of this file, so a
// module-level cache would be private to whoever loaded it — the one surface both sides truly
// share is the menu object Obsidian hands round. Whoever gets the event first builds the
// submenu under `key`; the second finds it there. The property dies with the menu.
const STORE = '__linkerMenuSections';

function sharedSection(menu, key, label, icon) {
  if (!supportsSubmenu()) return menuSection(menu, label, true);
  let store = menu[STORE];
  if (!store) {
    store = {};
    // Non-enumerable so it can't turn up in anything that walks the menu.
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
