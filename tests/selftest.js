// Node checks, no dependencies: privacy rules for a public repo, code style, and (once the app
// exists) the security rules of index.html and js/, cache-busting, module imports, engine purity
// and the engine's own self-tests.
//   node tests/selftest.js
// Exit code 0 = everything passed, 1 = a test failed or the code broke a structural rule. A group
// whose files aren't there yet is reported as SKIP and doesn't count either way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokenize, freeNames } from './jstok.js';
import { checkStyle, listScripts } from './style-check.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

let failedCount = 0;
let ranCount = 0;

// Prints one PASS / FAIL line and counts it.
function report(pass, name, detail) {
  ranCount++;
  if (!pass) failedCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  |  ' + detail : ''}`);
}

// Prints one SKIP line for a check whose files don't exist yet; it isn't counted.
function skip(name, reason) {
  console.log(`SKIP  ${name}  |  ${reason}`);
}

// Every file under `folder` (relative to the root), recursively, leaving out `.git`.
function walk(folder) {
  if (!exists(folder)) return [];
  return fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.git') return [];
    const file = folder === '.' ? entry.name : `${folder}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : [file];
  });
}

/* ==== PRIVACY ==== */

// The repository is public: the published text files may not contain private network
// addresses or local drive paths (those belong in the gitignored CLAUDE.local.md). Gitignored,
// local-only files are left out.
{
  const LOCAL_ONLY = new RegExp(
    '^(?:CLAUDE\\.local\\.md|archive/|tests/UAT-|tests/uat/|\\.claude/settings\\.local\\.json)',
  );
  const published = walk('.')
    .filter(file => /\.(?:md|js|json|html|css)$/.test(file))
    .filter(file => !LOCAL_ONLY.test(file));
  const PRIVATE = new RegExp([
    /\b10(?:\.\d{1,3}){3}\b/.source,
    /\b192\.168(?:\.\d{1,3}){2}\b/.source,
    /\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/.source,
    /(?<!\w)[A-Za-z]:[\\/]{1,2}(?:Users|P1HUNT)\b/.source,
  ].join('|'), 'i');
  const leaks = [];
  for (const file of published) {
    read(file).split('\n').forEach((line, i) => {
      if (PRIVATE.test(line)) leaks.push(`${file}:${i + 1}`);
    });
  }
  report(!leaks.length, 'Privacy: no private network addresses or local paths in published files',
    leaks.length ? leaks.join(', ') : `${published.length} files clean`);
}

/* ==== CODE STYLE ==== */

// The rules of .claude/rules/code-style.md a tokenizer can check.
{
  const { problems, fileCount } = checkStyle(root);
  for (const [rule, found] of Object.entries(problems)) {
    const detail = found.length ? found.slice(0, 8).join(', ') : `${fileCount} files`;
    report(!found.length, `Code style: ${rule}`, detail);
  }
}

/* ==== INDEX.HTML ==== */

const version = exists('js/config.js')
  ? (read('js/config.js').match(/appVersion:\s*'([^']+)'/) || [])[1]
  : undefined;

// Cache-busting: every ?v= on index.html's asset links must equal CONFIG.appVersion, and every
// linked file must exist. Security: a strict Content Security Policy before any asset, nothing
// inline, nothing off-site, and the app loaded as one module entry script.
if (!exists('index.html')) {
  skip('index.html: cache-busting and security rules', 'no index.html yet');
} else {
  const markup = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const ASSET_LINK = /(?:href|src)="([^"]+\.(?:css|js|svg|png|ico))(?:\?v=([^"]*))?"/g;
  const links = [...markup.matchAll(ASSET_LINK)];
  const stale = links
    .filter(match => match[2] !== version)
    .map(match => `${match[1]}?v=${match[2] || '(none)'}`);
  const detail = stale.length
    ? `appVersion ${version}; mismatched: ${stale.join(', ')}`
    : `${links.length} links at ${version}`;
  report(version && links.length && !stale.length, 'Asset links carry ?v=<appVersion>', detail);
  const missing = links.map(match => match[1]).filter(file => !exists(file));
  report(!missing.length, 'Every linked asset file exists',
    missing.length ? `missing: ${missing.join(', ')}` : `${links.length} files`);

  const CSP_META = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
  const csp = (markup.match(CSP_META) || [])[1] || '';
  const firstAsset = Math.min(...['<link rel="stylesheet"', '<script']
    .map(tag => markup.indexOf(tag))
    .filter(index => index >= 0));
  const problems = [];
  if (!csp) {
    problems.push('no CSP meta tag');
  } else {
    if (markup.indexOf('Content-Security-Policy') > firstAsset) {
      problems.push('CSP comes after the first stylesheet/script');
    }
    if (/unsafe-|https?:|\*/.test(csp)) {
      problems.push('CSP allows unsafe-*, wildcards or other hosts');
    }
    const required = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "base-uri 'none'",
    ];
    for (const directive of required) {
      if (!csp.includes(directive)) problems.push(`CSP lacks ${directive}`);
    }
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(markup)) problems.push('inline <script>');
  if (/\sstyle="/.test(markup)) problems.push('style="" attribute');
  if (/\son[a-z]+="/i.test(markup)) problems.push('on…="" handler attribute');
  if (/(?:src|href)="(?:https?:)?\/\//.test(markup)) problems.push('off-site asset');
  const scriptTags = [...markup.matchAll(/<script\b[^>]*>/g)].map(match => match[0]);
  const isOneModuleEntry = scriptTags.length === 1
    && /type="module"/.test(scriptTags[0])
    && /src="js\/app\/main\.js\?v=/.test(scriptTags[0]);
  if (!isOneModuleEntry) {
    problems.push('not exactly one <script type="module" src="js/app/main.js?v=…">');
  }
  report(!problems.length,
    'Security: index.html has a strict CSP, nothing inline or off-site, one module entry',
    problems.length ? problems.join('; ') : csp.split(';').length + ' CSP directives');
}

/* ==== JS MODULES ==== */

const scripts = listScripts(root, 'js');

// Untrusted text (names, CSV files, links) must never become markup or code: no HTML-string
// sinks or eval anywhere in js/.
if (!scripts.length) {
  skip('Security: no HTML-string sinks or eval in js/', 'no js/ yet');
} else {
  const SINKS = new RegExp([
    /\.(?:inner|outer)HTML\s*=/.source,
    /insertAdjacentHTML/.source,
    /document\.write/.source,
    /\beval\s*\(/.source,
    /new Function\b/.source,
    /createElement\(\s*['"]script/.source,
    /setTimeout\(\s*['"`]/.source,
    /setInterval\(\s*['"`]/.source,
  ].join('|'));
  const hits = [];
  for (const file of scripts) {
    read(file).split('\n').forEach((line, i) => {
      if (SINKS.test(line.replace(/\/\/.*$/, ''))) hits.push(`${file}:${i + 1}`);
    });
  }
  report(!hits.length, 'Security: no HTML-string sinks or eval in js/ (build DOM with makeEl)',
    hits.length ? hits.join(', ') : `${scripts.length} files clean`);
}

// The static imports of a module's source: [{ specifier, bindings }].
function staticImports(source) {
  const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
  return [...source.matchAll(IMPORT)].map(match => {
    const clause = match[1] || '';
    const named = (clause.match(/\{([^}]*)\}/) || [])[1] || '';
    const bindings = named
      .split(',')
      .map(entry => entry.trim().split(/\s+as\s+/).pop())
      .filter(Boolean);
    const namespace = (clause.match(/\*\s+as\s+(\w+)/) || [])[1];
    const defaultName = (clause.match(/^(\w+)\s*(?:,|$)/) || [])[1];
    for (const extra of [namespace, defaultName]) {
      if (extra) bindings.push(extra);
    }
    return { specifier: match[2], bindings };
  });
}

// Module imports: every static import under js/ is relative, carries ?v=<appVersion> and
// resolves to a file that exists; a module uses no name it neither declares nor imports, apart
// from the browser globals listed here. Add to GLOBALS when the app uses a new browser API.
if (!scripts.length) {
  skip('App modules: imports and globals', 'no js/ yet');
} else {
  const GLOBALS = new Set((
    'Array ArrayBuffer Blob Date Error File Float64Array Infinity Int32Array JSON Map Math '
    + 'Number Object Promise Set String TextDecoder TextEncoder URL URLSearchParams Uint8Array '
    + 'Uint32Array clearInterval clearTimeout console document isFinite localStorage location '
    + 'matchMedia navigator parseFloat parseInt performance requestAnimationFrame '
    + 'cancelAnimationFrame setInterval setTimeout undefined window globalThis Boolean crypto '
    + 'ResizeObserver getComputedStyle'
  ).split(' '));
  const badImports = [];
  const unknown = [];
  for (const file of scripts) {
    const source = read(file);
    const imports = staticImports(source);
    for (const { specifier } of imports) {
      const [target, query] = specifier.split('?');
      const resolved = path.posix.join(path.posix.dirname(file), target);
      if (!/^\.\.?\//.test(target)) {
        badImports.push(`${file}: ${specifier} is not relative`);
      } else if (query !== `v=${version}`) {
        badImports.push(`${file}: ${specifier} lacks ?v=${version}`);
      } else if (!exists(resolved)) {
        badImports.push(`${file}: ${specifier} is missing`);
      }
    }
    const imported = new Set(imports.flatMap(entry => entry.bindings));
    for (const free of freeNames(tokenize(source))) {
      if (!GLOBALS.has(free) && !imported.has(free)) unknown.push(`${file}: ${free}`);
    }
  }
  report(!badImports.length, 'App modules: static imports are relative, versioned and resolve',
    badImports.length ? badImports.slice(0, 8).join('; ') : `${scripts.length} modules`);
  report(!unknown.length, 'App modules: no undeclared names (only known globals and imports)',
    unknown.length ? unknown.slice(0, 8).join(', ') : `${GLOBALS.size} globals allowed`);
}

/* ==== ENGINE ==== */

// The engine is pure and deterministic: no DOM, storage, clock, frame loop or Math.random (the
// words are counted, comments included), and it imports nothing but config.
if (!exists('js/engine.js')) {
  skip('Engine: pure and deterministic', 'no js/engine.js yet');
} else {
  const engine = read('js/engine.js');
  const FORBIDDEN = new RegExp(
    '\\b(?:window|document|localStorage|Math\\.random|Date|performance|requestAnimationFrame)\\b',
    'g',
  );
  const found = [...engine.matchAll(FORBIDDEN)].map(match => match[0]);
  report(!found.length, 'Engine: no window, document, storage, clock, frame loop or Math.random',
    found.length ? [...new Set(found)].join(', ') : 'clean');
  // The spec lets engines round these differently in the last bit, and one bit can change a
  // photo finish: the engine keeps to + - * /, floor, min, max, imul and shifts. Comments are
  // stripped first (the generator's name has two stars in it).
  const engineCode = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const ROUNDING_VARIES = new RegExp(
    '\\bMath\\.(?:sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log2|log10'
    + '|log1p|pow|cbrt|hypot)\\b|\\*\\*',
    'g',
  );
  const varying = [...engineCode.matchAll(ROUNDING_VARIES)].map(match => match[0]);
  report(!varying.length, 'Engine: no Math functions that engines may round differently',
    varying.length ? [...new Set(varying)].join(', ') : 'only exactly rounded arithmetic');
  const outside = staticImports(engine)
    .map(entry => entry.specifier.split('?')[0])
    .filter(target => target !== './config.js');
  report(!outside.length, 'Engine: imports only ./config.js',
    outside.length ? outside.join(', ') : 'ok');

  let engineModule = null;
  try {
    engineModule = await import(pathToFileURL(path.join(root, 'js/engine.js')).href);
  } catch (error) {
    report(false, 'Engine self-tests', `js/engine.js failed to load: ${error.message}`);
  }
  if (engineModule && typeof engineModule.selfTest !== 'function') {
    report(false, 'Engine self-tests', 'js/engine.js exports no selfTest()');
  } else if (engineModule) {
    for (const test of engineModule.selfTest().results) report(test.pass, test.name, test.detail);
  }
}

console.log(`\n${ranCount - failedCount}/${ranCount} passed`);
process.exit(failedCount ? 1 : 0);
