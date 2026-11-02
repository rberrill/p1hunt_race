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
} from '../engine.js?v=0.1.0-dev.39';
import {
  app,
  byId,
  makeEl,
  setText,
  showPhase,
  announce,
  formatRaceTime,
  phoneMedia,
} from './core.js?v=0.1.0-dev.39';
import {
  initStage,
  resizeStage,
  setScene,
  drawFrame,
  drawStill,
  carColor,
} from './stage.js?v=0.1.0-dev.39';

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
const ROW_PLACE = 0;
const ROW_SWATCH = 1;
const ROW_NAME = 2;
const ROW_GAP = 3;

let onRaceFinished = null;
let frameHandle = 0;
let panelDueMs = 0;
let towerDueMs = 0;
// The tower and the names on the cars are held back through the countdown and the first
// refresh interval of the race, on purpose (Rich, 2026-11-02): the field gets a moment to
// leave the line and spread before the places show.
let isTowerHeld = false;
let announceDueMs = 0;
// The tower is one row per car (indexed by car), each sitting at the slot of its place and
// sliding to a new slot when its place changes (Rich, 2026-11-02); the slots are arithmetic
// from the row heights and gap the stylesheet declares.
let towerRows = [];
let rowSlot = null;
let visibleSlots = 0;
const towerMetrics = {
  majorPx: 0, minorPx: 0, gapPx: 0, morePx: 0, majorFontPx: 0, minorFontPx: 0,
};
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
  setTowerHeld(!app.isReducedMotion);
  towerDueMs = 0;
  setText('hudSeed', app.race.seed);
  setText('hudElapsed', formatRaceTime(app.race.durationSec, 1));
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
 * state, then the HUD and the tower at their own pace. The tower and the names stay held
 * until the race clock reaches the first refresh interval after lights out (Rich, 2026-11-02);
 * the clock, not the frame time, so a pause in the countdown holds them too.
 */
function drawCurrentFrame(frameTimeMs, tickFraction = 0, clockMs = raceClockMs(frameTimeMs)) {
  const snapshot = raceSnapshot(app.race, tickFraction);
  const frameDeltaSec = Math.min(0.1, Math.max(0, (frameTimeMs - lastDrawMs) / 1000));
  lastDrawMs = frameTimeMs;
  const isHeld = clockMs < app.config.towerRefreshMs;
  drawFrame(snapshot, {
    frameDeltaSec,
    frameTimeMs,
    lightsLit: lightsLit(clockMs),
    isLabelled: !isHeld,
  });
  if (frameTimeMs >= panelDueMs) {
    panelDueMs = frameTimeMs + PANEL_INTERVAL_MS;
    updateHud(snapshot, frameTimeMs);
  }
  if (isHeld) return;
  if (isTowerHeld) {
    towerDueMs = frameTimeMs + app.config.towerRefreshMs;
    revealTower(snapshot);
  } else if (frameTimeMs >= towerDueMs) {
    towerDueMs = frameTimeMs + app.config.towerRefreshMs;
    updateTower(snapshot, true);
  }
}

/**
 * setTowerHeld(isHeld) → the tower kept out of sight (its box stays, so the fit still
 * measures) or shown.
 */
function setTowerHeld(isHeld) {
  isTowerHeld = isHeld;
  byId('tower').classList.toggle('is-held', isHeld);
}

/**
 * revealTower(snapshot) → the tower's first appearance: every row already at the slot of its
 * place, with no slide from the list order and no flash (there is no earlier order to have
 * moved from), then shown and live.
 */
function revealTower(snapshot) {
  const list = byId('towerRows');
  list.classList.remove('is-live');
  updateTower(snapshot, false);
  void list.offsetHeight;
  list.classList.add('is-live');
  setTowerHeld(false);
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
 * updateHud(snapshot, frameTimeMs) → the session clock: the duration counting down from lights
 * out, held at 0:00.0 once passed while the tail crosses (Rich, 2026-11-02: the clock at the top
 * is the session time; each car's finish time counts up and is what the results report). The
 * leader is announced to the live region now and then (the tower's first row shows it).
 */
function updateHud(snapshot, frameTimeMs) {
  setText('hudElapsed', formatRaceTime(app.race.durationSec - snapshot.elapsedSec, 1));
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
 * readTowerMetrics() → the row heights and the gap from the tower's custom properties (the
 * phone block sets its own), and the "+ n more" line's height, so a slot's top is arithmetic
 * and never a measurement of a row that may be mid-slide.
 */
function readTowerMetrics() {
  const style = getComputedStyle(byId('tower'));
  const lengthPx = name => parseFloat(style.getPropertyValue(name)) || 0;
  towerMetrics.majorPx = lengthPx('--tower-major-height');
  towerMetrics.minorPx = lengthPx('--tower-minor-height');
  towerMetrics.gapPx = lengthPx('--tower-gap');
  towerMetrics.majorFontPx = lengthPx('--tower-major-font');
  towerMetrics.minorFontPx = lengthPx('--tower-minor-font');
  const more = byId('towerMore');
  const wasHidden = more.hidden;
  more.hidden = false;
  towerMetrics.morePx = more.getBoundingClientRect().height;
  more.hidden = wasHidden;
}

/**
 * slotTopPx(place) → the top of the slot for `place` (0-based) from the top of the list: the
 * major slots first, then the minor ones, each followed by the gap.
 */
function slotTopPx(place) {
  const majors = Math.min(place, TOWER_MAJOR_ROWS);
  return majors * (towerMetrics.majorPx + towerMetrics.gapPx)
    + (place - majors) * (towerMetrics.minorPx + towerMetrics.gapPx);
}

/**
 * slotBottomPx(count) → the bottom of the last of `count` slots.
 */
function slotBottomPx(count) {
  const last = count - 1;
  const heightPx = last < TOWER_MAJOR_ROWS ? towerMetrics.majorPx : towerMetrics.minorPx;
  return slotTopPx(last) + heightPx;
}

/**
 * buildTower() → one row per car, kept for the whole race: its place, a swatch in its color,
 * its name and the gap to the leader. Every row starts at the slot of its list index (the
 * order at tick 0), laid out before the slides are switched on (`is-live`), so the first
 * refresh never animates from the top of the list.
 */
function buildTower() {
  towerRows = [];
  for (let car = 0; car < app.race.carCount; car++) {
    const row = makeEl('li', null,
      makeEl('span', { class: 'place' }, ''),
      makeEl('span', { class: 'swatch' }, ''),
      makeEl('span', { class: 'name' }, app.race.displayNames[car]),
      makeEl('span', { class: 'gap' }, ''));
    row.children[ROW_SWATCH].style.backgroundColor = carColor(car);
    towerRows.push(row);
  }
  const list = byId('towerRows');
  list.classList.remove('is-live');
  list.classList.toggle('is-instant', app.isReducedMotion);
  list.replaceChildren(...towerRows);
  rowSlot = new Int32Array(app.race.carCount).fill(-1);
  for (let car = 0; car < app.race.carCount; car++) rowSlot[car] = car;
  fitTower();
  void list.offsetHeight;
  list.classList.add('is-live');
}

/**
 * placeRow(car, place) → the car's row sits at the slot of `place`: its number, its size
 * (major or minor) and its top, which the stylesheet slides while the list is live; hidden
 * when the slot is past what fits.
 */
function placeRow(car, place) {
  const row = towerRows[car];
  rowSlot[car] = place;
  row.children[ROW_PLACE].textContent = String(place + 1);
  row.classList.toggle('is-minor', place >= TOWER_MAJOR_ROWS);
  if (place >= TOWER_MAJOR_ROWS) row.children[ROW_NAME].style.fontSize = '';
  row.style.top = `${slotTopPx(place)}px`;
  row.hidden = place >= visibleSlots;
}

/**
 * setRowGap(car, gapText, isLeader) → the row's gap text (rewritten only when it changed) and
 * the leader accent.
 */
function setRowGap(car, gapText, isLeader) {
  const row = towerRows[car];
  if (row.children[ROW_GAP].textContent !== gapText) row.children[ROW_GAP].textContent = gapText;
  row.classList.toggle('is-leader', isLeader);
}

/**
 * fitRowName(car) → a major row's name shrunk to fit beside its gap, measured like the Winner
 * hero, from the major size down to the minor rows' size (Rich, 2026-11-02: a top-three name
 * is never cut; below that size the ellipsis is the last resort, Claude's call). A name that
 * fits keeps the row's own size, so it eases with the row's slide; a shrunk one snaps, since
 * the probe needs the span free of transitions. Measured at the major size, so a row sliding
 * up fits before it has grown. A minor row's name is left to its row.
 */
function fitRowName(car) {
  const row = towerRows[car];
  const name = row.children[ROW_NAME];
  if (row.classList.contains('is-minor')) return;
  const majorPx = towerMetrics.majorFontPx;
  name.style.fontSize = `${majorPx}px`;
  const availablePx = name.clientWidth;
  const range = document.createRange();
  range.selectNodeContents(name);
  const textPx = range.getBoundingClientRect().width;
  if (textPx <= availablePx) {
    name.style.fontSize = '';
    return;
  }
  const fittedPx = Math.max(towerMetrics.minorFontPx, (majorPx * availablePx) / textPx);
  name.style.fontSize = `${Math.floor(fittedPx)}px`;
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
 * updateTower(snapshot, isFlashed) → every row follows the live order, at the tower's refresh
 * interval. The gap is blank before lights out and on the leader's row; a running car shows
 * its distance to the leader divided by its own speed; a crossed car its exact gap to the
 * winner (the winner, its time). A car whose place changed since the last refresh slides to
 * its new slot (Rich, 2026-11-02) and, when `isFlashed`, flashes its row green for a place
 * gained, red for one lost.
 */
function updateTower(snapshot, isFlashed = true) {
  const { order, leader } = snapshot;
  const isStarted = snapshot.tick > 0;
  const winner = app.race.finishOrder[0];
  for (let i = 0; i < towerRows.length; i++) {
    const car = order[i];
    const lastPlace = rowSlot[car];
    if (lastPlace !== i) {
      placeRow(car, i);
      if (isFlashed) flashRow(towerRows[car], i < lastPlace ? 'is-up' : 'is-down');
    }
    let gapText = '';
    if (isStarted && app.race.place[car] > 0) {
      gapText = finishedGapText(car, winner);
    } else if (isStarted && i > 0) {
      const speed = Math.max(GAP_SPEED_FLOOR, snapshot.speed[car]);
      const gapSec = (snapshot.distance[leader] - snapshot.distance[car]) / speed;
      gapText = `+${Math.max(0, gapSec).toFixed(1)}`;
    }
    setRowGap(car, gapText, i === 0 && isStarted);
    if (i < TOWER_MAJOR_ROWS) fitRowName(car);
  }
}

/**
 * fitTower() → shows as many slots as fit the tower's height (towerMaxRows at most), dropping
 * from the end until the slots and the "+ n more" line fit, then places every row again (the
 * metrics change with the phone block), sizes the list to the visible slots and shows the
 * "+ n more" line when places are left out. During the reduced-motion reveal the rows not yet
 * revealed stay hidden.
 */
function fitTower() {
  if (!towerRows.length) return;
  readTowerMetrics();
  const count = towerRows.length;
  const heightPx = byId('tower').clientHeight;
  const neededPx = slots => slotBottomPx(slots)
    + (slots < count ? towerMetrics.gapPx + towerMetrics.morePx : 0);
  let visible = Math.min(count, app.config.towerMaxRows);
  while (visible > 1 && neededPx(visible) > heightPx + 1) visible--;
  visibleSlots = visible;
  const firstRevealed = app.isReducedMotion ? count - revealedPlaces : 0;
  for (let car = 0; car < count; car++) {
    placeRow(car, rowSlot[car]);
    if (rowSlot[car] < firstRevealed) towerRows[car].hidden = true;
    if (rowSlot[car] < TOWER_MAJOR_ROWS) fitRowName(car);
  }
  byId('towerRows').style.height = `${slotBottomPx(visible)}px`;
  const more = byId('towerMore');
  more.hidden = visible >= count;
  more.textContent = `+ ${count - visible} more`;
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
 * renderReveal(revealedCount) → the last `revealedCount` places shown at their finish slots,
 * the slots above them left empty until their turn.
 */
function renderReveal(revealedCount) {
  const total = app.race.carCount;
  const firstShown = total - revealedCount;
  const winner = app.race.finishOrder[0];
  for (let i = 0; i < towerRows.length; i++) {
    const car = app.race.finishOrder[i];
    const isShown = i >= firstShown;
    if (rowSlot[car] !== i) placeRow(car, i);
    // Set outright: a row already in its finish slot is never re-placed, so its turn to show
    // would otherwise never un-hide it.
    towerRows[car].hidden = !isShown || i >= visibleSlots;
    setRowGap(car, isShown ? finishedGapText(car, winner) : '', i === 0 && isShown);
    if (i < TOWER_MAJOR_ROWS) fitRowName(car);
  }
  // The session is over before the reveal starts; the winner's time is in its tower row.
  setText('hudElapsed', formatRaceTime(0, 1));
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
 * no animation frame involved (under reduced motion, the reveal step for that clock), and
 * returns the race's tick.
 */
export function frameAt(clockMs) {
  if (!app.race) return 0;
  if (app.isReducedMotion) {
    advanceReveal(clockMs, performance.now());
    return app.race.tick;
  }
  const owed = clockToTicks(app.race, clockMs);
  for (let i = 0; i < owed.ticksDue; i++) advanceTick(app.race);
  drawCurrentFrame(performance.now(), owed.tickFraction, clockMs);
  return app.race.tick;
}
