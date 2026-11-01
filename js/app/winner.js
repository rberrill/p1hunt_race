// The Winner phase: the winner large, the full finish order with times, the exports (CSV, JSON,
// Copy result where the clipboard exists) and the two ways out: Re-run this race (identical
// result) and Start over (list kept, new seed).
import { CONFIG } from '../config.js?v=0.1.0-dev.9';
import { resultToCsv, resultToJson } from '../engine.js?v=0.1.0-dev.9';
import {
  app,
  byId,
  makeEl,
  setText,
  showPhase,
  files,
  formatRaceTime,
  formatSavedAt,
  fileStamp,
  phoneMedia,
} from './core.js?v=0.1.0-dev.9';

// The phone shows this many places before "Show all" (from the wireframe).
const PHONE_FINISH_PREVIEW = 8;
// The winner's name is sized to the hero's width: the font size is the width over the name's
// length times this factor (a heavy sans averages about 0.6 em per character), within bounds.
const NAME_WIDTH_PER_CHARACTER = 0.62;
const NAME_FONT_MIN_PX = 28;
const NAME_FONT_MAX_PX = 112;

let isFinishExpanded = false;

/**
 * initWinner({ onRerun, onStartOver }) → wires the phase once.
 */
export function initWinner(options) {
  byId('btnRerun').addEventListener('click', options.onRerun);
  byId('btnStartOver').addEventListener('click', options.onStartOver);
  byId('btnExportCsv').addEventListener('click', exportCsv);
  byId('btnExportJson').addEventListener('click', exportJson);
  byId('btnCopy').addEventListener('click', copyResult);
  byId('btnShowFinish').addEventListener('click', () => {
    isFinishExpanded = true;
    renderFinishOrder();
  });
  phoneMedia.addEventListener('change', () => {
    if (app.phase === 'winner') {
      renderFinishOrder();
      fitWinnerName();
    }
  });
  window.addEventListener('resize', () => {
    if (app.phase === 'winner') fitWinnerName();
  });
}

/**
 * showWinner() → renders app.lastResult and shows the phase.
 */
export function showWinner() {
  const result = app.lastResult;
  const winner = result.places[0];
  setText('winnerName', winner.displayName);
  const time = winner.timeSec === null ? 'no time' : formatRaceTime(winner.timeSec, 1);
  setText('winnerLine', `Checkered flag at ${time} · ${result.entrantCount} racers`
    + ` · seed ${result.seed}`);
  setText('finishCount', `${result.places.length} of ${result.entrantCount}`);
  setText('recordLine', `Record saved in this browser · `
    + `${formatSavedAt(app.savedAtMs, Date.now())} · ${CONFIG.appVersion}`);
  const canCopy = Boolean(navigator.clipboard && navigator.clipboard.writeText);
  byId('btnCopy').hidden = !canCopy;
  isFinishExpanded = false;
  renderFinishOrder();
  showPhase('winner');
  fitWinnerName();
}

/**
 * renderFinishOrder() → every place with its time; the phone shows eight and Show all.
 */
function renderFinishOrder() {
  const { places } = app.lastResult;
  const isCut = phoneMedia.matches && !isFinishExpanded && places.length > PHONE_FINISH_PREVIEW;
  const shown = isCut ? places.slice(0, PHONE_FINISH_PREVIEW) : places;
  const items = shown.map(entry => makeEl('li', { class: entry.place === 1 ? 'is-leader' : null },
    makeEl('span', { class: 'place' }, String(entry.place)),
    makeEl('span', { class: 'name' }, entry.displayName),
    makeEl('span', { class: 'time' },
      entry.timeSec === null ? '—' : formatRaceTime(entry.timeSec, 3))));
  byId('finishOrder').replaceChildren(...items);
  const showAll = byId('btnShowFinish');
  showAll.hidden = !isCut;
  showAll.textContent = `Show all ${places.length}`;
}

/**
 * fitWinnerName() → sizes the winner's name to the hero's width, so a 40-character name still
 * fits and a short one is as large as the space allows.
 */
function fitWinnerName() {
  const nameEl = byId('winnerName');
  const width = nameEl.parentElement.clientWidth - 32;
  const length = Math.max(3, nameEl.textContent.length);
  const fontPx = Math.min(
    NAME_FONT_MAX_PX,
    Math.max(NAME_FONT_MIN_PX, width / (length * NAME_WIDTH_PER_CHARACTER)),
  );
  nameEl.style.fontSize = `${Math.floor(fontPx)}px`;
}

/**
 * exportFilename(extension) → 'p1hunt-race-<seed>-<stamp>.<ext>', the seed made filename-safe.
 */
function exportFilename(extension) {
  const seedSafe = app.lastResult.seed.replace(/[^A-Za-z0-9-]+/g, '_');
  return `p1hunt-race-${seedSafe}-${fileStamp(Date.now())}.${extension}`;
}

/**
 * exportCsv() → the record as a CSV file.
 */
function exportCsv() {
  const blob = new Blob([resultToCsv(app.lastResult)], { type: 'text/csv' });
  files.download(blob, exportFilename('csv'));
}

/**
 * exportJson() → the record as a JSON file.
 */
function exportJson() {
  const blob = new Blob([resultToJson(app.lastResult)], { type: 'application/json' });
  files.download(blob, exportFilename('json'));
}

/**
 * copyResult() → the CSV text to the clipboard; the button says what happened for a moment.
 */
async function copyResult() {
  const button = byId('btnCopy');
  try {
    await navigator.clipboard.writeText(resultToCsv(app.lastResult));
    button.textContent = 'Copied';
  } catch (error) {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    button.textContent = 'Copy result';
  }, 2000);
}

/**
 * setRerunNote(text) → the line under Re-run (the identical-result promise, or the warning that
 * the record is from another version).
 */
export function setRerunNote(text) {
  setText('rerunNote', text);
}
