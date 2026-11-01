// SessionStart hook: prints where the project stands, so no one has to keep it by hand. The
// output is added to Claude's context: the branch, the last release tag, where the release
// branch points, appVersion, uncommitted files, and the CHANGELOG's Unreleased section.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A git command's output, trimmed, or '' if it fails (its stderr is dropped: "no tags yet" and
// "no release branch yet" are normal states, not errors).
function git(...args) {
  const options = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    return execFileSync('git', args, options).replace(/\s+$/, '');
  } catch (error) {
    return '';
  }
}

// A repository file's text, or '' if it doesn't exist.
function read(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch (error) {
    return '';
  }
}

// Where the release branch points: its tag if it sits on one, else its short hash.
function releasePosition() {
  const hash = git('rev-parse', '--short', 'origin/release');
  if (!hash) return 'not on the remote';
  const tag = git('tag', '--points-at', 'origin/release');
  return tag ? `${tag} (${hash})` : hash;
}

const version = (read('js/config.js').match(/appVersion:\s*'([^']+)'/) || [])[1]
  || 'none (no app code yet)';
// The CHANGELOG's Unreleased heading → [version] and its notes, up to the next version heading
// or the end of the file.
const UNRELEASED = /^## \[([^\]]+)\] - Unreleased\s*\n([\s\S]*?)(?=^## \[|(?![\s\S]))/m;
const unreleased = read('CHANGELOG.md').match(UNRELEASED);
const dirtyFiles = git('status', '--porcelain')
  .split('\n')
  .filter(Boolean)
  .map(line => line.slice(3));

const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '?';
const lastTag = git('describe', '--tags', '--abbrev=0') || 'none';
const shownFiles = dirtyFiles.slice(0, 6).join(', ') + (dirtyFiles.length > 6 ? ', …' : '');
const uncommitted = dirtyFiles.length ? `${dirtyFiles.length} (${shownFiles})` : 'none';
let changelog = '- CHANGELOG: no Unreleased section';
if (unreleased) {
  const notes = unreleased[2].trim();
  const body = notes ? '\n' + notes : 'nothing yet';
  changelog = `- CHANGELOG [${unreleased[1]}] - Unreleased: ${body}`;
}

console.log([
  'Project state (from git and CHANGELOG):',
  `- Branch: ${branch}; last release tag: ${lastTag}; release branch at: ${releasePosition()}`,
  `- appVersion: ${version}`,
  `- Uncommitted files: ${uncommitted}`,
  changelog,
].join('\n'));
