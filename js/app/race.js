// The Race phase: Start race builds the race, a race clock in wall time (playing time only)
// drives the engine through clockToTicks, and each frame draws a snapshot. Pause and Play, Reset,
// the hidden-tab pause, the HUD, the live order panel, the button bar, the tapped-stage overlay,
// the finish hold and the reduced-motion reveal all live here. The frame rate only decides how
// often the clock is read; a frame's delta never reaches the physics.
import {
  createRace,
  advanceTick,
  runToFinish,
  clockToTicks,
  raceSnapshot,
  trackLayout,
  finishResult,
} from '../engine.js?v=0.1.0-dev.1';
import {
  app,
  byId,
  makeEl,
  setText,
  showPhase,
  announce,
  formatRaceTime,
  phoneMedia,
} from './core.js?v=0.1.0-dev.1';
import { initStage, resizeStage, setScene, drawFrame, drawStill } from './stage.js?v=0.1.0-dev.1';

// The live order panel and the HUD text are rewritten at most this often (frame time).
const PANEL_INTERVAL_MS = 100;
// The leader is announced to the live region at most this often.
const ANNOUNCE_INTERVAL_MS = 2000;
// The lights stay on screen this long after going out (shell time).
const LIGHTS_LINGER_MS = 600;

let onRaceFinished = null;
let frameHandle = 0;
let overlayTimer = 0;
let panelDueMs = 0;
let announceDueMs = 0;
let orderItems = [];
let lastOrder = null;
let revealedPlaces = 0;
let lastDrawMs = 0;

/**
 * initRace({ onFinished }) → wires the phase once. `onFinished(result)` runs when the Winner
 * screen is due.
 */
export function initRace(options) {
  onRaceFinished = options.onFinished;
  initStage(byId('stage'));
  byId('btnPause').addEventListener('click', togglePause);
  byId('btnReset').addEventListener('click', resetRace);
  byId('overlayPause').addEventListener('click', togglePause);
  byId('overlayReset').addEventListener('click', () => {
    hideOverlay();
    resetRace();
  });
  byId('overlayBack').addEventListener('click', hideOverlay);
  byId('stage').addEventListener('pointerdown', showOverlay);
  byId('stageOverlay').addEventListener('pointerdown', event => {
    if (event.target === event.currentTarget) hideOverlay();
  });
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onKeyDown);
  new ResizeObserver(onStageResize).observe(byId('stageWrap'));
  phoneMedia.addEventListener('change', fitOrderPanel);
}

/**
 * startRace(inputs) → { entrants, seed, durationSec }: builds the race and hands the viewport
 * to the stage. The clock starts negative by the countdown, so the lights run on the same
 * clock as the race (Pause and a hidden tab hold them too) and race time starts at lights out.
 * Reduced motion computes the finish at once and reveals it without motion.
 */
export function startRace(inputs) {
  stopFrames();
  // The last race may still count as playing (left mid-race); this one starts from a stop.
  app.isPlaying = false;
  app.clock.resumedAtMs = null;
  app.raceInputs = inputs;
  app.race = createRace({
    entrants: inputs.entrants,
    seed: inputs.seed,
    durationSec: inputs.durationSec,
    config: app.config,
    overrides: app.overrides,
  });
  app.finishedAtClockMs = null;
  setScene(trackLayout(app.race), app.race.displayNames, app.config);
  buildOrderPanel();
  setText('hudSeed', app.race.seed);
  setText('hudElapsed', formatRaceTime(0, 1));
  setText('hudLeader', '—');
  showPhase('race');
  onStageResize();
  if (app.isReducedMotion) {
    runToFinish(app.race);
    revealedPlaces = 0;
    renderReveal(0);
    drawStill();
  }
  app.clock.playingMs = app.isReducedMotion ? 0 : -app.config.startCountdownSec * 1000;
  app.clock.isHiddenPause = false;
  playRace();
}

/**
 * raceClockMs(nowMs) → the race clock: playing time only, in ms; negative during the countdown.
 */
function raceClockMs(nowMs) {
  if (!app.isPlaying || app.clock.resumedAtMs === null) return app.clock.playingMs;
  return app.clock.playingMs + (nowMs - app.clock.resumedAtMs);
}

/**
 * playRace() → race time runs again from where it stopped.
 */
export function playRace() {
  if (!app.race || app.isPlaying) return;
  app.isPlaying = true;
  app.clock.resumedAtMs = performance.now();
  app.clock.lastFrameMs = app.clock.resumedAtMs;
  syncPauseButtons();
  if (!frameHandle) frameHandle = requestAnimationFrame(onFrame);
}

/**
 * pauseRace() → race time stops; the elapsed time is folded into the clock.
 */
export function pauseRace() {
  if (!app.race || !app.isPlaying) return;
  app.clock.playingMs = raceClockMs(performance.now());
  app.clock.resumedAtMs = null;
  app.isPlaying = false;
  syncPauseButtons();
}

/**
 * togglePause() → Pause or Play, from the bar or the overlay.
 */
export function togglePause() {
  if (app.isPlaying) {
    pauseRace();
    app.clock.isHiddenPause = false;
  } else {
    playRace();
  }
}

/**
 * resetRace() → the same race from the line, paused with Play showing (Rich, 2026-11-01), the
 * lights ready to run again.
 */
export function resetRace() {
  if (!app.raceInputs) return;
  startRace(app.raceInputs);
  pauseRace();
  drawCurrentFrame(performance.now());
}

/**
 * syncPauseButtons() → the bar and overlay buttons show Pause while playing, Play while paused.
 */
function syncPauseButtons() {
  const label = app.isPlaying ? 'Pause' : 'Play';
  for (const id of ['btnPause', 'overlayPause']) {
    const button = byId(id);
    button.setAttribute('aria-label', label);
    button.classList.toggle('is-playing', app.isPlaying);
  }
  byId('raceBadge').textContent = app.isPlaying ? 'Live' : 'Paused';
}

/**
 * onVisibilityChange() → a hidden tab pauses race time; coming back resumes it from the same
 * tick unless the breaker had paused (Rich, 2026-11-01). Missed time is never run.
 */
function onVisibilityChange() {
  if (app.phase !== 'race' || !app.race) return;
  if (document.hidden) {
    if (app.isPlaying) {
      pauseRace();
      app.clock.isHiddenPause = true;
    }
  } else if (app.clock.isHiddenPause) {
    app.clock.isHiddenPause = false;
    playRace();
  }
}

/**
 * onKeyDown(event) → keyboard extras: Space pauses or plays, R resets; never inside a field.
 */
function onKeyDown(event) {
  if (app.phase !== 'race') return;
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePause();
  } else if (event.key === 'r' || event.key === 'R') {
    resetRace();
  }
}

/**
 * stopFrames() → cancels the frame loop.
 */
function stopFrames() {
  if (frameHandle) cancelAnimationFrame(frameHandle);
  frameHandle = 0;
}

/**
 * onFrame(frameTimeMs) → one frame: drop a long gap from the clock (a stalled or sleeping
 * device never bursts ticks; Claude's call, same principle as the hidden-tab pause), owe the
 * engine its ticks from the whole clock, draw, update the HUD and the panel, and watch for the
 * finish.
 */
function onFrame(frameTimeMs) {
  frameHandle = 0;
  if (!app.race || app.phase !== 'race') return;
  if (app.isPlaying) {
    const gapMs = frameTimeMs - app.clock.lastFrameMs;
    if (gapMs > app.config.maxFrameGapMs) app.clock.resumedAtMs += gapMs;
    app.clock.lastFrameMs = frameTimeMs;
  }
  const clockMs = raceClockMs(frameTimeMs);
  if (app.isReducedMotion) {
    advanceReveal(clockMs, frameTimeMs);
  } else {
    const owed = clockToTicks(app.race, clockMs);
    for (let i = 0; i < owed.ticksDue; i++) advanceTick(app.race);
    drawCurrentFrame(frameTimeMs, owed.tickFraction, clockMs);
  }
  // Reduced motion finishes before the first frame; there the reveal starts the hold instead.
  const isLineCrossed = !app.isReducedMotion
    && app.race.isFinished
    && app.finishedAtClockMs === null;
  if (isLineCrossed) onFinishReached(clockMs);
  const isHoldOver = app.finishedAtClockMs !== null
    && clockMs >= app.finishedAtClockMs + app.config.finishHoldMs;
  if (isHoldOver) {
    stopFrames();
    app.isPlaying = false;
    onRaceFinished(finishResult(app.race));
    return;
  }
  if (app.isPlaying) frameHandle = requestAnimationFrame(onFrame);
}

/**
 * drawCurrentFrame(frameTimeMs, tickFraction, clockMs) → the snapshot drawn with the lights
 * state, then the HUD and the panel at their own pace.
 */
function drawCurrentFrame(frameTimeMs, tickFraction = 0, clockMs = raceClockMs(frameTimeMs)) {
  const snapshot = raceSnapshot(app.race, tickFraction);
  const frameDeltaSec = Math.min(0.1, Math.max(0, (frameTimeMs - lastDrawMs) / 1000));
  lastDrawMs = frameTimeMs;
  drawFrame(snapshot, { frameDeltaSec, lightsLit: lightsLit(clockMs) });
  if (frameTimeMs >= panelDueMs) {
    panelDueMs = frameTimeMs + PANEL_INTERVAL_MS;
    updateHud(snapshot, frameTimeMs);
    updateOrderPanel(snapshot);
  }
}

/**
 * lightsLit(clockMs) → how many of the three lights are red at this clock: one more per
 * second of the countdown, out at zero, gone a moment later; -1 means no lights drawn.
 */
function lightsLit(clockMs) {
  const countdownMs = app.config.startCountdownSec * 1000;
  if (countdownMs <= 0) return -1;
  if (clockMs >= LIGHTS_LINGER_MS) return -1;
  if (clockMs >= 0) return 0;
  const elapsedMs = clockMs + countdownMs;
  return Math.min(3, Math.floor(elapsedMs / (countdownMs / 3)) + 1);
}

/**
 * updateHud(snapshot, frameTimeMs) → elapsed race time and the leader; the leader is announced
 * to the live region now and then.
 */
function updateHud(snapshot, frameTimeMs) {
  setText('hudElapsed', formatRaceTime(snapshot.elapsedSec, 1));
  const leaderName = app.race.displayNames[snapshot.leader];
  if (snapshot.tick === 0) {
    setText('hudLeader', '—');
    return;
  }
  setText('hudLeader', leaderName);
  if (frameTimeMs >= announceDueMs) {
    announceDueMs = frameTimeMs + ANNOUNCE_INTERVAL_MS;
    announce(`Leader ${leaderName}`);
  }
}

/**
 * onFinishReached(clockMs) → the last car has crossed: the hold starts, the winner is announced.
 */
function onFinishReached(clockMs) {
  app.finishedAtClockMs = clockMs;
  const winner = app.race.displayNames[app.race.finishOrder[0]];
  announce(`Winner ${winner}`);
  byId('raceBadge').textContent = 'Finished';
}

/**
 * buildOrderPanel() → one list item per car, reused for the whole race.
 */
function buildOrderPanel() {
  orderItems = [];
  for (let i = 0; i < app.race.carCount; i++) {
    orderItems.push(makeEl('li', null,
      makeEl('span', { class: 'place' }, String(i + 1)),
      makeEl('span', { class: 'name' }, ''),
      makeEl('span', { class: 'time' }, '')));
  }
  byId('liveOrder').replaceChildren(...orderItems);
  lastOrder = new Int32Array(app.race.carCount).fill(-1);
  fitOrderPanel();
}

/**
 * updateOrderPanel(snapshot) → rewrites the items whose car changed; the leader is marked.
 */
function updateOrderPanel(snapshot) {
  const { order } = snapshot;
  for (let i = 0; i < orderItems.length; i++) {
    const car = order[i];
    const isCrossed = app.race.place[car] > 0;
    const timeText = isCrossed
      ? formatRaceTime(app.race.finishTick[car] / app.config.ticksPerSecond, 3)
      : '';
    const item = orderItems[i];
    if (lastOrder[i] !== car) {
      item.children[1].textContent = app.race.displayNames[car];
      lastOrder[i] = car;
    }
    if (item.children[2].textContent !== timeText) item.children[2].textContent = timeText;
    item.classList.toggle('is-leader', i === 0 && snapshot.tick > 0);
  }
}

/**
 * fitOrderPanel() → shows as many places as fit the panel (a column on desktop, a row on mid
 * and phone), hiding from the end until nothing overflows, then "+ n more".
 */
function fitOrderPanel() {
  if (!orderItems.length) return;
  const panel = byId('orderPanel');
  const list = byId('liveOrder');
  const more = byId('orderMore');
  for (const item of orderItems) item.hidden = false;
  more.hidden = true;
  let visible = orderItems.length;
  // The list clips its own items, so its scroll size is what overflows, then the panel's.
  const overflows = () => list.scrollHeight > list.clientHeight + 1
    || list.scrollWidth > list.clientWidth + 1
    || panel.scrollHeight > panel.clientHeight + 1
    || panel.scrollWidth > panel.clientWidth + 1;
  while (visible > 1 && overflows()) {
    visible--;
    orderItems[visible].hidden = true;
    more.hidden = false;
    more.textContent = `+ ${orderItems.length - visible} more`;
  }
}

/**
 * onStageResize() → the canvas follows its box; the panel refits; a paused or still frame is
 * redrawn so a resize never leaves a stale picture.
 */
function onStageResize() {
  if (app.phase !== 'race') return;
  const box = byId('stageWrap').getBoundingClientRect();
  resizeStage(box.width, box.height);
  fitOrderPanel();
  if (!app.race) return;
  if (app.isReducedMotion) {
    drawStill();
  } else if (!app.isPlaying) {
    drawCurrentFrame(performance.now());
  }
}

/**
 * showOverlay() → a tap on the stage dims it and shows the controls large (Rich, 2026-11-01);
 * it clears on a tap outside or after overlayHideMs. The race keeps running.
 */
function showOverlay() {
  byId('stageOverlay').hidden = false;
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(hideOverlay, app.config.overlayHideMs);
}

/**
 * hideOverlay() → clears the tapped-stage overlay.
 */
function hideOverlay() {
  clearTimeout(overlayTimer);
  overlayTimer = 0;
  byId('stageOverlay').hidden = true;
}

/**
 * advanceReveal(clockMs, frameTimeMs) → the reduced-motion reveal: the order panel fills from
 * last place up to first over revealSec, so the winner comes last; then the finish hold runs
 * as usual. The HUD shows the winner's time once revealed.
 */
function advanceReveal(clockMs, frameTimeMs) {
  const total = app.race.carCount;
  const share = Math.min(1, Math.max(0, clockMs / (app.config.revealSec * 1000)));
  const revealed = Math.floor(share * total);
  if (revealed !== revealedPlaces || frameTimeMs >= panelDueMs) {
    panelDueMs = frameTimeMs + PANEL_INTERVAL_MS;
    revealedPlaces = revealed;
    renderReveal(revealed);
  }
  if (share >= 1 && app.finishedAtClockMs === null) {
    app.finishedAtClockMs = clockMs;
    announce(`Winner ${app.race.displayNames[app.race.finishOrder[0]]}`);
  }
}

/**
 * renderReveal(revealedCount) → the last `revealedCount` places shown, the rest as dashes.
 */
function renderReveal(revealedCount) {
  const total = app.race.carCount;
  const firstShown = total - revealedCount;
  for (let i = 0; i < orderItems.length; i++) {
    const item = orderItems[i];
    const car = app.race.finishOrder[i];
    const isShown = i >= firstShown;
    item.children[1].textContent = isShown ? app.race.displayNames[car] : '—';
    item.children[2].textContent = isShown
      ? formatRaceTime(app.race.finishTick[car] / app.config.ticksPerSecond, 3)
      : '';
    item.classList.toggle('is-leader', i === 0 && isShown);
  }
  const isWinnerShown = firstShown === 0;
  const winner = app.race.finishOrder[0];
  setText('hudLeader', isWinnerShown ? app.race.displayNames[winner] : '—');
  setText('hudElapsed', isWinnerShown
    ? formatRaceTime(app.race.finishTick[winner] / app.config.ticksPerSecond, 1)
    : formatRaceTime(0, 1));
}

/**
 * runToEnd() → test hook: finishes the current race at once and shows the Winner screen.
 */
export function runToEnd() {
  if (!app.race) return null;
  stopFrames();
  runToFinish(app.race);
  app.isPlaying = false;
  app.clock.resumedAtMs = null;
  const result = finishResult(app.race);
  onRaceFinished(result);
  return result;
}

/**
 * frameAt(raceClockMs) → test hook: runs one frame as if the race clock read this value, with
 * no animation frame involved, and returns the snapshot's tick.
 */
export function frameAt(clockMs) {
  if (!app.race) return 0;
  const owed = clockToTicks(app.race, clockMs);
  for (let i = 0; i < owed.ticksDue; i++) advanceTick(app.race);
  drawCurrentFrame(performance.now(), owed.tickFraction, clockMs);
  return app.race.tick;
}
