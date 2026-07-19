'use strict';

// The built main.js must load and run onload().
//
// The plugin tests all load src/, where Node resolves requires from disk. The bundle is a
// different artifact: esbuild can only follow a literal require path, and it leaves a
// computed one in place as a runtime require that Obsidian cannot resolve. That shipped
// once — a `require('./locales/' + kind)` built cleanly, passed every test, and stopped all
// four plugins loading. Only exercising the bundle catches it.

const path = require('path');
const Module = require('module');
const { describe, it, assert } = require('../harness');
const { fakeApp } = require('../stubs');

// The plugin root is four levels up from src/shared/testing/tests.
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const manifest = require(path.join(ROOT, 'manifest.json'));

describe('built bundle', () => {
  it('has no require the bundler left unresolved', () => {
    const fs = require('fs');
    const bundle = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    // Anything but require('obsidian') / require('electron') / a node builtin is a require
    // esbuild could not inline — the externals are declared in esbuild.config.mjs.
    const bad = [...bundle.matchAll(/require\((?!"[a-z@][\w@/.-]*"\))([^)]{0,40})/g)]
      .map((m) => m[0])
      .filter((s) => !/require\(\s*$/.test(s));
    assert.deepStrictEqual(bad, [], `unresolved require in the bundle: ${bad.join(' | ')}`);
  });

  it('loads and runs onload without throwing', async () => {
    const Plugin = require(path.join(ROOT, 'main.js'));
    const plugin = new Plugin(fakeApp, { version: manifest.version, id: manifest.id });
    await plugin.onload();
    assert.ok(plugin.api && plugin.api.linker, 'the bundle loaded but published no provider');
  });
});
