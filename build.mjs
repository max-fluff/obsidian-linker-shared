import esbuild from 'esbuild';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Shared esbuild driver for the linker plugins. Each plugin's esbuild.config.mjs calls
// this with its own name/platform/external/prefix and (optionally) deploy targets read from
// a gitignored esbuild.local.mjs in the plugin root. Paths are relative to the plugin root,
// which is the cwd when "npm run build" runs.

const HERE = dirname(fileURLToPath(import.meta.url));

// Every release ships a main.js and a styles.css carrying its version, so each release's
// files have their own digest. GitHub attests a build per digest; two releases shipping
// byte-identical files share one digest and collect an attestation each, and Obsidian's
// review reads several attestations on one file as one it can't tie to the repository.
// The version comes from manifest.json, which is committed, so a fresh build reproduces
// the committed main.js exactly and the build workflow's sync check still holds.
const STAMP = /\s*\/\* [^*]+ \d+\.\d+\.\d+ \*\/\s*$/;

// styles.css is assembled the same way main.js is: the family's shared components first,
// then the plugin's own, so a plugin rule always wins a tie.
//
// `%p%` stands for the plugin's class prefix — the four do not share one, and class names
// are global. It is substituted in the plugin's own file too, so moving a rule between the
// two is a plain cut and paste.
function buildCss(name, version, kind, prefix) {
  const part = (p) => readFileSync(p, 'utf8').replace(STAMP, '').trimEnd().split('%p%').join(prefix);
  const shared = [join(HERE, 'styles/common.css'), join(HERE, `styles/${kind}.css`)].map(part).join('\n\n');
  const own = part('src/styles.css');
  const head = `/* ${name} ${version} — assembled from the shared styles and src/styles.css by "npm run build". Do not edit directly. */`;
  writeFileSync('styles.css', `${head}\n\n${shared}\n\n${own}\n\n/* ${name} ${version} */\n`);
}

export async function buildPlugin({ name, platform, external, kind, prefix, deployTargets = [] }) {
  const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const banner = `/* ${name} ${version} — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */`;
  buildCss(name, version, kind, prefix);

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
