# Changelog

All notable changes to P1 Hunt Race are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions run from 0.1.0 toward 1.0.0, the first public release. The version is logged to the browser console.

## [0.1.0] - Unreleased

A fresh build. The earlier race prototype was never released; nothing here comes from it.

### Added
- The project scaffold: working notes, rules, the verify / UAT / release workflows, hooks and the Node self-test. No app yet.
- The race engine (`js/engine.js`, `js/config.js`): a live simulated race from the entrant list, the seed and the duration, identical on every device. Race time runs in fixed ticks of 1/60 s; the track has 2 to 3 turns per 10 s of duration with short and long straights, laid out from the seed; every car runs the same rules, with seeded speed checkpoints along each straight and a seeded corner speed at each turn. Every car crosses the line, so every place has a real time. CSV import with the `name,spots` template, `-1`, `-2` suffixes for repeated names on display, CSV and JSON exports. A seed's case doesn't matter (`k7mx-4qzd` runs the same race as `K7MX-4QZD`). No page yet.
