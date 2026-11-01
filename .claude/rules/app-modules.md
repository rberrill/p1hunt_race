---
paths:
  - "js/app/**/*.js"
  - "js/config.js"
---

# App module rules (`js/app/`, `js/config.js`)

`tests/selftest.js` enforces the first four.

- ES modules on relative specifiers with `?v=<appVersion>` on every static import. A name
  from another module is imported by name, never read from a global.
- **Never build HTML from strings:** no `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
  `document.write` / `eval` / `new Function` / string timers. Build with `makeEl(tag,
  attributes, ...children)`; set text with `textContent`. Setting `el.style.x` is fine.
- Only globals in the `GLOBALS` list in `tests/selftest.js`. When you use a new browser API,
  add it there.
- `js/app/main.js` is the entry: it imports the modules, wires events and calls `init()` last.
- Shared state lives in one `app` state object exported by the core module, never in a
  top-level `let` shared across modules.
- Untrusted input (links, CSV files, localStorage) goes through the engine's sanitizers.
- Keep `window.__race` (the test hook) and `CONFIG.storageKey` unchanged.
- Touch first: every feature works by touch alone, with ≥ 44 px targets. Keyboard shortcuts
  are extras.
- Drawing is driven by `requestAnimationFrame`, but the engine's race time advances only in its
  own fixed steps; a frame never passes its delta into the physics (see `engine.md`). A hidden
  tab (`visibilitychange`) pauses race time; on return the race resumes from the same tick and
  never runs the missed ticks (Rich, 2026-11-01).

## Where things are

- `js/config.js`: `CONFIG` (every tunable, `appVersion`, `storageKey`) and `CONFIG_LIMITS` (the
  link-overridable keys with their ranges). The shell's tunables (`startCountdownSec`,
  `finishHoldMs`, `revealSec`, `maxFrameGapMs`, the camera's units,
  `labelMinWidthPx`, `reducedMotion`, `saveDebounceMs`) sit after the engine's.
- `js/app/main.js`: the entry. Link settings through `sanitizeOverrides`; the saved session and
  the Resume card; the phase loop (Start race → the race → the record saved → the Winner screen →
  Re-run or Start over); `?selftest=1`; `window.__race`.
- `js/app/core.js`: the `app` state object, `byId` / `makeEl` / `setText`, `showPhase`, the card
  over the page (`showCard` / `hideCard`; the phases are made `inert` while it shows), the ARIA
  live region, `files.download`, time and date formatting, the Tuned link chips.
- `js/app/session.js`: localStorage under `CONFIG.storageKey`, read through
  `sanitizeStoredSession`; the debounced save, `clearStoredSession`, the Resume / Start over card.
- `js/app/control.js`: the Control phase. The textarea is the list's source of truth; the tabs;
  CSV import (`parseCsv` → `expandEntrants`, one line per entrant); the starting grid (phone: six,
  then Show all); the Clear confirmation card; the seed (New, Locked / Unlocked); the duration
  slider; the Start race gate and its message.
- `js/app/race.js`: the Race phase. The race clock (playing time only; `clockToTicks` owes the
  engine its ticks), the frame loop, the countdown, Pause / Play / Reset, the tap-to-pause
  overlay (the bar's Pause or a tap on the stage pauses and shows Play, Reset race, Start over; `leaveRace` drops the
  race and `main.js` returns to Control with the seed kept), the hidden-tab pause, the HUD and the timing tower over the stage (`fitTower` trims it to what
  fits, `towerMaxRows` at most, then "+ n more"; three major rows then half-width minor ones; refreshed
  every `towerRefreshMs` with a green or red flash on a place gained or lost; the gap is distance
  divided by the trailing car's speed), the finish hold, the reduced-motion reveal. Exports `runToEnd` and `frameAt` for the
  test hook. `startRace` resets the play state first: a race left mid-run (the test hook can do
  it) would otherwise leave `isPlaying` set and the new race would never get a frame.
- `js/app/stage.js`: the canvas. The perspective road from `trackLayout`, the camera (follows the
  leader, parks at the finish), cars drawn from primitives in a palette by index, labels on cars
  drawn wide enough and always on the top three (lifted apart when they would overlap), the finish band, the start lights, `drawStill` for reduced motion.
- `js/app/winner.js`: the Winner phase. The hero sized to the name, the finish order (phone:
  eight, then Show all), CSV / JSON export named `p1hunt-race-<seed>-<yyyymmdd-hhmm>`, Copy result
  only where the clipboard exists, Re-run and Start over.
