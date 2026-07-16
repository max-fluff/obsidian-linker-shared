#!/usr/bin/env node
// Generate Obsidian-store screenshot plates from a per-plugin config, using headless
// Chromium (Chrome or Edge) to rasterize the shared plate template. No npm deps.
//
//   node src/shared/branding/make-plates.mjs [config.mjs]
//
// The config path defaults to docs/branding.config.mjs, resolved from the current working
// directory (the plugin root). Set PLATES_BROWSER to a Chromium binary to override
// auto-detection. See BRANDING.md for the config shape.

import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join, resolve, basename } from 'path';
import { pathToFileURL } from 'url';
import { renderPlate } from './plate-template.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cwd = process.cwd();
const configArg = process.argv[2] || 'docs/branding.config.mjs';
const configPath = resolve(cwd, configArg);

if (!existsSync(configPath)) {
  console.error(`config not found: ${configArg}\n(run from the plugin root, or pass a path)`);
  process.exit(1);
}

const { default: cfg } = await import(pathToFileURL(configPath).href);
const imagesDir = resolve(cwd, cfg.imagesDir || 'docs/images');
const outDir = resolve(cwd, cfg.outDir || 'docs/images/store');
mkdirSync(outDir, { recursive: true });

const browser = findBrowser();
if (!browser) {
  console.error('no Chromium found. Install Chrome or Edge, or set PLATES_BROWSER=/path/to/chrome');
  process.exit(1);
}

let made = 0;
for (const plate of cfg.plates) {
  const srcPath = join(imagesDir, plate.src);
  if (!existsSync(srcPath)) {
    console.warn(`skip ${plate.src} — not found in ${cfg.imagesDir || 'docs/images'}`);
    continue;
  }
  const dataUri = `data:image/png;base64,${readFileSync(srcPath).toString('base64')}`;
  const html = renderPlate(cfg.brand, plate, dataUri);
  const htmlPath = join(outDir, `.plate-${basename(plate.src, '.png')}.html`);
  const outPath = join(outDir, plate.src);
  writeFileSync(htmlPath, html);
  try {
    await shoot(browser, htmlPath, outPath);
    console.log(`✓ ${plate.src}`);
    made++;
  } catch (e) {
    console.error(`✗ ${plate.src} — ${e.message}`);
  } finally {
    rmSync(htmlPath, { force: true });
  }
}
console.log(`\n${made} plate(s) → ${cfg.outDir || 'docs/images/store'}`);

// Headless Chrome/Edge on Windows can hand the render to a background process and return
// before the PNG is written — so we don't trust the exit, we delete any stale output up
// front and poll for a freshly written, size-stable file before cleaning up the HTML.
async function shoot(bin, htmlPath, outPath) {
  rmSync(outPath, { force: true });
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=1', '--window-size=1200,800',
    '--default-background-color=00000000',
    `--screenshot=${outPath}`, pathToFileURL(htmlPath).href,
  ];
  spawn(bin, args, { stdio: 'ignore', detached: false }).on('error', () => {});
  let lastSize = -1;
  for (let waited = 0; waited < 30000; waited += 250) {
    await sleep(250);
    if (!existsSync(outPath)) continue;
    const size = statSync(outPath).size;
    if (size > 0 && size === lastSize) return; // written and stable
    lastSize = size;
  }
  throw new Error('timed out waiting for screenshot');
}

function findBrowser() {
  if (process.env.PLATES_BROWSER) return process.env.PLATES_BROWSER;
  const p = process.platform;
  const candidates = p === 'win32' ? [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ] : p === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ];
  return candidates.find((c) => c && existsSync(c)) || null;
}
