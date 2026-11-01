---
name: uat
description: Maintain Rich's manual acceptance tests - the catalog of every case, the release smoke test, and each version's UAT script (new and connected cases + smoke). Use when proposing or building a feature or behavior change, when starting a version, and at release.
---

# UAT: catalog, smoke test, version script

All three files are local only (gitignored), so they may hold the LAN address.

**Where it runs.** GitHub Pages only serves the `release` branch, so there is no HTTPS copy of a build before release.
- **Before release:** Rich runs the version script on the dev build: desktop Chrome on `localhost` (treated as secure, so Copy result works there) and iPhone Safari over the LAN on plain HTTP (no clipboard, so Copy result is hidden).
- **A fresh dev number for every changed build.** Before handing Rich a build whose code changed since he last tested, bump the dev number (`node .claude/skills/release/set-version.js X.Y.0-dev.N`, N + 1). The `?v=` on every asset link and import then changes, so the phone can't mix cached old modules with new ones. Say the new number in the handover so he can check the console.
- **After release:** once the release is pushed, he re-runs the smoke test and any **(HTTPS)** rows on the live site, and the real-use run (section 7) where the version changed what the stream sees.

| File | What it is | Run |
|---|---|---|
| `tests/uat/catalog.md` | Every test case, by section, with permanent IDs. The master | Only as a full run (see triggers) |
| `tests/uat/smoke.md` | One quick pass per device touching every phase, leaning on iPhone-only and stream-only risks. The master | Every release: pre-release on the dev build, then live after deploy |
| `tests/UAT-X.Y.md` | This version's new and connected cases, the smoke test, the after-deploy check, the sign-off | Every release |

## Shared structure

- **Sections follow the three phases** (the product definition, 2026-11-01): 1 Start and layout · 2 Control · 3 Race · 4 Winner · 5 Loop back and session restore · 6 Security · 7 Real-use run · 8 Environments. A new feature goes into the section of its phase; a new section is rare and renumbers the later ones and their IDs in the catalog.
- **Each of sections 1–6** has a `### Desktop` and a `### Phone` table, each opened by one italic *Setup:* line. If a device has no cases, say so in one line.
- **Section 7 (Real-use run)** has two tables, `### OBS` (window capture and browser-source capture of the desktop browser) and `### Second phone` (a phone in portrait, shared into the stream). Its rows are about what the stream shows: the list readable before the race, the race watchable, the winner unmistakable, the re-run. **Section 8** is a single table.
- **Columns:** `| ID | Test | Steps | Expected | Result | Notes |`.
- **IDs are permanent:** a device letter, then section.row, e.g. `P3.4`. `D` desktop, `P` phone, `O` OBS, `S` second phone, `E` environments (the letters are Claude's scheme). A new case takes the next free number in its catalog table; a retired ID isn't reused. The version script uses catalog IDs, so gaps are normal. Smoke IDs are `SD1…` and `SP1…`.

## Writing test cases

- **One behavior per row.** Steps may set things up, but Expected is a single outcome to judge. If Expected reads "…; then…" or covers two features, split the row. Rows may build on the rows above them in the same table; name the row when it depends on a specific one ("After P2.4, …").
- **Test** is a short name for the behavior. **Expected** should be visible without DevTools, except in Security (Claude's habit, so Rich can judge a row on the phone; not a rule he set).
- **Both devices:** a behavior that applies to both gets a row in each table, with that device's steps and outcome.
- **One device:** device-only behavior (keyboard, mouse wheel, drag-and-drop; the tapped-stage overlay, iOS long-press, the share sheet) goes only in that device's table.
- **Determinism rows** say what to compare (the finish order and times), not how it looked.
- **(HTTPS) rows:** start the Test cell with `(HTTPS)` only when the row needs the phone's clipboard (Copy result). There is no HTTPS before release, so when you build a version script, pre-fill their Result (and the smoke test's Pre-release cell) with ➖; Rich skips them and runs them after deploy. An (HTTPS) row left ➖ after deploy is closed with that version; never carry it into the next version's script. Downloads (the CSV template, the exports) don't need HTTPS.

## In a feature proposal (before building)

List in the proposal, for Rich to agree along with the ACs:
1. **New cases:** the rows the feature needs, per device.
2. **Connected cases:** the catalog rows the change could affect, with one line each on why. Look across phases: a Control change → the Winner's "back from race" line, the Resume card; an engine change → every determinism row in 3 and 5.
3. **Full-run trigger:** say whether one applies:
   - the change touches every module (a refactor, security hardening, the engine's tick or the stage's draw loop, `css/app.css` layout rules);
   - three releases without a full run.

   Rich decides.

## Version script `tests/UAT-X.Y.md`

1. **Header:** the version under test; "automated tests first" (`tests/README.md`; no counts); the ID and recording conventions; a tester table.
2. **Scope:** new behavior; connected cases and why; whether a full run was triggered and why.
3. **New in X.Y**, at the lead: an `ID | Test | Section` table of every 🆕 row.
4. **Setup**, copied from the catalog.
5. **Sections:** only the sections with rows this version. New rows are marked 🆕; connected rows are copied from the catalog unchanged. For a full run, copy every catalog section.
   **Write the catalog in the same step.** Every 🆕 row goes into its catalog table (without the marker, with an empty Result, and ➖ for (HTTPS) rows) at the moment it goes into the script; a reworded (✏️) row replaces its catalog row, and a retired row is deleted from the catalog. The catalog is the master, so it is never behind the script. If a row changes during UAT, change it in both.
6. **Smoke test:** the Desktop and Phone tables copied from `tests/uat/smoke.md`, with **Pre-release** and **Live** result columns.
7. **After deploy:**
   - re-run the smoke test on the live site (Live column);
   - list this version's (HTTPS) rows by ID, or say there are none;
   - say whether section 7 runs on this version (it does when the version changed what the stream sees);
   - the line `☐ Keep ☐ Roll back`.
8. **Sign-off:**
   - a row per included section, plus "Smoke test (pre-release)" and "Smoke test (live)", with Desktop / Phone / Blocking issues columns;
   - the decision line `☐ Ship ☐ Fix first`, decided on the pre-release results;
   - the previous release's one-line result.

**Start a version:** create the file with the header, an empty Scope ("none yet"), Setup, the smoke test and the after-deploy section. Move the previous version's file to `archive/`.

## At release (the `release` skill calls this)

- Record Rich's sign-off and decision.
- **Check the catalog:** every 🆕 and ✏️ row in the script is already in the catalog, worded the same (they went in with the script). Fix any drift; if the release drops a feature, delete its rows from the catalog.
- If a smoke row found a real regression, or a step stops making sense, update `tests/uat/smoke.md` too.
- Keep the smoke test short: one row per phase plus the iPhone-only and stream-only risks. About 15 rows per device is Claude's target, not Rich's; if it grows, propose what to drop.
