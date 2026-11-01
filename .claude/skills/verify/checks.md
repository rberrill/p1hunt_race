# Behavior and layout checks

The sections match Rich's UAT catalog (`tests/uat/catalog.md`), so a failure here points to the catalog rows it would break. Those rows are the connected cases to add to the version's UAT. Run the sections a change touches; run them all for a release. "Phone" means 390×844 (and 375×667 for layout rows) with touch emulation; "Desktop" means 1280×800. Rows marked *(engine)* need the engine; until it exists they're the checks it must make possible.

Every row traces to the product definition or a decision of Rich's (2026-11-01) unless it says otherwise.

## 1. Start and layout

| Device | Check | Pass when |
|---|---|---|
| Both | `?selftest=1` | the console (or a toast) reads the version and `n/n` self-tests passing |
| Both | Whole run | zero CSP errors in `read_console_messages` |
| Phone | No sideways scroll | `document.documentElement.scrollWidth <= innerWidth` on every phase |
| Phone | Control stacks | entrants, then seed and duration, then Start race; the action bar is sticky and its bottom is inside the safe area |
| Phone | Tap targets | every button and control has a rect ≥ 44 px on its short side |
| Desktop | Resize across 760 and 1100 px | ≤ 760 stacked; 761–1100 entrants beside a compact setup column; > 1100 the wide list beside the setup column |
| Both | Race and Winner fill the viewport | the phase's rect equals the viewport at every size; nothing else is shown |

## 2. Control

| Device | Check | Pass when |
|---|---|---|
| Both | Type names, blank lines between | the count ignores blank lines; the grid shows the typed order |
| Both | 1 name, then 101 | Start race is refused with a message that says what to do; 2 and 100 are accepted |
| Both | Download CSV template | a file with the header `name,spots` (capture the download) |
| Both | Import `Rich,3` plus three plain `Rich` lines | six entrants named Rich; the grid shows Rich-1 … Rich-6; the entrant records keep the plain name |
| Both | Alphanumeric usernames (`k2-7`, `k2-7`) | suffixes read as `k2-7-1`, `k2-7-2`, never as part of the name |
| Both | New seed | the seed changes; the badge reads Unlocked until the list is loaded, Locked after |
| Both | Duration | 10 to 120 s only; the readout matches the slider |
| Both | Start race | Control hides and the stage takes the whole viewport |

## 3. Race

| Device | Check | Pass when |
|---|---|---|
| Both | *(engine)* Same entrants, seed and duration, run twice | identical finish order and identical finish times |
| Both | *(engine)* Frame rate | driven with a fake `requestAnimationFrame` at 30 and at 120 fps, the finish is identical |
| Both | *(engine)* Reduced motion | the reduced-motion mode gives the identical finish |
| Both | *(engine)* Pause, wait, Play | race time stops while paused and resumes from the same tick |
| Both | *(engine)* Reset | back to the start of the same race; the finish, when run again, is identical |
| Both | HUD | shows time elapsed, the leader and the seed; never time remaining |
| Both | Live order panel | the order shown equals the engine's order at that tick; the leader is readable at 390 wide |
| Phone | Tap the stage | the stage dims and shows Pause/Play and Reset large; a tap outside, or a few seconds, clears it; the race keeps running unless Pause is tapped |
| Both | Button bar | always on, at the bottom, outside the picture, with Pause/Play and Reset only |
| Both | Nothing covers the stage | with no overlay open, no element intersects the stage except the button bar |

## 4. Winner

| Device | Check | Pass when |
|---|---|---|
| Both | Winner | the name shown equals the first of the engine's finish order; large enough to read at 390 wide (measure the font size against the stage) |
| Both | Finish order | every entrant listed once, in the engine's order, `n of n` |
| Both | Export CSV and JSON (capture the download) | the full order, the seed, duration and entrant count; JSON parses; CSV has one row per entrant |
| Both | Copy result | shown on `localhost`; hidden (not greyed) where `navigator.clipboard` is missing |
| Both | Race record | the record is in localStorage under `storageKey`, with the time it was saved |

## 5. Loop back and session restore

| Device | Check | Pass when |
|---|---|---|
| Both | Re-run this race | the same seed, entrants and duration; the finish is identical |
| Both | Start over | Control with the list kept and a fresh seed; the "back from race" line names the last winner |
| Both | Edit the list, reload | the Resume / Start over card over the dimmed Control page; nothing behind it is tappable |
| Both | Resume | the same list, seed and duration come back |
| Both | Start over on the card, reload | no prompt the second time |

## 6. Security

| Device | Check | Pass when |
|---|---|---|
| Desktop | A link with a text setting (`?something=<b>x</b>`) | ignored; the console notes the ignored setting |
| Desktop | A crafted localStorage record (markup in a name, a wrong type) | resumed as text or reset with a notice; nothing renders as markup |
| Both | A CSV cell with markup or a formula (`=1+1`, `<b>x</b>`) | shown as plain text everywhere it appears |
| Both | Whole run | zero CSP errors |

## 7. Real-use run

Rich only: a race captured through OBS (window and browser-source capture) and through a second phone. Claude can't run this; make sure sections 1–6 leave nothing for it to find but the capture itself.

## 8. Environments

| Device | Check | Pass when |
|---|---|---|
| Desktop | Subfolder run (`subfolder`, port 8772) | loads styled, runs a race, no 404s |
| Desktop | After deploy, the Pages site with `?selftest=1` | the console reads the released version; self-tests pass; no CSP errors |
