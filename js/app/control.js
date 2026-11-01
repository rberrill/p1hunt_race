// The Control phase: the entrant list (typed or imported from a CSV), the starting grid viewers
// confirm on stream, the seed with New and its Locked / Unlocked badge, the duration, and the
// Start race gate. The textarea is the single source of truth for the list (Claude's call): a
// CSV import is written into it one line per entrant, so one stored form feeds one sanitizer.
import { CONFIG } from '../config.js?v=0.1.0-dev.5';
import {
  parseEntrantText,
  parseCsv,
  expandEntrants,
  displayNames,
  csvTemplate,
  sanitizeSeed,
  seedFromBytes,
} from '../engine.js?v=0.1.0-dev.5';
import { app, byId, makeEl, setText, files, phoneMedia, showCard } from './core.js?v=0.1.0-dev.5';
import { saveSession } from './session.js?v=0.1.0-dev.5';

// The phone shows this many grid places before "Show all" (from the wireframe).
const PHONE_GRID_PREVIEW = 6;
// New seed draws this many random bytes for seedFromBytes (one per character).
const SEED_BYTE_COUNT = 8;

let isGridExpanded = false;
let onStartRequested = null;

/**
 * initControl({ onStart }) → wires every control of the phase. `onStart` runs when Start race
 * is pressed with a valid list.
 */
export function initControl(options) {
  onStartRequested = options.onStart;
  byId('tabType').addEventListener('click', () => showTab('type'));
  byId('tabImport').addEventListener('click', () => showTab('import'));
  byId('entrantText').addEventListener('input', onEntrantTextInput);
  byId('btnChooseCsv').addEventListener('click', () => byId('csvFile').click());
  byId('csvFile').addEventListener('change', onCsvChosen);
  byId('btnLoadGrid').addEventListener('click', loadGrid);
  byId('btnClear').addEventListener('click', confirmClear);
  byId('btnTemplate').addEventListener('click', downloadTemplate);
  byId('btnShowGrid').addEventListener('click', () => {
    isGridExpanded = true;
    renderGrid();
  });
  byId('seedInput').addEventListener('input', onSeedInput);
  byId('btnNewSeed').addEventListener('click', () => setSeed(newSeedText(), true));
  byId('durationInput').addEventListener('input', onDurationInput);
  byId('btnStart').addEventListener('click', () => {
    if (!startProblem()) onStartRequested();
  });
  phoneMedia.addEventListener('change', renderGrid);
}

/**
 * showTab(name) → 'type' or 'import': switches the Entrants panel's pane.
 */
function showTab(name) {
  const isType = name === 'type';
  byId('tabType').setAttribute('aria-selected', String(isType));
  byId('tabImport').setAttribute('aria-selected', String(!isType));
  byId('paneType').hidden = !isType;
  byId('paneImport').hidden = isType;
}

/**
 * onEntrantTextInput() → the textarea changed: the grid is stale until Load grid.
 */
function onEntrantTextInput() {
  app.entrantsText = byId('entrantText').value;
  app.isGridStale = true;
  refreshControl();
  saveSession();
}

/**
 * setEntrantsText(text, isUserChange) → replaces the list (an import, a resume). A user change
 * is saved; a restore is not re-saved.
 */
export function setEntrantsText(text, isUserChange) {
  app.entrantsText = typeof text === 'string' ? text : '';
  byId('entrantText').value = app.entrantsText;
  app.isGridStale = true;
  refreshControl();
  if (isUserChange) saveSession();
}

/**
 * entrantRows() → the textarea's rows through the engine's parser (blank lines ignored).
 */
function entrantRows() {
  return parseEntrantText(app.entrantsText).rows;
}

/**
 * entrantCount() → how many entrants the list holds.
 */
export function entrantCount() {
  return entrantRows().length;
}

/**
 * startProblem() → '' when Start race may run, else the message that says what to do.
 */
export function startProblem() {
  const count = entrantCount();
  if (count < CONFIG.minEntrants) {
    const missing = CONFIG.minEntrants - count;
    return count === 0
      ? `Add at least ${CONFIG.minEntrants} entrants`
      : `Add ${missing} more entrant${missing === 1 ? '' : 's'}`;
  }
  if (count > CONFIG.maxEntrants) {
    return `${CONFIG.maxEntrants} at most: remove ${count - CONFIG.maxEntrants}`;
  }
  return '';
}

/**
 * onCsvChosen() → reads the chosen CSV file and imports it.
 */
async function onCsvChosen() {
  const input = byId('csvFile');
  const file = input.files && input.files[0];
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch (error) {
    renderProblems([`${file.name}: the file could not be read`]);
    return;
  }
  input.value = '';
  importCsvText(text);
}

/**
 * importCsvText(text) → parses the CSV, expands spots and writes one line per entrant into the
 * textarea, then shows the Type names pane with any problems listed under the tabs.
 */
export function importCsvText(text) {
  const { rows, problems } = parseCsv(text);
  const lines = expandEntrants(rows).map(entrant => entrant.name);
  const notes = [...problems];
  if (!lines.length) notes.push('No names found in the file');
  if (lines.length > CONFIG.maxEntrants) {
    notes.push(`${lines.length} entrants: ${CONFIG.maxEntrants} at most`);
  }
  if (lines.length) setEntrantsText(lines.join('\n'), true);
  renderProblems(notes);
  showTab('type');
}

/**
 * renderProblems(lines) → lists import problems under the tabs; an empty list clears them.
 */
function renderProblems(lines) {
  const list = byId('importProblems');
  list.replaceChildren(...lines.map(line => makeEl('li', null, line)));
  list.hidden = !lines.length;
}

/**
 * loadGrid() → builds the starting grid from the textarea and locks the seed to it.
 */
export function loadGrid() {
  app.gridEntrants = expandEntrants(entrantRows());
  app.gridDisplayNames = displayNames(app.gridEntrants);
  app.isGridStale = false;
  isGridExpanded = false;
  renderGrid();
  refreshControl();
}

/**
 * renderGrid() → the numbered grid cards in typed order. The phone shows the first six and a
 * Show all button until expanded.
 */
function renderGrid() {
  const names = app.gridDisplayNames;
  const isPhone = phoneMedia.matches;
  const isCut = isPhone && !isGridExpanded && names.length > PHONE_GRID_PREVIEW;
  const shown = isCut ? names.slice(0, PHONE_GRID_PREVIEW) : names;
  const items = shown.map((name, index) => makeEl('li', null,
    makeEl('span', { class: 'place' }, String(index + 1)),
    makeEl('span', { class: 'name' }, name)));
  byId('startingGrid').replaceChildren(...items);
  const showAll = byId('btnShowGrid');
  showAll.hidden = !isCut;
  showAll.textContent = `Show all ${names.length}`;
}

/**
 * confirmClear() → asks before emptying the list (Rich, 2026-11-01: a confirmation, so a stray
 * tap on stream can't wipe a 75-name list). An empty list clears without asking.
 */
function confirmClear() {
  const count = entrantCount();
  if (!count) {
    clearList();
    return;
  }
  showCard({
    kicker: 'Clear the list',
    title: `Clear ${count} entrant${count === 1 ? '' : 's'}?`,
    body: 'The names come out of the list and the grid. The seed and duration stay.',
    primary: { label: 'Clear', onClick: clearList },
    secondary: { label: 'Keep', onClick: null },
  });
}

/**
 * clearList() → empties the textarea and the grid.
 */
function clearList() {
  setEntrantsText('', true);
  app.gridEntrants = [];
  app.gridDisplayNames = [];
  app.isGridStale = true;
  renderProblems([]);
  renderGrid();
  refreshControl();
}

/**
 * downloadTemplate() → the CSV template as a file.
 */
function downloadTemplate() {
  const blob = new Blob([csvTemplate()], { type: 'text/csv' });
  files.download(blob, 'p1hunt-race-template.csv');
}

/**
 * newSeedText() → 'XXXX-XXXX' from the browser's random bytes (the engine formats them).
 */
export function newSeedText() {
  const bytes = new Uint8Array(SEED_BYTE_COUNT);
  crypto.getRandomValues(bytes);
  return seedFromBytes(bytes);
}

/**
 * onSeedInput() → the seed field changed.
 */
function onSeedInput() {
  app.seed = sanitizeSeed(byId('seedInput').value);
  refreshControl();
  saveSession();
}

/**
 * setSeed(text, isUserChange) → sets the seed field and state. The text is shown as typed; the
 * race folds its case.
 */
export function setSeed(text, isUserChange) {
  app.seed = sanitizeSeed(text);
  byId('seedInput').value = app.seed;
  refreshControl();
  if (isUserChange) saveSession();
}

/**
 * onDurationInput() → the slider moved.
 */
function onDurationInput() {
  setDuration(Number(byId('durationInput').value), true);
}

/**
 * setDuration(seconds, isUserChange) → sets the duration within the slider's range.
 */
export function setDuration(seconds, isUserChange) {
  const slider = byId('durationInput');
  const min = Number(slider.min);
  const max = Number(slider.max);
  const value = Math.min(max, Math.max(min, Number(seconds) || CONFIG.durationSec));
  app.durationSec = value;
  slider.value = String(value);
  setText('durationOut', `${value} s`);
  if (isUserChange) saveSession();
}

/**
 * refreshControl() → the count badge, the Start race gate and its message, the seed badge, the
 * setup readouts and the stale-grid note.
 */
export function refreshControl() {
  const count = entrantCount();
  const problem = startProblem();
  setText('entrantCount', `${count} racer${count === 1 ? '' : 's'}`);
  setText('setupEntrants', String(count));
  const gridCount = app.gridDisplayNames.length;
  let gridText = 'Empty';
  if (gridCount && app.isGridStale) gridText = `${gridCount} (list changed)`;
  if (gridCount && !app.isGridStale) gridText = `${gridCount} loaded`;
  setText('setupGrid', gridText);
  const isLocked = gridCount > 0 && !app.isGridStale;
  const badge = byId('seedBadge');
  badge.textContent = isLocked ? 'Locked' : 'Unlocked';
  badge.classList.toggle('badge-locked', isLocked);
  const start = byId('btnStart');
  start.disabled = Boolean(problem) || !app.seed;
  let message = problem;
  if (!problem && !app.seed) message = 'Type a seed, or press New';
  if (!problem && app.seed && app.isGridStale && count) message = 'Ready (the grid loads first)';
  if (!problem && app.seed && !app.isGridStale) message = 'Ready';
  setText('startMessage', message);
}

/**
 * showBackLine(text) → the line above the columns after a race or a resume; '' hides it.
 */
export function showBackLine(text) {
  const line = byId('backLine');
  line.textContent = text;
  line.hidden = !text;
}
