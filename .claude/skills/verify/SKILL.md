---
name: verify
description: Verify a P1 Hunt Race change end to end before calling it done - Node selftest, phone and desktop layout and behavior checks (determinism included), and the Pages-style subfolder run. Use after any change to js/, css/, index.html or tests/, before a commit, and as the release preflight.
---

# Verify a change

Rich runs UAT only after this passes, so it must cover everything a browser can check, phone layout and determinism included. What it can't check is the stream itself: a race captured through OBS or a second phone is Rich's real-use run (UAT section 7).

## Pick the scope

| Changed | Run |
|---|---|
| Docs or Claude files only | `node tests/selftest.js` (privacy and style checks) |
| `js/engine.js` | 1, 2 (section 3's determinism rows at least), 3 |
| `js/app/`, `index.html` | 1, 2 (the touched sections), 3 |
| `css/` or anything that moves layout | 1, 2 (section 1 at all three sizes) |
| Release preflight | Everything, plus `?selftest=1` on the phone: the fingerprint equals the desktop's (the only time the number is reported; Rich, 2026-11-01) |

## Steps

1. **Node:** `node tests/selftest.js`. All checks pass.
2. **Behavior and layout:** `preview_start` with `race` (port 8768). Refresh the assets first (the `?v=` doesn't change during development; see [browser-recipes.md](browser-recipes.md)). Work through the relevant rows of [checks.md](checks.md) at **390×844**, then **375×667** when layout changed, then **1280×800**: the Finisher's three sizes (Rich, 2026-11-01). Measure (`scrollWidth`, `getBoundingClientRect`); don't eyeball. Screenshot once per size as proof, retaking any that come back tiled or stale.
   The browser pane gives animation frames only to the fronted tab: `tabs_select` the tab
   before timing a race, or the race never advances (a background tab also trips the app's
   own hidden-tab pause). `frameAt` from the test hook is synchronous and needs no frames.
3. **Subfolder:** `preview_start` with `subfolder` (port 8772) and open `http://127.0.0.1:8772/p1hunt-race-new/index.html`, which stands in for Pages' `/p1hunt_race/` path. It loads styled, runs a race, and has no 404s in `read_network_requests`.
4. **Clean up:** `localStorage.clear()` on the preview origin, and `resize_window` with preset `desktop`.

## Report

Give a short table of what ran and the measured result of each check, with counts from the output. Say plainly what wasn't covered: always the stream capture, plus anything skipped by the scope above. If a check fails, fix the cause, or say why the change deliberately moved that behavior and update the test in the same change.
