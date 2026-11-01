// The entry module: link settings, the saved session, the three phases wired into their loop
// (Control → Race → Winner → Control), the self-test runner and the test hook. init() runs last.
import { CONFIG } from '../config.js?v=0.1.0-dev.2';
import { sanitizeOverrides, selfTest } from '../engine.js?v=0.1.0-dev.2';
import {
  app,
  byId,
  setText,
  showPhase,
  initCard,
  hideCard,
  renderTunedChips,
  files,
} from './core.js?v=0.1.0-dev.2';
import {
  loadStoredSession,
  saveSessionNow,
  clearStoredSession,
  offerResume,
} from './session.js?v=0.1.0-dev.2';
import {
  initControl,
  setEntrantsText,
  setSeed,
  setDuration,
  newSeedText,
  loadGrid,
  refreshControl,
  showBackLine,
  importCsvText,
  entrantCount,
} from './control.js?v=0.1.0-dev.2';
import {
  initRace,
  startRace,
  pauseRace,
  playRace,
  resetRace,
  runToEnd,
  frameAt,
} from './race.js?v=0.1.0-dev.2';
import { initWinner, showWinner, setRerunNote } from './winner.js?v=0.1.0-dev.2';

// Link keys the shell uses itself; they are not settings and are not reported as ignored.
const SHELL_LINK_KEYS = new Set(['selftest']);
// The line under Re-run on the Winner screen.
const RERUN_NOTE = 'same entrants, duration and seed · identical result';

/**
 * applyLinkSettings() → CONFIG with the link's overrides, within CONFIG_LIMITS; ignored
 * settings are named once in the console. Reduced motion comes from the system or the link.
 */
function applyLinkSettings() {
  const entries = [...new URLSearchParams(location.search).entries()]
    .filter(pair => !SHELL_LINK_KEYS.has(pair[0]));
  const { config, overrides, ignored } = sanitizeOverrides(entries, CONFIG);
  app.config = config;
  app.overrides = overrides;
  for (const note of ignored) console.warn(`[p1hunt-race] ignored link setting: ${note}`);
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  app.isReducedMotion = prefersReduced || config.reducedMotion >= 1;
  renderTunedChips();
}

/**
 * runSelfTests() → `?selftest=1`: the engine's self-tests in this browser, logged as a table
 * and summed up in a panel with the reference-race fingerprint (what the iPhone run proves).
 */
function runSelfTests() {
  const { results } = selfTest();
  console.table(results);
  const passed = results.filter(result => result.pass).length;
  const fingerprintTest = results.find(result => /fingerprint/.test(result.name));
  const fingerprint = fingerprintTest ? fingerprintTest.detail.split(' ')[0] : 'unknown';
  const isAllPassed = passed === results.length;
  const panel = byId('selftestPanel');
  panel.textContent = `${CONFIG.appVersion} · ${passed}/${results.length} self-tests passed`
    + ` · fingerprint ${fingerprint}`;
  panel.classList.toggle('is-failed', !isAllPassed);
  panel.hidden = false;
  panel.addEventListener('click', () => {
    panel.hidden = true;
  });
  window.__selftest = { results, passed, fingerprint };
}

/**
 * onStartRace() → Start race from Control: the grid is loaded first if the list changed, then
 * the race runs with the grid's entrants, the seed and the duration.
 */
function onStartRace() {
  if (app.isGridStale || !app.gridEntrants.length) loadGrid();
  startRace({
    entrants: app.gridEntrants,
    seed: app.seed,
    durationSec: app.durationSec,
  });
}

/**
 * onRaceFinished(result) → the record is saved and the Winner screen shows.
 */
function onRaceFinished(result) {
  app.lastResult = result;
  app.savedAtMs = Date.now();
  app.isBackFromRace = true;
  saveSessionNow();
  setRerunNote(RERUN_NOTE);
  showWinner();
}

/**
 * onRerun() → the identical race again, from the Winner screen.
 */
function onRerun() {
  startRace(app.raceInputs);
}

/**
 * onStartOver() → back to Control with the list kept and a fresh seed; the back line names
 * the last winner.
 */
function onStartOver() {
  setSeed(newSeedText(), true);
  const winner = app.lastResult.places[0].displayName;
  showBackLine(`Back from race · same ${entrantCount()} entrants · new seed ${app.seed}`
    + ` · last winner ${winner}`);
  showPhase('control');
  refreshControl();
}

/**
 * restoreSession(session) → Resume: the saved list, seed and duration come back; the back line
 * says who won last, and warns when the record is from another app version (Rich, 2026-11-01:
 * it still runs).
 */
function restoreSession(session) {
  hideCard();
  setEntrantsText(session.entrantsText, false);
  setSeed(session.seed || newSeedText(), false);
  setDuration(session.durationSec, false);
  app.lastResult = session.lastResult;
  app.savedAtMs = session.savedAtMs;
  if (session.lastResult) {
    const winner = session.lastResult.places[0].displayName;
    let line = `Last race: ${winner} won · seed ${session.lastResult.seed}`;
    if (session.lastResult.appVersion !== CONFIG.appVersion) {
      line += ` · recorded under ${session.lastResult.appVersion || 'an earlier version'};`
        + ' this version may run it differently';
    }
    showBackLine(line);
  }
  refreshControl();
}

/**
 * startFresh() → an empty list and a fresh seed; nothing is saved until the user changes
 * something, so Start over on the card leaves no session behind.
 */
function startFresh() {
  hideCard();
  clearStoredSession();
  app.lastResult = null;
  app.savedAtMs = 0;
  setEntrantsText('', false);
  setSeed(newSeedText(), false);
  setDuration(CONFIG.durationSec, false);
  showBackLine('');
  refreshControl();
}

/**
 * init() → wires everything and shows Control, with the Resume question when a session is
 * saved. Called last.
 */
function init() {
  console.info(`[p1hunt-race] P1 Hunt Race ${CONFIG.appVersion}`);
  applyLinkSettings();
  initCard();
  initControl({ onStart: onStartRace });
  initRace({ onFinished: onRaceFinished });
  initWinner({ onRerun, onStartOver });
  if (app.overrides.durationSec !== undefined) {
    byId('durationInput').value = String(app.overrides.durationSec);
  }
  setDuration(app.overrides.durationSec ?? CONFIG.durationSec, false);
  setSeed(newSeedText(), false);
  showPhase('control');
  refreshControl();
  const session = loadStoredSession();
  if (session) offerResume(session, () => restoreSession(session), startFresh);
  if (new URLSearchParams(location.search).has('selftest')) runSelfTests();
  // The test hook (not used by the UI): lets automated checks drive the app.
  window.__race = {
    app,
    CONFIG,
    files,
    setEntrantsText: text => setEntrantsText(text, true),
    importCsvText,
    setSeed: text => setSeed(text, true),
    setDuration: seconds => setDuration(seconds, true),
    loadGrid,
    startRace: onStartRace,
    pause: pauseRace,
    play: playRace,
    reset: resetRace,
    frameAt,
    runToEnd,
    rerun: onRerun,
    startOver: onStartOver,
    finishOrder: () => (app.race ? app.race.finishOrder.slice() : []),
    finishResult: () => app.lastResult,
    restoreSession,
    startFresh,
    saveSessionNow,
    setText,
  };
}

init();
