---
paths:
  - "js/engine.js"
---

# Engine rules (`js/engine.js`)

The engine is the race: it turns entrants, a seed and a duration into a finish order and the
positions to draw along the way. This file sets its boundary; its design (fixed timestep,
approximate duration, the tail of the field) is the engine session's job, from the definition's
"Engine session: starting questions".

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
