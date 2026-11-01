// Code-style checks for tests/selftest.js (no dependencies). They enforce the parts of
// .claude/rules/code-style.md a tokenizer can see: line length, name length, one statement per
// line and one declaration per const / let / var. The rest (whole-word names, comments, function
// length) is for review.
import fs from 'node:fs';
import path from 'node:path';
import { tokenize, declaredNames } from './jstok.js';

const MAX_LINE_LENGTH = 100;

// One- and two-letter names that are allowed everywhere: loop indices, coordinates, real words,
// a DOM element, and Node's fs and os modules.
const SHORT_NAMES_ALLOWED = new Set([
  'i', 'j', 'k', 'x', 'y', 'z', 'dx', 'dy', 'id', 'ok', 'el', 'fs', 'os',
]);

// A function that implements a published formula may use its symbols. The function's comment
// lists them in a line like "Formula names: m1 m2 k2 n3", and only those are allowed in that file.
const FORMULA_NAMES_PATTERN = /Formula names:\s*([\w ]+)/g;

// Every .js file under `folder` (relative to the root), recursively; none if it doesn't exist.
function listScripts(root, folder) {
  const absolute = path.join(root, folder);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return listScripts(root, file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

// Every file the rules cover, relative to the repository root. Folders that don't exist yet
// (the app, before the engine session) contribute nothing.
function styledFiles(root) {
  const scripts = ['js', 'tests', '.claude/hooks', '.claude/skills']
    .flatMap(folder => listScripts(root, folder));
  const other = ['css/app.css', 'index.html']
    .filter(file => fs.existsSync(path.join(root, file)));
  return { scripts, other };
}

// The 1-based line number of each character offset, as a lookup function.
function lineNumberAt(source) {
  const lineStarts = [0];
  for (let offset = 0; offset < source.length; offset++) {
    if (source[offset] === '\n') lineStarts.push(offset + 1);
  }
  return offset => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

// The one line allowed to be longer: index.html's Content Security Policy. Its content stays on
// one line so every browser parses it the same way (and tests/selftest.js reads it from there).
const LONG_LINE_EXCEPTIONS = [/<meta http-equiv="Content-Security-Policy"/];

// Lines over the limit, as "file:line (length)".
function longLines(file, source) {
  const found = [];
  source.split('\n').forEach((line, index) => {
    const isException = LONG_LINE_EXCEPTIONS.some(pattern => pattern.test(line));
    if (line.length <= MAX_LINE_LENGTH || isException) return;
    found.push(`${file}:${index + 1} (${line.length})`);
  });
  return found;
}

// Declared names of one or two letters outside the allowed list and the file's formula names.
function shortNames(file, source, tokens) {
  const allowed = new Set(SHORT_NAMES_ALLOWED);
  for (const match of source.matchAll(FORMULA_NAMES_PATTERN)) {
    match[1].split(/\s+/).filter(Boolean).forEach(name => allowed.add(name));
  }
  return [...declaredNames(tokens)]
    .filter(name => name.length <= 2 && !allowed.has(name))
    .map(name => `${file}: ${name}`);
}

// A `;` that ends a statement, followed on the same line by anything but a closing brace.
// Semicolons directly inside parentheses (a for-loop header) don't count.
function statementsSharingALine(file, tokens, lineOf) {
  const code = tokens.filter(token => token.type !== 'comment');
  const found = [];
  const openBrackets = [];
  code.forEach((token, index) => {
    if (token.type !== 'punct') return;
    if ('([{'.includes(token.value)) openBrackets.push(token.value);
    if (')]}'.includes(token.value)) openBrackets.pop();
    const isInsideParens = openBrackets[openBrackets.length - 1] === '(';
    if (token.value !== ';' || isInsideParens) return;
    const next = code[index + 1];
    const nextIsSameLine = next && lineOf(next.start) === lineOf(token.start);
    if (nextIsSameLine && next.value !== '}') found.push(`${file}:${lineOf(token.start)}`);
  });
  return found;
}

// `const a = 1, b = 2;`: a comma at the declaration's own bracket depth before its `;`.
// For-loop headers (`for (let i = 0, n = list.length; ...)`) are allowed.
function sharedDeclarations(file, tokens, lineOf) {
  const code = tokens.filter(token => token.type !== 'comment');
  const isPunct = (token, value) => token && token.type === 'punct' && token.value === value;
  const found = [];
  code.forEach((token, index) => {
    if (token.type !== 'id' || !['const', 'let', 'var'].includes(token.value)) return;
    const before = code[index - 2];
    const isInForHeader = isPunct(code[index - 1], '(') && before && before.value === 'for';
    if (isInForHeader) return;
    let depth = 0;
    for (let ahead = index + 1; ahead < code.length; ahead++) {
      const next = code[ahead];
      if (next.type !== 'punct') continue;
      if ('([{'.includes(next.value)) depth++;
      else if (')]}'.includes(next.value)) depth--;
      if (depth < 0 || (depth === 0 && next.value === ';')) break;
      if (depth === 0 && next.value === ',') {
        found.push(`${file}:${lineOf(token.start)}`);
        break;
      }
    }
  });
  return found;
}

// Runs every check; returns { name: [problem, …] } with one entry per rule, and the file count.
function checkStyle(root) {
  const files = styledFiles(root);
  const problems = {
    'lines of at most 100 characters': [],
    'no one- or two-letter names outside the allowed list': [],
    'one statement per line': [],
    'one declaration per const / let / var': [],
  };
  const [lineRule, nameRule, statementRule, declarationRule] = Object.keys(problems);
  for (const file of [...files.scripts, ...files.other]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    problems[lineRule].push(...longLines(file, source));
    if (!files.scripts.includes(file)) continue;
    const tokens = tokenize(source);
    const lineOf = lineNumberAt(source);
    problems[nameRule].push(...shortNames(file, source, tokens));
    problems[statementRule].push(...statementsSharingALine(file, tokens, lineOf));
    problems[declarationRule].push(...sharedDeclarations(file, tokens, lineOf));
  }
  return { problems, fileCount: files.scripts.length + files.other.length };
}

export { checkStyle, listScripts, MAX_LINE_LENGTH };
