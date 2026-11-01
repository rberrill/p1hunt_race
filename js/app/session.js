// The saved session: the list, the seed, the duration and the last race's record in
// localStorage under CONFIG.storageKey, saved as changes are made and offered back on reload
// as a Resume / Start over question (the Finisher's rule; Rich, 2026-11-01). Everything read
// back goes through the engine's sanitizer.
import { CONFIG } from '../config.js?v=0.1.0-dev.9';
import { sanitizeStoredSession } from '../engine.js?v=0.1.0-dev.9';
import { app, showCard, formatSavedAt } from './core.js?v=0.1.0-dev.9';

let saveTimer = 0;

/**
 * readStorage() → the raw stored text, or null when storage is unavailable or empty.
 */
function readStorage() {
  try {
    return localStorage.getItem(CONFIG.storageKey);
  } catch (error) {
    return null;
  }
}

/**
 * loadStoredSession() → the sanitized session, or null when nothing usable is stored.
 */
export function loadStoredSession() {
  const stored = readStorage();
  return stored ? sanitizeStoredSession(stored) : null;
}

/**
 * sessionRecord() → what gets stored: the fields sanitizeStoredSession knows, from app.
 */
function sessionRecord() {
  return {
    version: CONFIG.appVersion,
    entrantsText: app.entrantsText,
    seed: app.seed,
    durationSec: app.durationSec,
    lastResult: app.lastResult,
    savedAtMs: app.savedAtMs,
  };
}

/**
 * saveSessionNow() → writes the session at once. Storage that refuses (private mode, full) is
 * ignored: the app keeps working for this visit.
 */
export function saveSessionNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(sessionRecord()));
  } catch (error) {
    /* storage unavailable: nothing to resume later, nothing else changes */
  }
}

/**
 * saveSession() → saves after a short pause, so typing doesn't write on every key.
 */
export function saveSession() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionNow, CONFIG.saveDebounceMs);
}

/**
 * clearStoredSession() → removes the saved session (Start over on the card).
 */
export function clearStoredSession() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    localStorage.removeItem(CONFIG.storageKey);
  } catch (error) {
    /* nothing stored, nothing to remove */
  }
}

/**
 * entrantCountOf(text) → how many non-blank lines a saved list has.
 */
function entrantCountOf(text) {
  return text.split('\n').filter(line => line.trim()).length;
}

/**
 * offerResume(session, onResume, onStartOver) → the Resume / Start over card over the dimmed
 * Control page, describing what was saved. Nothing behind it is tappable.
 */
export function offerResume(session, onResume, onStartOver) {
  const parts = [`${entrantCountOf(session.entrantsText)} entrants`, `${session.durationSec} s`];
  if (session.seed) parts.push(`seed ${session.seed}`);
  let lastRace = '';
  if (session.lastResult) {
    const winner = session.lastResult.places[0].displayName;
    const when = session.savedAtMs ? `, ${formatSavedAt(session.savedAtMs, Date.now())}` : '';
    lastRace = `Last race: ${winner} won${when}`;
  }
  showCard({
    kicker: 'Last session',
    title: 'Pick up where you left off?',
    body: parts.join(' · '),
    bodyMore: lastRace,
    primary: { label: 'Resume', onClick: onResume },
    secondary: { label: 'Start over', onClick: onStartOver },
  });
}
