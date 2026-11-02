// The Race phase: Start race builds the race, a race clock in wall time (playing time only)
// drives the engine through clockToTicks, and each frame draws a snapshot. Pause and Play, Reset,
// the hidden-tab pause, the HUD, the timing tower, the button bar, the tap-to-pause overlay,
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
} from '../engine.js?v=0.1.0-dev.22';
import {
  app,
  byId,
  makeEl,
  setText,
  showPhase,
  announce,
  formatRaceTime,
  phoneMedia,
} from './core.js?v=0.1.0-dev.22';
import {
  initStage,
  resizeStage,
  setScene,
  drawFrame,
  drawStill,
  carColor,
  lightsBandPx,
} from './stage.js?v=0.1.0-dev.22';

// The timing tower and the HUD text are rewritten at most this often (frame time).
const PANEL_INTERVAL_MS = 100;
// The leader is announced to the live region at most this often.
const ANNOUNCE_INTERVAL_MS = 2000;
// The lights stay on screen this long after going out (shell time).
const LIGHTS_LINGER_MS = 600;
// The tower's live gap is the rough translation of distance to time Rich asked for
// (2026-11-01): the distance to the leader divided by the trailing car's own speed, floored
// at this (a track unit is one second at cruise, 1.0) so the launch never shows a huge gap.
// Once both cars have crossed, the gap is the exact difference of their times.
const GAP_SPEED_FLOOR = 0.5;
// The first rows of the tower are full width; the rest are the half-width minor rows (Rich,
// 2026-11-01: "only the top 3 need to be that big").
const TOWER_MAJOR_ROWS = 3;
// The tower's rows: place, swatch, name, gap.
const ROW_SWATCH = 1;
const ROW_NAME = 2;
const ROW_GAP = 3;

let onRaceFinished = null;
let frameHandle = 0;
let panelDueMs = 0;
let towerDueMs = 0;
let announceDueMs = 0;
let towerRows = [];
let lastOrder = null;
let lastPlaceOfCar = null;
let revealedPlaces = 0;
let lastDrawMs = 0;
let onLeaveRace = null;

/**
 * initRace({ onFinished, onLeave }) → wires the phase once. `onFinished(result)` runs when the
 * Winner screen is due; `onLeave()` when the breaker takes Start over from the overlay.
 */
export function initRace(options) {
  onRaceFinished = options.onFinished;
  onLeaveRace = options.onLeave;
  initStage(byId('stage'));
  byId('btnPause').addEventListener('click', togglePause);
  byId('btnReset').addEventListener('click', resetRace);
  byId('overlayPause').addEventListener('click', togglePause);
  byId('overlayReset').addEventListener('click', () => {
    hideOverlay();
    resetRace();
  });
  byId('overlayStartOver').addEventListener('click', () => onLeaveRace());
  byId('stage').addEventListener('pointerdown', pauseAndShowOverlay);
  byId('stageOverlay').addEventListener('pointerdown', event => {
    if (event.target === event.currentTarget) hideOverlay();
  });
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('keydown', onKeyDown);
  new ResizeObserver(onStageResize).observe(byId('stageWrap'));
  phoneMedia.addEventListener('change', fitTower);
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
  buildTower();
  towerDueMs = 0;
  setText('hudSeed', app.race.seed);
  setText('hudElapsed', formatRaceTime(0, 1));
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
 * togglePause() → the bar's Pause / Play button and Space: a pause brings up the overlay, the
 * same as a tap on the stage (Rich, 2026-11-01); Play clears it and runs the race on.
 */
export function togglePause() {
  if (app.isPlaying) {
    pauseAndShowOverlay();
  } else {
    hideOverlay();
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
 * leaveRace() → the race is abandoned: the frame loop stops, the overlay clears and the race is
 * dropped, so nothing draws or finishes after Control is back. Entrants, seed and duration are
 * untouched; Start race runs the identical race (Rich, 2026-11-01).
 */
export function leaveRace() {
  stopFrames();
  hideOverlay();
  app.isPlaying = false;
  app.clock.resumedAtMs = null;
  app.finishedAtClockMs = null;
  app.race = null;
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
 * state, then the HUD and the tower at their own pace.
 */
function drawCurrentFrame(frameTimeMs, tickFraction = 0, clockMs = raceClockMs(frameTimeMs)) {
  const snapshot = raceSnapshot(app.race, tickFraction);
  const frameDeltaSec = Math.min(0.1, Math.max(0, (frameTimeMs - lastDrawMs) / 1000));
  lastDrawMs = frameTimeMs;
  const lit = lightsLit(clockMs);
  drawFrame(snapshot, {
    frameDeltaSec,
    lightsLit: lit,
    lightsClearPx: lit >= 0 ? towerRightBeside(lightsBandPx()) : 0,
  });
  if (frameTimeMs >= panelDueMs) {
    panelDueMs = frameTimeMs + PANEL_INTERVAL_MS;
    updateHud(snapshot, frameTimeMs);
  }
  if (frameTimeMs >= towerDueMs) {
    towerDueMs = frameTimeMs + app.config.towerRefreshMs;
    updateTower(snapshot);
  }
}

/**
 * towerRightBeside(band) → how far the timing tower's visible rows (or its "+ n more" line)
 * that lie within `band` ({ topPx, bottomPx }, stage rows) reach into the stage from its left
 * edge, 0 when none does; the lights keep clear of that. The rows are measured, not the
 * tower's box: the box runs the stage's height and the small rows are narrow.
 */
function towerRightBeside(band) {
  const wrap = byId('stageWrap').getBoundingClientRect();
  const more = byId('towerMore');
  const lines = more.hidden ? towerRows : towerRows.concat([more]);
  let rightPx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].hidden) continue;
    const rect = lines[i].getBoundingClientRect();
    const top = rect.top - wrap.top;
    const bottom = rect.bottom - wrap.top;
    if (bottom <= band.topPx || top >= band.bottomPx) continue;
    rightPx = Math.max(rightPx, rect.right - wrap.left);
  }
  return rightPx;
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
 * updateHud(snapshot, frameTimeMs) → elapsed race time; the leader is announced to the live
 * region now and then (the tower's first row shows it).
 */
function updateHud(snapshot, frameTimeMs) {
  setText('hudElapsed', formatRaceTime(snapshot.elapsedSec, 1));
  if (snapshot.tick === 0) return;
  const leaderName = app.race.displayNames[snapshot.leader];
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
  // The final order and gaps show at once, whatever the refresh interval.
  updateTower(raceSnapshot(app.race, 0));
}

/**
 * buildTower() → one row per place, reused for the whole race: place, a swatch in the car's
 * color, the name and the gap to the leader. The first TOWER_MAJOR_ROWS are full width, the rest
 * minor.
 */
function buildTower() {
  towerRows = [];
  for (let i = 0; i < app.race.carCount; i++) {
    towerRows.push(makeEl('li', i < TOWER_MAJOR_ROWS ? null : { class: 'is-minor' },
      makeEl('span', { class: 'place' }, String(i + 1)),
      makeEl('span', { class: 'swatch' }, ''),
      makeEl('span', { class: 'name' }, ''),
      makeEl('span', { class: 'gap' }, '')));
  }
  byId('towerRows').replaceChildren(...towerRows);
  lastOrder = new Int32Array(app.race.carCount).fill(-1);
  lastPlaceOfCar = new Int32Array(app.race.carCount).fill(-1);
  fitTower();
}

/**
 * setTowerRow(i, car, gapText, isLeader) → row i shows `car` (name and swatch rewritten only
 * when the car in that place changed) with the gap text; the leader row carries the accent.
 */
function setTowerRow(i, car, gapText, isLeader) {
  const row = towerRows[i];
  if (lastOrder[i] !== car) {
    lastOrder[i] = car;
    row.children[ROW_NAME].textContent = car < 0 ? '—' : app.race.displayNames[car];
    row.children[ROW_SWATCH].style.backgroundColor = car < 0 ? 'transparent' : carColor(car);
  }
  if (row.children[ROW_GAP].textContent !== gapText) row.children[ROW_GAP].textContent = gapText;
  row.classList.toggle('is-leader', isLeader);
}

/**
 * flashRow(row, className) → the row's background flashes green (`is-up`) or red (`is-down`)
 * for a place gained or lost (Rich, 2026-11-01); the class is re-added so a second move
 * restarts the animation.
 */
function flashRow(row, className) {
  row.classList.remove('is-up', 'is-down');
  void row.offsetWidth;
  row.classList.add(className);
}

/**
 * finishedGapText(car, winner) → the gap column once a car has crossed: the winner's own time,
 * the others' exact gap to the winner.
 */
function finishedGapText(car, winner) {
  const tickSec = 1 / app.config.ticksPerSecond;
  if (car === winner) return formatRaceTime(app.race.finishTick[car] * tickSec, 1);
  return `+${((app.race.finishTick[car] - app.race.finishTick[winner]) * tickSec).toFixed(1)}`;
}

/**
 * updateTower(snapshot) → every row follows the live order, at the tower's refresh interval.
 * The gap is blank before lights out and on the leader's row; a running car shows its distance
 * to the leader divided by its own speed; a crossed car its exact gap to the winner (the
 * winner, its time). A car that moved up since the last refresh flashes its row green, one
 * that dropped flashes red.
 */
function updateTower(snapshot) {
  const { order, leader } = snapshot;
  const isStarted = snapshot.tick > 0;
  const winner = app.race.finishOrder[0];
  for (let i = 0; i < towerRows.length; i++) {
    const car = order[i];
    const lastPlace = lastPlaceOfCar[car];
    if (isStarted && lastPlace >= 0 && lastPlace !== i) {
      flashRow(towerRows[i], i < lastPlace ? 'is-up' : 'is-down');
    }
    lastPlaceOfCar[car] = i;
    let gapText = '';
    if (isStarted && app.race.place[car] > 0) {
      gapText = finishedGapText(car, winner);
    } else if (isStarted && i > 0) {
      const speed = Math.max(GAP_SPEED_FLOOR, snapshot.speed[car]);
      const gapSec = (snapshot.distance[leader] - snapshot.distance[car]) / speed;
      gapText = `+${Math.max(0, gapSec).toFixed(1)}`;
    }
    setTowerRow(i, car, gapText, i === 0 && isStarted);
  }
}

/**
 * fitTower() → shows as many places as fit the tower's height (towerMaxRows at most), hiding
 * from the end until nothing overflows, then "+ n more".
 */
function fitTower() {
  if (!towerRows.length) return;
  const tower = byId('tower');
  const more = byId('towerMore');
  let visible = Math.min(towerRows.length, app.config.towerMaxRows);
  for (let i = 0; i < towerRows.length; i++) towerRows[i].hidden = i >= visible;
  const showMore = () => {
    more.hidden = visible >= towerRows.length;
    more.textContent = `+ ${towerRows.length - visible} more`;
  };
  showMore();
  while (visible > 1 && tower.scrollHeight > tower.clientHeight + 1) {
    visible--;
    towerRows[visible].hidden = true;
    showMore();
  }
}

/**
 * onStageResize() → the canvas follows its box; the tower refits; a paused or still frame is
 * redrawn so a resize never leaves a stale picture.
 */
function onStageResize() {
  if (app.phase !== 'race') return;
  const box = byId('stageWrap').getBoundingClientRect();
  resizeStage(box.width, box.height);
  fitTower();
  if (!app.race) return;
  if (app.isReducedMotion) {
    drawStill();
  } else if (!app.isPlaying) {
    drawCurrentFrame(performance.now());
  }
}

/**
 * pauseAndShowOverlay() → a tap on the stage pauses the race at once and dims the stage with the
 * controls large: Play, Reset race, Start over (Rich, 2026-11-01: a tap is a pause, never a
 * race running on behind a dimmed stage). The overlay stays until a button or a tap outside it;
 * a tap outside leaves the race paused with the stage clear, the bar showing Play.
 */
function pauseAndShowOverlay() {
  if (!app.race) return;
  pauseRace();
  app.clock.isHiddenPause = false;
  byId('stageOverlay').hidden = false;
}

/**
 * hideOverlay() → clears the tapped-stage overlay; the race stays as it is.
 */
function hideOverlay() {
  byId('stageOverlay').hidden = true;
}

/**
 * advanceReveal(clockMs, frameTimeMs) → the reduced-motion reveal: the tower fills from last
 * place up to first over revealSec, so the winner comes last (with a big field only the last
 * reveals are in the visible rows); then the finish hold runs as usual. The HUD shows the
 * winner's time once revealed.
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
  const winner = app.race.finishOrder[0];
  for (let i = 0; i < towerRows.length; i++) {
    const car = app.race.finishOrder[i];
    const isShown = i >= firstShown;
    const gapText = isShown ? finishedGapText(car, winner) : '';
    setTowerRow(i, isShown ? car : -1, gapText, i === 0 && isShown);
  }
  const isWinnerShown = firstShown === 0;
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
