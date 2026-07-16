#!/usr/bin/env node
// Write the family's vector headers from a plugin's brand config. No browser, no deps —
// SVG is built as text.
//
//   node src/shared/branding/make-banner.mjs [config.mjs]
//
// The config path defaults to docs/branding.config.mjs, resolved from the current working
// directory (the plugin root). See BRANDING.md for the config shape.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { renderBanner, renderSocial } from './banner-template.mjs';

const cwd = process.cwd();
const configArg = process.argv[2] || 'docs/branding.config.mjs';
const configPath = resolve(cwd, configArg);

if (!existsSync(configPath)) {
  console.error(`config not found: ${configArg}\n(run from the plugin root, or pass a path)`);
  process.exit(1);
}

const { default: cfg } = await import(pathToFileURL(configPath).href);
const imagesDir = resolve(cwd, cfg.imagesDir || 'docs/images');
mkdirSync(imagesDir, { recursive: true });

for (const [name, svg] of [
  ['banner.svg', renderBanner(cfg.brand)],
  ['social-preview.svg', renderSocial(cfg.brand)],
]) {
  writeFileSync(join(imagesDir, name), svg);
  console.log(`✓ ${name}`);
}
console.log(`\n2 file(s) → ${cfg.imagesDir || 'docs/images'}`);
