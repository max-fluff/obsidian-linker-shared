import esbuild from 'esbuild';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';

// Shared esbuild driver for the linker plugins. Each plugin's esbuild.config.mjs calls
// this with its own name/platform/external and (optionally) deploy targets read from a
// gitignored esbuild.local.mjs in the plugin root. Paths are relative to the plugin root,
// which is the cwd when "npm run build" runs.

// Every release ships a main.js and a styles.css carrying its version, so each release's
// files have their own digest. GitHub attests a build per digest; two releases shipping
// byte-identical files share one digest and collect an attestation each, and Obsidian's
// review reads several attestations on one file as one it can't tie to the repository.
// The version comes from manifest.json, which is committed, so a fresh build reproduces
// the committed main.js exactly and the build workflow's sync check still holds.
const STAMP = /\s*\/\* [^*]+ \d+\.\d+\.\d+ \*\/\s*$/;

function stampCss(name, version) {
  const css = readFileSync('styles.css', 'utf8').replace(STAMP, '');
  writeFileSync('styles.css', `${css.trimEnd()}\n\n/* ${name} ${version} */\n`);
}

export async function buildPlugin({ name, platform, external, deployTargets = [] }) {
  const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const banner = `/* ${name} ${version} — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */`;
  stampCss(name, version);

  await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'cjs',
    platform,
    target: 'es2018',
    outfile: 'main.js',
    banner: { js: banner },
    external,
    logLevel: 'info',
  }).catch((e) => { console.error(e); process.exit(1); });

  for (const dir of deployTargets) {
    if (!existsSync(dir)) continue;
    for (const f of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(f, `${dir}/${f}`);
    console.log(`Deployed to ${dir}`);
  }
}
