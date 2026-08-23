'use strict';

// Style Settings reads the document's stylesheets once, when it loads. A plugin's own sheet
// arrives with the plugin, so one enabled afterwards has to say that its sheet is there.

function announceStyleSettings(plugin) {
  plugin.app.workspace.onLayoutReady(() => plugin.app.workspace.trigger('parse-style-settings'));
}

module.exports = { announceStyleSettings };
