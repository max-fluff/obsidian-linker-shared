import esbuild from 'esbuild';
import { existsSync, copyFileSync } from 'fs';

// Shared esbuild driver for the linker plugins. Each plugin's esbuild.config.mjs calls
// this with its own name/platform/external and (optionally) deploy targets read from a
// gitignored esbuild.local.mjs in the plugin root. Paths are relative to the plugin root,
// which is the cwd when "npm run build" runs.
export async function buildPlugin({ name, platform, external, deployTargets = [] }) {
  const banner = `/* ${name} — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */`;

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
