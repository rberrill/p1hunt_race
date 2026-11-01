# Changelog

All notable changes to P1 Hunt Race are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions run from 0.1.0 toward 1.0.0, the first public release. The version is logged to the browser console.

## [0.1.0] - Unreleased

A fresh build. The earlier race prototype was never released; nothing here comes from it.

### Added
- The project scaffold: working notes, rules, the verify / UAT / release workflows, hooks and the Node self-test. No app yet.
- The race engine (`js/engine.js`, `js/config.js`): a live simulated race from the entrant list, the seed and the duration, identical on every device. Race time runs in fixed ticks of 1/60 s; the track has 2 to 3 turns per 10 s of duration with short and long straights, laid out from the seed; every car runs the same rules, building to a top speed down each straight and braking hard into each turn, with seeded speed checkpoints along each straight and a seeded corner speed at each turn. Every car crosses the line, so every place has a real time. CSV import with the `name,spots` template, `-1`, `-2` suffixes for repeated names on display, CSV and JSON exports. A seed's case doesn't matter (`k7mx-4qzd` runs the same race as `K7MX-4QZD`).
- The page (`index.html`, `css/app.css`, `js/app/`): three full-screen phases in a loop. **Control:** the entrant list typed one per line or imported from a CSV (the template downloads from the page), the starting grid readable on stream, the seed with New and a Locked / Unlocked badge, the duration slider (10 to 120 s), and Start race, which says what to fix when the list is too short or too long; Clear asks first. **Race:** a perspective road drawn in code, cars seen from behind, three start lights, the elapsed time and the seed in the header, a broadcast-style timing tower over the left of the road (as many places as fit, each with the car's color, the name and the gap to the leader), and Pause / Play and Reset in a bar under the road; Pause, or a tap on the road, pauses the race and shows the controls large: Play, Reset race and Start over, which goes back to Control with the list and the seed kept; a hidden tab pauses the race, which resumes from the same moment. **Winner:** the winner large, the full finish order with times, CSV and JSON export, Copy result where the browser has a clipboard, Re-run this race (the identical result) and Start over (the list kept, a new seed).
- Session restore: the list, seed and duration are saved as you edit; a reload asks Resume or Start over, and says when the last race was recorded under another version of the app.
- Settings in the link: a tunable set in the link shows as a "Tuned link" chip on every screen and is written into the exports, so a tweaked link can't pose as a stock race; unknown settings are ignored and out-of-range ones clamped.
- Reduced motion (the system setting, or `?reducedMotion=1`): the race is computed at once and the finish order fills in from last to first without motion; the result is the same.
- Layouts for a phone (up to 760 px wide), a mid-size window and a desktop; every control is at least 44 px and the bottom bars clear the phone's home indicator.
- `?selftest=1` runs the engine's self-tests in the browser and shows the version, the pass count and the reference-race fingerprint.
