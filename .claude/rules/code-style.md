---
paths:
  - "js/**/*.js"
  - "tests/**/*.js"
  - ".claude/**/*.js"
  - "css/**/*.css"
  - "index.html"
---

# Code style: write for the reviewer

Adopted from the Card Finisher (Rich's 1.7 rewrite there; the same rules here, 2026-11-01). The
test for every line is whether someone new to the codebase could review it without first
decoding it. Short code that needs decoding fails that test. These rules apply to new code and to
any code you touch.

`node tests/selftest.js` enforces the parts a tokenizer can see (`tests/style-check.js`): line
length, short names, one statement per line and one declaration per `const` / `let` / `var`. The
rest is for review.

## Names

- **Say what it is.** `entrants`, `seed`, `durationSec`, `segment`, `checkpoint`, `finishOrder`,
  `state`, `options`. Never `e`, `sd`, `seg`, `cp`, `fo`, `st`, `opts`.
- **One or two letters are allowed only for:**
  - `i`, `j`, `k`: integer loop indices, in loops short enough to see whole;
  - `x`, `y`, `z`, `dx`, `dy`: a coordinate and its delta;
  - `id`, `ok`: real words;
  - `el` (a DOM element, as in the abbreviations below);
  - `fs` and `os` (Node's modules, in tests and hooks).
  Width and height are `width` and `height` (or `roadWidth`, `stageHeight`), never `w` / `h`.
- **Abbreviations:** only the ones listed here. Spell out everything else.
  `ctx` (a canvas 2D context), `el` (a DOM element), `src` / `dst` (the two ends of a copy or
  transform), `rect` (rectangle), `rgb`, `max` / `min`.
- **Units go in the name** when a number could be in more than one: `durationSec`, `elapsedMs`,
  `tickMs`, `speedPxPerSec`, `distanceFrac` (0–1), `insetPct` (0–100).
- **Coordinate frames** are spelled out: `track` (distance along the road, in race units),
  `screen` (pixels on the stage). A point or size says its frame when it isn't obvious:
  `positionTrack`, `carWidthPx`. A function that maps between them is named for what it maps:
  `trackToScreen`.
- **Race time, not wall time.** Anything in simulated race time says so (`raceTimeMs`, `tick`);
  anything from the clock or the frame loop says so (`frameTimeMs`). They never mix in one name.
- **Booleans** read as yes/no questions: `isFinished`, `hasDuplicates`, `canCopy`.
- **Functions** are verbs (`advanceTick`, `drawRoad`), except pure getters named for what they
  return (`finishOrder`, `displayName`).
- **Formula notation (engine only).** Where a function implements a published formula or a
  named PRNG, its doc comment writes the formula, and the local names match its symbols; those
  short names are allowed **inside that function only**. The comment lists them on a line
  starting `Formula names:`, which is what the style check reads. Everywhere else, spell it out.

## Case

| Kind | Case | Examples |
|---|---|---|
| Variables, functions, object keys | camelCase | `finishOrder`, `drawStage` |
| Classes, objects of methods | PascalCase | `Session`, `Random` |
| Module-level constant tables, defaults, limits | UPPER_SNAKE | `RACE_DEFAULTS`, `BLOCKED_KEYS` |
| CSS classes and custom properties | kebab-case | `.live-order`, `--panel-bg` |
| HTML ids (JS handles) | camelCase | `entrantList`, `btnStart` |

In HTML and CSS, `btn` is allowed as the button class and id prefix (`.btn`, `btnStart`).

Acronyms are one word in camelCase: `parseCsv`, `toJson`, not `parseCSV`.

## Layout

- **Lines are at most 100 characters**, comments included. The one exception is the Content
  Security Policy `<meta>` in `index.html`, which stays on one line.
- **One statement per line.** No `if (a) x(); if (b) y();` on one line, no `a = 1; b = 2;`.
  A guard clause that fits (`if (!entrants.length) return null;`) stays on one line.
- **One declaration per `const` / `let`.** A destructure is one declaration.
- **Braces** on any `if` / `for` / `while` whose body doesn't fit on the same line.
- **When something doesn't fit, break it one item per line**, closing bracket on its own line:
  objects (one property per line, trailing comma), calls (one argument per line), and
  conditions (one `&&` / `||` operand per line, the operator leading).
- **No nested ternaries.** Use `clamp()`, a small named function, or `if` / `else`.
- **Functions fit on a screen** (about 50 lines). Longer ones split into named steps; the
  outer function then reads as the list of steps.
- **No magic numbers.** A tunable goes in `CONFIG`; a fixed constant gets a named
  `UPPER_SNAKE` const with a comment saying where it comes from.

## Modules

- ES modules: `import` / `export` only, relative specifiers (`./`, `../`) with
  `?v=<appVersion>` on every static import (`set-version.js` updates them with the version).
  No bare specifiers, no dynamic `import()` of a computed path, no globals shared between modules.
- Export named bindings, not a default, so a reader can grep for where a name comes from.
- Node scripts (tests, hooks, skills) are ES modules too (`package.json` sets `"type": "module"`)
  and import `node:fs`, `node:path`, `node:child_process` by their `node:` names.

## Comments

- **Every function has a comment** above it: what it does, what goes in and comes out, and the
  units and frame of any numbers. Exported engine functions use `/** … */` with the signature.
- **Comment why, not what.** The code says what; the comment says why it's done this way,
  what it guards against, or where the formula comes from.
- Section banners (`/* ==== SIMULATION ==== */`) stay, one per section, listed in the file header.

## Hot loops

The simulation and the stage draw run every tick and every frame with up to 100 cars. Keep those
loops flat: no closures or array allocation per car per tick. Long names cost nothing at run
time. Measure any change to these loops before and after, in separate Node processes, comparing
medians of several runs; timing in one process or in the browser is too noisy to trust.

## Names you must not change

These are read from outside the code, so renaming them breaks saved data, links, files in the
wild or tests:

- `CONFIG` keys (links in the wild set them) and `CONFIG_LIMITS` keys;
- the CSV template's columns `name` and `spots` (Rich's decision, 2026-11-01), and the columns
  of the CSV and JSON exports once a version with them is released;
- `storageKey` and the fields of what localStorage holds (the saved list, setup and race record);
- `window.__race` (the test hook) and its members.

Inside the code, a local name can differ from the stored key.
