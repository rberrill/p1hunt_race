---
paths:
  - "css/**/*.css"
---

# CSS rules (`css/app.css`)

- **Two breakpoints, three layouts** (Rich, 2026-11-01): phone is `@media (max-width: 760px)`
  (the Finisher's line); mid is 761 to 1100; desktop is `@media (min-width: 1101px)`. Phone rules
  live in the phone block at the end of the file, and phone-only behaviors stay inside it (a
  scroller rule outside the phone block once hid half the Finisher's Crop presets on desktop).
- **Three full-screen phases.** Control, Race and Winner each own the viewport; only one is
  shown at a time. On the phone Control stacks (entrants, then seed and duration, then Start
  race in a sticky, safe-area-padded action bar); mid and desktop put entrants beside a setup
  column. Race and Winner use the full viewport at every width.
- **The stage is the picture the stream captures.** Nothing covers it except the always-on
  button bar at the bottom and the tap-to-pause overlay (the dimmed, paused stage with the
  controls large), which clears on a button or a tap outside. No gradients.
- **Operator view = audience view.** There is no separate broadcast layout; every phase is
  designed to be read on stream, Control included (viewers confirm the list before the race).
- Tap targets are ≥ 44 px; respect the safe-area padding (`viewport-fit=cover`).
- **Every text control (`textarea`, `input[type="text"]`) is 16 px or more.** iOS Safari zooms
  the page in to focus a smaller one and never zooms back out, so every phase then hangs past
  the screen's edges (found on the phone at 15 px, 2026-11-01).
- `prefers-reduced-motion` gets a race mode of its own (to be designed with the engine); the
  result must be identical to the animated run.
- After any layout change, check 390×844, 375×667 and 1280×800 (the `verify` skill): the same
  three sizes as the Finisher (Rich, 2026-11-01). The mid layout has no size of its own; it is
  checked by resizing across 760 and 1100.
