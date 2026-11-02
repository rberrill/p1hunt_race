// Shared foundations for the shell: the one app state object, DOM helpers that never parse
// HTML, the phase switch, the card over the page, downloads and formatting. Every other app
// module imports from here; this module imports only the config.
import { CONFIG } from '../config.js?v=0.1.0-dev.26';

// The three phases, in loop order. Each is a <section> in index.html; one shows at a time.
export const PHASES = ['control', 'race', 'winner'];

// Everything the modules share. Transient drawing state stays in stage.js; everything about the
// list, the setup, the race in progress and the record is here.
export const app = {
  config: CONFIG,
  overrides: {},
  phase: 'control',
  entrantsText: '',
  seed: '',
  durationSec: CONFIG.durationSec,
  gridEntrants: [],
  gridDisplayNames: [],
  isGridStale: true,
  raceInputs: null,
  race: null,
  isPlaying: false,
  isReducedMotion: false,
  clock: { playingMs: 0, resumedAtMs: null, isHiddenPause: false, lastFrameMs: 0 },
  finishedAtClockMs: null,
  lastResult: null,
  savedAtMs: 0,
  resumedVersion: '',
  isBackFromRace: false,
};

// The phone layout's media query (the Finisher's line; Rich, 2026-11-01).
export const phoneMedia = matchMedia('(max-width: 760px)');

/**
 * byId(id) → the element with that id. Fails loudly when index.html and the code disagree.
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el;
}

/**
 * makeEl(tag, attributes, ...children) → an element built without parsing HTML.
 * Strings become text nodes, so data can never turn into markup. An attribute that is null,
 * undefined or false is left off; true sets it empty.
 */
export function makeEl(tag, attributes, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value == null || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  el.append(...children.flat().filter(child => child != null && child !== false));
  return el;
}

/**
 * setText(id, text) → sets an element's text content (never markup).
 */
export function setText(id, text) {
  byId(id).textContent = text;
}

/**
 * showPhase(name) → shows one phase section and hides the other two. The body carries a
 * `phase-<name>` class for the stylesheet; focus moves to the phase so a keyboard user lands
 * in it.
 */
export function showPhase(name) {
  for (const phase of PHASES) {
    const el = byId(`phase${phase[0].toUpperCase()}${phase.slice(1)}`);
    el.hidden = phase !== name;
    document.body.classList.toggle(`phase-${phase}`, phase === name);
  }
  app.phase = name;
  window.scrollTo(0, 0);
}

// The card's buttons; replaced on each showCard so an old handler never fires.
let cardHandlers = { primary: null, secondary: null };

/**
 * showCard({ kicker, title, body, bodyMore, primary, secondary }) → shows the card over the
 * dimmed page (the Resume question, Clear's confirmation). `primary` and `secondary` are
 * { label, onClick }; the phases are made inert so nothing behind the card is tappable.
 */
export function showCard(options) {
  setText('cardKicker', options.kicker || '');
  setText('cardTitle', options.title);
  setText('cardBody', options.body || '');
  setText('cardBodyMore', options.bodyMore || '');
  byId('cardBodyMore').hidden = !options.bodyMore;
  setText('cardPrimary', options.primary.label);
  setText('cardSecondary', options.secondary.label);
  cardHandlers = { primary: options.primary.onClick, secondary: options.secondary.onClick };
  for (const phase of PHASES) {
    byId(`phase${phase[0].toUpperCase()}${phase.slice(1)}`).setAttribute('inert', '');
  }
  byId('cardBackdrop').hidden = false;
  byId('cardPrimary').focus();
}

/**
 * hideCard() → hides the card and makes the phases tappable again.
 */
export function hideCard() {
  byId('cardBackdrop').hidden = true;
  for (const phase of PHASES) {
    byId(`phase${phase[0].toUpperCase()}${phase.slice(1)}`).removeAttribute('inert');
  }
}

/**
 * initCard() → wires the card's two buttons once. Each click hides the card, then runs the
 * handler showCard installed.
 */
export function initCard() {
  byId('cardPrimary').addEventListener('click', () => {
    hideCard();
    if (cardHandlers.primary) cardHandlers.primary();
  });
  byId('cardSecondary').addEventListener('click', () => {
    hideCard();
    if (cardHandlers.secondary) cardHandlers.secondary();
  });
}

/**
 * announce(text) → speaks a line through the ARIA live region (the leader, the winner).
 */
export function announce(text) {
  setText('liveRegion', text);
}

// Downloads go through this object so the test hook can wrap `download` and capture the file
// instead of reading the browser's download folder.
export const files = {
  /**
   * download(blob, filename) → saves a Blob through a temporary link.
   */
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = makeEl('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};

/**
 * formatRaceTime(seconds, decimals) → 'm:ss.d' (decimals 1) or 'm:ss.ddd' (decimals 3).
 * Race time, counting up; never a countdown.
 */
export function formatRaceTime(seconds, decimals) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const text = rest.toFixed(decimals);
  const padded = rest < 10 ? `0${text}` : text;
  return `${minutes}:${padded}`;
}

/**
 * formatSavedAt(savedAtMs, nowMs) → 'today 09:52' or '1 Nov 2026 09:52' (local time).
 */
export function formatSavedAt(savedAtMs, nowMs) {
  const saved = new Date(savedAtMs);
  const now = new Date(nowMs);
  const time = saved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isToday = saved.toDateString() === now.toDateString();
  if (isToday) return `today ${time}`;
  const date = saved.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} ${time}`;
}

/**
 * fileStamp(nowMs) → 'yyyymmdd-hhmm' for export filenames, local time.
 */
export function fileStamp(nowMs) {
  const date = new Date(nowMs);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/**
 * renderTunedChips() → shows the "Tuned link" chip in every phase's header when link overrides
 * are in effect, with the pairs, so the stream shows a tweaked race as tweaked (Claude's call).
 */
export function renderTunedChips() {
  const keys = Object.keys(app.overrides).sort();
  const text = keys.length
    ? `Tuned link · ${keys.map(key => `${key}=${app.overrides[key]}`).join(' ')}`
    : '';
  for (const id of ['controlTuned', 'raceTuned', 'winnerTuned']) {
    setText(id, text);
    byId(id).hidden = !keys.length;
  }
}
