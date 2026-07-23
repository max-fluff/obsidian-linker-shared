// Bump manifest + versions, rebuild, commit and tag. Run from a plugin root (bump.bat / npm run bump).
// Arg: patch (default) | minor | major | an explicit x.y.z. Local only; push and release stay manual.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim();
const die = (msg) => { console.error('\n  ✗ ' + msg + '\n'); process.exit(1); };

if (run('git status --porcelain')) die('Working tree is not clean. Commit or stash first.');

const manifestPath = join(root, 'manifest.json');
const versionsPath = join(root, 'versions.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const [maj, min, pat] = manifest.version.split('.').map(Number);

const arg = (process.argv[2] || 'patch').trim();
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'major') next = `${maj + 1}.0.0`;
else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
else die(`Unknown argument "${arg}". Use patch, minor, major, or an explicit x.y.z.`);

if (run('git tag -l ' + next)) die(`Tag ${next} already exists.`);
console.log(`\n  ${manifest.version} → ${next}\n`);

console.log('  running tests…');
try { execSync('npm test', { cwd: root, stdio: 'pipe' }); }
catch { die('Tests failed — not bumping.'); }

manifest.version = next;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
versions[next] = manifest.minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');

console.log('  rebuilding…');
execSync('npm run build', { cwd: root, stdio: 'pipe' });

const artifacts = ['manifest.json', 'versions.json', 'main.js']
  .concat(existsSync(join(root, 'styles.css')) ? ['styles.css'] : []);
run('git add ' + artifacts.join(' '));
run(`git commit -m "Bump version to ${next}"`);
run('git tag ' + next);

console.log(`\n  ✓ committed and tagged ${next}\n`);
console.log('  Next, once you have reviewed the diff:');
console.log(`    git push origin main && git push origin ${next}`);
console.log(`    gh release create ${next} --draft --title "${next}" --notes-file <notes.md> main.js manifest.json styles.css\n`);
