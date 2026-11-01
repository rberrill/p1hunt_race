// Sets CONFIG.appVersion in js/config.js, every ?v= asset link in index.html and every ?v= on a
// static import under js/ to one version.
//   node .claude/skills/release/set-version.js 0.1.0        (or 0.2.0-dev, 0.2.0-dev.2)
// A dev build's number goes up whenever a changed build goes to the phone, so every ?v= changes
// and the browser can't mix cached modules with new ones.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-dev(\.\d+)?)?$/.test(version || '')) {
  console.error('Usage: set-version.js X.Y.Z, X.Y.Z-dev or X.Y.Z-dev.N');
  process.exit(1);
}

// Replaces every match of `pattern` in a repository file. Returns the number of changes; a file
// with no match counts as zero (and says so unless `isOptional`: a module without imports is
// normal) so the caller can decide whether that's an error.
function replaceIn(file, pattern, replacement, isOptional = false) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    console.log(`${file}: not there`);
    return 0;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const count = (source.match(pattern) || []).length;
  if (!count) {
    if (!isOptional) console.log(`${file}: nothing to change`);
    return 0;
  }
  fs.writeFileSync(filePath, source.replace(pattern, replacement));
  console.log(`${file}: ${count} change${count > 1 ? 's' : ''}`);
  return count;
}

// Every .js file under `folder`, relative to the root, recursively.
function scripts(folder) {
  const absolute = path.join(root, folder);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return scripts(file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

const ASSET_LINK = /((?:href|src)="[^"]+\.(?:css|js|svg|png|ico))\?v=[^"]*"/g;
const STATIC_IMPORT = /((?:import|export)\s[^'"]*['"]\.{1,2}\/[^'"?]+\.js)\?v=[^'"]*(['"])/g;

let total = 0;
total += replaceIn('js/config.js', /(appVersion:\s*')[^']+(')/g, `$1${version}$2`);
total += replaceIn('index.html', ASSET_LINK, `$1?v=${version}"`);
for (const file of scripts('js')) {
  total += replaceIn(file, STATIC_IMPORT, `$1?v=${version}$2`, true);
}
if (!total) {
  console.error('No version to set: js/config.js and index.html are not there yet.');
  process.exit(1);
}
console.log(`Version ${version}. Run node tests/selftest.js to confirm.`);
