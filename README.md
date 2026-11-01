# P1 Hunt Race

A free browser tool that picks a giveaway winner by running an F1-style race on screen. Load a list of entrants, start the race, and one of them wins with the full finishing order recorded. The same entrants, duration and seed always produce the same result, so a race can be re-run on stream for anyone who doubts it.

It's made for breakers running a live stream: share the browser window from a computer running OBS, or from a second phone, and the audience sees the entrant list, the race and the winner.

**Status:** in development, nothing released yet. The first release will be on GitHub Pages at [rberrill.github.io/p1hunt_race](https://rberrill.github.io/p1hunt_race/).

## What it does

Three screens in a loop:

1. **Control.** The entrant list (typed one per line, or imported from a CSV using the template the app offers), the starting grid, the seed and the race duration, on one page the audience can read. **Start race** hands the screen to the race.
2. **Race.** A vertical road in a retro arcade style, cars seen from behind, racing toward the finish, with three start lights and the live order alongside. Pause and Reset sit in a bar under the road; a tap on the road shows them large. It's a simulated race decided by the seed, not a reveal of a result picked in advance: the track is laid out from the seed and the duration, every car runs the same rules, and every car crosses the line, so every place has a real time. A hidden tab pauses the race, which resumes where it was.
3. **Winner.** The winner, large, and the full finishing order with times, with CSV and JSON export. **Re-run this race** plays the identical race again; **Start over** goes back to the list with a fresh seed.

The list, seed and duration are saved in the browser as you edit, so a reload offers to resume. Everything stays in your browser: no accounts, no server, no uploads, no analytics. See [SECURITY.md](SECURITY.md) for what's stored on your device.

### Settings in the link

Every tunable can be set in the link, within safe limits, for example `?durationSec=45`. A race run from such a link shows a "Tuned link" chip on every screen and writes the settings into its exports, so a tweaked link can't pose as a stock race. `?selftest=1` runs the engine's self-tests in the browser and shows the version and the reference-race fingerprint; `?reducedMotion=1` shows the finish without motion.

## How it's built

- Plain static files with no dependencies and no build step: `index.html`, `css/`, `js/` (ES modules).
- The race engine is pure functions with no access to the page, the clock or the frame rate, so the same inputs give the same finish on every device.
- A Content Security Policy lets only the site's own files run, and the code never builds HTML from text. `node tests/selftest.js` enforces both.
- Serve the folder with any static server to run it locally, for example:

  ```bash
  python -m http.server 8080
  ```

  then open `http://localhost:8080/index.html`. ES modules don't load from `file://`, so a server is needed.

## Tests

| Command | What it checks |
|---|---|
| `node tests/selftest.js` | Privacy and code-style rules, the Content Security Policy, cache-busting, module imports, engine purity and the engine's own self-tests. See [tests/README.md](tests/README.md) |

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
