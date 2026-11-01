# P1 Hunt Race: working notes for Claude

A free browser tool that picks a giveaway winner by running an F1-style race on screen. A breaker loads a list of entrants, the audience watches the cars race, and one entrant wins with the full finishing order recorded. Same entrants, duration and seed always give the same result, so a contested race is re-run on stream in seconds. It is promotion for P1Hunt. Public repo `rberrill/p1hunt_race` (GPL-3.0); Pages will serve https://rberrill.github.io/p1hunt_race/ once there is a release. The product definition (2026-11-01) and the eleven wireframes are kept locally in `archive/`; the decisions they settled are the list below.

- **Who uses it:** a breaker on a Whatnot stream, sharing a browser window from a **second device**: a computer running OBS, or a second phone in portrait. Never the streaming phone. The operator's screen is the audience's screen, so every phase has to look good on stream.
- **What they need, in order:** viewers can read and trust the entrant list; the race reads clearly on a phone-sized stream; the winner is unmistakable; re-running a contested race takes seconds.
- **Versions:** this is a fresh project. It starts at 0.1.0 and aims at a 1.0.0 public release; nothing from the v2 folder (`../p1hunt-race/`, reference only) was ever released.

## How we work

1. **Agree before building.** When Rich describes a feature or a batch of changes, reply with a proposal: what changes, how, open questions and gaps; its new UAT cases, the connected catalog cases it could affect, and whether a full UAT run is triggered (the `uat` skill). Don't edit code until he agrees the full set. Small, clear bug reports with steps can be fixed straight away (Claude's habit, not a rule Rich set).
2. **Write for the reviewer:** whole-word names, one statement per line, lines of 100 characters at most, a comment on every function. The detail is in `.claude/rules/code-style.md` (it loads with any code file).
3. **Build, then verify yourself** with the `verify` skill. Report measured results, not assumptions.
4. **UAT** (the `uat` skill): a catalog of every case, the release smoke test, and a script per version, all local. Rich runs the version script on the dev build (desktop on `localhost`, iPhone over the LAN), with a fresh dev number for every changed build. Section 7 is a real-use run: a race captured through OBS and through a second phone.
5. **Release only on Rich's go-ahead.** He runs `/release X.Y.Z`, which tags `main` and moves `release` (the live site) to the tag.
6. **Record as you go:** user-visible changes in `CHANGELOG.md` under `## [X.Y.0] - Unreleased`; decisions, and files changed in the background, in `../../decision-log.md` (dated, newest first, with the *why*); the "Waiting on" line in `CLAUDE.local.md`.

**Rich's preferences:** direct feedback, push back when something is wrong; simplicity over features; no messages a user can't act on; nothing covers the stage except a temporary flyout the breaker opened.

**Brand:** matte black, white, and P1Hunt red (`#e5322d`), retro motorsport, no gradients. Inspired by F1, never its trademarks: no F1, FIA, team or driver logos or marks in the app or the docs.

## Hard constraints (still binding)

- **Plain static files:** no build step, no packages, no frameworks, zero runtime dependencies, nothing loaded from another site. ES modules (`<script type="module">`, `import` / `export`) on relative paths, with `?v=<appVersion>` on every asset link and static import. Must work from `localhost` and from a Pages subfolder. (`file://` is not supported: Rich dropped that constraint for ES modules, 2026-11-01.) The `package.json` only tells Node the files are modules; it declares no dependencies (Claude's call).
- Everything stays in the browser: no backend, no uploads, no analytics.
- **Deterministic engine:** `js/engine.js` is pure. The result is a function of entrants, seed and duration only; it never reads the clock, the frame rate, `Math.random` or the DOM. The rules in `.claude/rules/engine.md` load when you touch it.
- **Touch first:** everything works by touch alone, with ≥ 44 px targets and safe-area padding. Keyboard shortcuts are extras.
- Every tunable lives in `CONFIG` (`js/config.js`), overridable from the URL (numbers and on/off only, within `CONFIG_LIMITS`).
- **Security:** never build HTML from strings; keep the strict CSP; untrusted input (links, CSV files, localStorage) goes through one sanitizer; `tests/selftest.js` enforces what it can. Before checking out an outside contributor's branch, read its diff to `.claude/` and `tests/`: the hooks run that code without asking.
- **Public repo:** nothing personal or machine-specific in committed files (addresses, local paths, names beyond Rich's). That goes in `CLAUDE.local.md`. Selftest checks for addresses and paths.
- Keep the internal names `storageKey: 'p1hunt.race.v1'` and `window.__race` (Claude's names); renaming them breaks saved sessions and the tests.

## Settled product decisions (don't relitigate without Rich)

All from the product definition, decided with Rich on 2026-11-01 unless marked otherwise.

- **Name:** P1 Hunt Race. "Duck Race" is retired. No Shopify embed; it lives on its own page.
- **Three full-screen phases in a loop:** Control → Race → Winner → Control, with the list and seed already confirmed. No sidebar-plus-stage layout.
- **Control** holds the entrant list, the seed and the duration on one page viewers can read; it doubles as the confirmation page after a race. One button, Start race, hands the viewport to the stage.
- **Entrants:** typed one per line, or imported from a CSV using the template the app offers for download. 2 to 100; breaks of 75 are routine and a big field reading as a pack is accepted.
- **CSV template:** `name` required, `spots` optional (blank = 1). Spots add up across lines: `Rich,3` and three lines of `Rich` both give Rich three entrants.
- **Duplicate names:** the entrant is the plain name; on display (car labels, grid, finish order) a repeated name gets `-1`, `-2`, `-3`. Usernames are often alphanumeric, so a suffix must never read as part of the name.
- **Seed:** the fairness story, kept from v2 (text field, New seed, Unlocked / Locked). The engine behind it is rebuilt.
- **Duration:** 10 to 120 s. It is part of the deterministic result, not only the animation length; the default is open until the engine design.
- **Race format:** a live simulated race, not a choreographed reveal. A vertical perspective road, cars seen from behind, turns at seed-and-duration-set intervals; cars brake into a turn and accelerate out; seeded speed checkpoints along each segment decide who gains and loses. Deterministic because the seed and checkpoints are fixed, not because the result is decided up front. Direction set; the engine session designs it from the definition's three starting questions (fixed timestep, approximate duration, the tail of the field).
- **Race controls** work like a social video player: an always-on bar at the bottom with Pause/Play and Reset; a tap on the stage dims it and shows the same options large. A live order panel keeps the leader legible on a phone-sized stream.
- **Winner:** its own screen: the winner large, the full finishing order, CSV and JSON export, the race record (kept in localStorage). Re-run keeps entrants, duration and seed and plays the identical race; Start over returns to Control with the list kept and a fresh seed.
- **Branding on the stage:** P1Hunt only. No breaker name or logo field; a branded version is a paid custom later.
- **Session restore** follows the Finisher: every change to the list and setup is saved to localStorage as it is made; on reload the app asks Resume / Start over, never restores silently.
- **Breakpoints:** phone up to 760 px (`max-width: 760px`, the Finisher's line), mid 761 to 1100, desktop above 1100. Control stacks on the phone and puts entrants beside a setup column above it; Race and Winner use the full viewport at every width.
- **Accessibility:** an ARIA live region and a `prefers-reduced-motion` race mode that produces the same result (kept from v2; the mode is designed with the new format).
- **Versioning:** SemVer by user-visible change, from 0.1.0 toward 1.0.0. Process and tooling changes don't bump the major.

## Map

| Where | What |
|---|---|
| `index.html`, `css/`, `js/` | The app (not started; the engine session comes first). Rules for each load from `.claude/rules/` when you open the files |
| `tests/README.md` | How to run the tests and what each guards |
| `.claude/skills/` | `verify` (end-to-end checks), `uat` (Rich's acceptance script), `release` (Rich-triggered) |
| `.claude/hooks/` | SessionStart: project state. Stop: runs selftest when app code changed |
| `CHANGELOG.md`, `README.md`, `SECURITY.md` | Public docs (see `.claude/rules/public-docs.md`) |
| `tests/uat/` (catalog, smoke), `tests/UAT-X.Y.md`, `archive/`, `CLAUDE.local.md` | Local only (gitignored) |

**Branches:**
- `main` holds all work. Commit and push it as you go; that never changes the live site.
- `release` is what Pages serves. Never commit to it. Only the `release` skill moves it, and only to a release tag (rollback moves it back one tag). It was created at the scaffold commit so Pages could be set up before the first release.
- `fix/<name>`, from the live tag, is only for a hotfix while `main` has unreleased work.
- Releases are annotated tags on `main` (`vX.Y.Z`). Moving `release` needs Rich's go-ahead.
- Commits end with the `Co-Authored-By` trailer.

## Keeping this current

Claude maintains these files without being asked. Each kind of fact has one home:

| Kind of fact | Home |
|---|---|
| True in every session | this file |
| True for one area of the code | that area's `.claude/rules/` file |
| A multi-step procedure | a skill |
| This machine, or personal | `CLAUDE.local.md` |
| What changed, for users | `CHANGELOG.md` |
| Why we decided it | `../../decision-log.md` |
| How a release was verified | the release's annotated tag message (`git show vX.Y.Z`) |
| What's current (version, unreleased, blocked and on whom) | Not this file. The SessionStart hook shows the branch, last release, version, where `release` points and the CHANGELOG's unreleased entries; what's blocked is under **Waiting on** in `CLAUDE.local.md` |

- When Rich settles a product decision, add one line under "Settled product decisions" and log the detail in the decision-log.
- **A rule needs a source.** A line in this file, a rule file or a skill that constrains the product or the process needs a decision of Rich's behind it (a decision-log entry). Claude's own build calls, habits and heuristics are marked as Claude's, so no later session takes them for his (Rich, 2026-10-31, on the Finisher).
- When something trips us up, fix the cause if you can. Otherwise add one line to the nearest rule, skill or `CLAUDE.local.md`.
- Don't record test counts or per-version history in docs; they drift. Prune stale lines instead of appending. Keep this file short (Claude's target: about 120 lines).
- Mention any change to these files in the closing message.
