# Tests

One automated layer today. Run it before treating any change as done. A failure is a regression unless the change deliberately moved that behavior; then update the test in the same change. Pass counts come from the test output; they aren't recorded here.

## `node tests/selftest.js` (Node, no dependencies, under a second)

Exit code 0 means everything passed. A group whose files don't exist yet (the app, before the engine is built) prints `SKIP` and isn't counted.

| Group | What it guards |
|---|---|
| Privacy | No private network addresses or local drive paths in the published text files (the gitignored local files are left out) |
| Code style | The parts of `.claude/rules/code-style.md` a tokenizer can check (`tests/style-check.js`): lines of at most 100 characters, no one- or two-letter names outside the allowed list, one statement per line, one declaration per `const` / `let` / `var`. Covers `js/`, `tests/`, the hooks and the skills' scripts |
| Cache-busting | Every `?v=` asset link in `index.html` equals `CONFIG.appVersion`, and every linked file exists |
| Security | No HTML-string sinks, `eval`, `new Function` or string timers in `js/`; `index.html` has a strict CSP before any asset, nothing inline or off-site, and one module entry script |
| Module imports | Every static import under `js/` is relative, carries `?v=<appVersion>` and resolves to a file; a module uses only names it declares, imports or that are in the `GLOBALS` list (extended when the app uses a new browser API) |
| Engine purity | `js/engine.js` never mentions the DOM, storage, the clock, the frame loop or `Math.random`, and imports only `js/config.js` |
| Engine self-tests | `selfTest()` from `js/engine.js` (to be written with the engine: determinism, CSV parsing and the spots rule, display-name suffixes, untrusted-input checks) |

The engine self-tests also run in the app with `?selftest=1`.

## Manual checks

The `verify` skill in `.claude/skills/verify/` lists the browser checks (layout at three sizes, determinism under different frame rates, the subfolder run), and Rich's acceptance script is kept locally (see the `uat` skill).

## Bugs that became tests

| Bug | Guard |
|---|---|
| (none yet) | |
