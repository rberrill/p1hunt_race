---
paths:
  - "js/engine.js"
---

# Engine rules (`js/engine.js`)

The engine is the race: it turns entrants, a seed and a duration into a finish order and the
positions to draw along the way. This file sets its boundary and records the design decided
with Rich on 2026-11-01 (the detail is in `archive/P1 Hunt Race — Engine Proposal.md` and the
decision log).

- **Pure and deterministic** (from the definition: same entrants, duration and seed always
  give the same result, so a race can be re-run on stream). The engine is pure functions over
  plain objects and typed arrays. It never reads `window`, `document`, `localStorage`,
  `Math.random`, `Date`, `performance` or `requestAnimationFrame`, not even in comments, because
  `tests/selftest.js` counts the words. All randomness comes from a seeded generator the engine
  owns, and all time is race time passed in by the caller.
- **Frame rate never reaches the physics.** The shell decides how often to draw; the engine
  advances in its own steps of race time. OBS at 30 fps and a phone at 120 must produce the
  identical finish, and so must the reduced-motion mode.
- **Imports:** only `./config.js`. Nothing from `js/app/`.
- The engine owns all race maths the shell needs (positions, order, finish, display names with
  their `-1`, `-2` suffixes, CSV parsing and the spots rule). The shell calls them; it doesn't
  re-derive them.
- Untrusted input (links, CSV text, localStorage) goes through the engine's sanitizers. **A new
  state field needs a rule there**, or it is reset on load.
- New behavior gets a self-test in `selfTest()`. It runs in Node (`tests/selftest.js`) and in
  the app (`?selftest=1`). Add a one-line row for it under "Engine self-tests" in
  `tests/README.md` if it opens a new area.
- Every tunable lives in `CONFIG` (`js/config.js`), never as a literal here.
- **Only exactly rounded arithmetic:** `+ - * /`, `Math.floor`, `min`, `max`, `abs`, `imul` and
  shifts. Never `Math.sin`, `exp`, `log`, `pow` or `**` (selftest checks): the spec lets engines
  round those differently, and one bit can change a photo finish. Curves are piecewise linear;
  anything measured (the nominal car's time) is measured by simulating, not by a formula.

## The design (decided 2026-11-01)

- **Race time:** `CONFIG.ticksPerSecond` (60) ticks per second. `advanceTick(race)` is one tick,
  in place; the shell calls it once per elapsed tick, however many a frame covers. Pause is
  not ticking; Reset is `createRace` again. `runToFinish` is the reduced-motion mode's and the
  tests' way to the end.
- **Randomness:** xoshiro128** seeded from FNV-1a of `seedText + ':' + purpose` through the
  MurmurHash3 finalizer; one stream per purpose (`track`, `lanes`, `car:<index>`), so a change
  to one part's draws never shifts another's. Cars are keyed by list index, not name. The
  seed's case is folded (`seedKey`); the text is kept as typed for display.
- **The fingerprint:** `REFERENCE_FINGERPRINT` is the hash of the reference race's finish,
  measured in Node. Any change to the race's arithmetic or tunables moves it: update the
  constant in the same change, and treat the change as user-visible (a version bump), since
  old seeds now give other races.
- **Track (Rich):** 2 to 3 turns per 10 s of duration; 1 to 3 long straights among short
  ones (never more than half, Claude's call); each turn a seeded direction and apex speed with
  fixed braking and exit zones. The straights scale so the nominal car (every factor 1.0)
  crosses at the duration to within a tick; the finish line is where that car is at the last
  tick.
- **Cars (Rich):** the same base pace for every car, always (`BASE_PACE`, not a tunable); a
  standing start on one line, no grid rows (the stage may draw depth, the engine gives no head
  start); per car a launch factor, checkpoints along each straight and a corner
  factor per turn, each a spread around 1.0 from `CONFIG`. Speed moves toward target × factor
  by at most the acceleration or braking rate per tick.
- **Finish (Rich):** every car crosses; the crossing time is the tick plus a linear sub-tick
  fraction; a dead heat goes to the car's seeded tiebreak, then list order. `maxRaceSec` is
  only a guard. Times are kept to the millisecond.
- **Hot loop:** `moveCars` allocates nothing; the state is typed arrays; `raceSnapshot` refills
  one object per race. Measured: about 4 µs per tick with 100 cars in Node.
- **Overrides:** `sanitizeOverrides` applies only `CONFIG_LIMITS` keys, numbers within range;
  the applied set is carried in the race record and both exports.
