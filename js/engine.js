// The race engine: entrants + seed + duration in, a race tick by tick and the finish order out.
// Every function here is a function of its arguments. The shell owns the clock, the frame loop,
// storage and the page; the engine never reads them (tests/selftest.js counts the words), and
// it uses only arithmetic that every JavaScript engine rounds identically (+ - * /, floor, min,
// max, imul and shifts), so the same inputs give the same finish on every device.
//
// Sections: RANDOM, TEXT, ENTRANTS, TRACK, RACE, RESULT, SANITIZERS, SELF-TEST.
import { CONFIG, CONFIG_LIMITS } from './config.js?v=0.1.0-dev.20';

/* ==== RANDOM ==== */

// FNV-1a offset basis and prime for 32 bits (Fowler, Noll and Vo; public domain).
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
// The golden-ratio increment SplitMix walks its state with (Steele, Lea and Flood, 2014).
const GOLDEN_RATIO_32 = 0x9e3779b9;
// 2^32, to turn a 32-bit unsigned integer into a float in [0, 1).
const TWO_POW_32 = 4294967296;

/**
 * hashText(text) → 32-bit unsigned integer.
 * FNV-1a over the string's UTF-16 code units: hash = (hash XOR unit) * prime, from the offset
 * basis. Code units rather than UTF-8 bytes keep it dependency-free; the seed is still text.
 */
function hashText(text) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * mixWord(word) → 32-bit unsigned integer.
 * MurmurHash3's fmix32 finalizer (Appleby; public domain): h ^= h >>> 16; h *= 0x85ebca6b;
 * h ^= h >>> 13; h *= 0xc2b2ae35; h ^= h >>> 16. Used to expand one hash into the generator's
 * state words, SplitMix-style: word k is mixWord(hash + (k + 1) * golden ratio).
 * Formula names: h
 */
function mixWord(word) {
  let h = word | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * rotateLeft(value, bits) → 32-bit unsigned integer rotated left by `bits`.
 */
function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * seedKey(seedText) → the text the generator is seeded from.
 * The seed's case is folded (Rich's decision, 2026-11-01): a viewer retyping K7MX-4QZD from a
 * stream as k7mx-4qzd gets the same race. The seed is still shown as typed.
 */
function seedKey(seedText) {
  return seedText.toUpperCase();
}

/**
 * createRandom(seedText, purpose) → { nextUint32, nextFloat, nextBetween, nextInt }.
 * A xoshiro128** generator (Blackman and Vigna, 2018; public domain, their file
 * xoshiro128starstar.c) seeded from FNV-1a of `seedKey(seedText) + ':' + purpose`. Each
 * purpose ('track', 'lanes', 'car:7') is its own stream, so the draws one part of the race
 * takes never shift another part's.
 * Formula names: s0 s1 s2 s3 t
 */
function createRandom(seedText, purpose) {
  const hash = hashText(`${seedKey(seedText)}:${purpose}`);
  let s0 = mixWord(hash + Math.imul(1, GOLDEN_RATIO_32));
  let s1 = mixWord(hash + Math.imul(2, GOLDEN_RATIO_32));
  let s2 = mixWord(hash + Math.imul(3, GOLDEN_RATIO_32));
  let s3 = mixWord(hash + Math.imul(4, GOLDEN_RATIO_32));
  // xoshiro's one rule: the state must not be all zero.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  // The next 32-bit output: rotl(s1 * 5, 7) * 9, then the state update from the paper.
  const nextUint32 = () => {
    const result = Math.imul(rotateLeft(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotateLeft(s3, 11);
    return result;
  };
  // A float in [0, 1): an exact division by 2^32.
  const nextFloat = () => nextUint32() / TWO_POW_32;
  // A float in [min, max).
  const nextBetween = (min, max) => min + (max - min) * nextFloat();
  // An integer in [0, limit).
  const nextInt = limit => Math.floor(nextFloat() * limit);
  return { nextUint32, nextFloat, nextBetween, nextInt };
}

/* ==== TEXT ==== */

// Control characters, which never belong in a name or a seed (C0, DEL and C1).
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
// The seed alphabet: 32 characters, none of 0 O 1 I, so a seed reads back from a stream
// without ambiguity; two groups of four (Rich's decision, 2026-11-01). 32 divides 256, so a
// byte modulo 32 is uniform.
const SEED_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SEED_GROUP_LENGTH = 4;
const SEED_BYTES = 8;

/**
 * cleanText(value, maxLength) → string.
 * Any value as plain text: control characters removed, whitespace collapsed to single spaces,
 * trimmed and capped. Markup is kept as text; the shell only ever sets it with textContent.
 */
function cleanText(value, maxLength) {
  const text = typeof value === 'string' ? value : '';
  return text
    .replace(/\s+/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * sanitizeName(value) → string. An entrant's name as plain text, at most maxNameLength.
 */
export function sanitizeName(value) {
  return cleanText(value, CONFIG.maxNameLength);
}

/**
 * sanitizeSeed(value) → string. The seed as plain text, at most maxSeedLength. Kept as typed
 * for display; the race folds its case (seedKey), so 'abc' and 'ABC' are the same race.
 */
export function sanitizeSeed(value) {
  return cleanText(value, CONFIG.maxSeedLength);
}

/**
 * seedFromBytes(bytes) → 'XXXX-XXXX'.
 * Formats 8 random bytes (the shell gets them from the browser's crypto) as a seed; the
 * engine never draws randomness itself. Fewer bytes repeat; more are ignored.
 */
export function seedFromBytes(bytes) {
  const characters = [];
  for (let i = 0; i < SEED_BYTES; i++) {
    const byte = bytes.length ? bytes[i % bytes.length] : 0;
    characters.push(SEED_ALPHABET[byte % SEED_ALPHABET.length]);
    if ((i + 1) % SEED_GROUP_LENGTH === 0 && i + 1 < SEED_BYTES) characters.push('-');
  }
  return characters.join('');
}

/* ==== ENTRANTS ==== */

// The CSV template's columns (Rich's decision, 2026-11-01); renaming them breaks files.
const CSV_NAME_COLUMN = 'name';
const CSV_SPOTS_COLUMN = 'spots';
// A spreadsheet runs a cell that starts with one of these; the exports prefix it with a quote.
const FORMULA_STARTERS = /^[=+\-@\t\r]/;

/**
 * parseEntrantText(text) → { rows: [{ name, spots: 1, line }], problems: [] }.
 * One name per line; blank lines are ignored; every name is cleaned. The same shape as
 * parseCsv so the shell treats the two sources alike.
 */
export function parseEntrantText(text) {
  const rows = [];
  const lines = typeof text === 'string' ? text.split(/\r\n|\r|\n/) : [];
  lines.forEach((lineText, index) => {
    const name = sanitizeName(lineText);
    if (name) rows.push({ name, spots: 1, line: index + 1 });
  });
  return { rows, problems: [] };
}

/**
 * splitCsv(text) → [{ line, fields: [string] }].
 * RFC 4180 fields: commas between fields, CRLF or LF between records, double quotes around a
 * field that holds commas, quotes or line breaks, with a quote doubled inside. `line` is the
 * line the record starts on (1-based), for the problem messages. A byte-order mark is dropped.
 */
function splitCsv(text) {
  const records = [];
  let fields = [];
  let field = '';
  let isQuoted = false;
  let line = 1;
  let recordLine = 1;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRecord = () => {
    fields.push(field);
    records.push({ line: recordLine, fields });
    fields = [];
    field = '';
    recordLine = line;
  };
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (isQuoted) {
      if (character === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        isQuoted = false;
      } else {
        if (character === '\n') line++;
        field += character;
      }
      continue;
    }
    if (character === '"') {
      isQuoted = true;
    } else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\r') {
      // Part of a CRLF, or a bare CR: the LF case below ends the record either way.
      if (source[i + 1] !== '\n') {
        line++;
        endRecord();
      }
    } else if (character === '\n') {
      line++;
      endRecord();
    } else {
      field += character;
    }
  }
  if (field !== '' || fields.length) endRecord();
  return records;
}

/**
 * csvColumns(firstRecord) → { nameColumn, spotsColumn, hasHeader }.
 * The template's header, case-insensitive and in either order, with other columns ignored. A
 * file with no `name` header is read as names in the first column (so a plain list imports).
 */
function csvColumns(firstRecord) {
  const headers = firstRecord ? firstRecord.fields.map(cell => cell.trim().toLowerCase()) : [];
  const nameColumn = headers.indexOf(CSV_NAME_COLUMN);
  if (nameColumn < 0) return { nameColumn: 0, spotsColumn: -1, hasHeader: false };
  return { nameColumn, spotsColumn: headers.indexOf(CSV_SPOTS_COLUMN), hasHeader: true };
}

/**
 * parseCsv(text) → { rows: [{ name, spots, line }], problems: ['line 7: …'] }.
 * The template's columns: `name` required, `spots` optional (blank = 1, else a whole number
 * from 1). A record with a problem is skipped and named by line; the rest import. Blank
 * records are ignored. Spots add up later, in expandEntrants.
 */
export function parseCsv(text) {
  const rows = [];
  const problems = [];
  const records = splitCsv(typeof text === 'string' ? text : '');
  const { nameColumn, spotsColumn, hasHeader } = csvColumns(records[0]);
  const body = hasHeader ? records.slice(1) : records;
  for (const record of body) {
    const isBlank = record.fields.every(cell => cell.trim() === '');
    if (isBlank) continue;
    const name = sanitizeName(record.fields[nameColumn]);
    if (!name) {
      problems.push(`line ${record.line}: no name`);
      continue;
    }
    const spotsText = spotsColumn < 0 ? '' : (record.fields[spotsColumn] || '').trim();
    let spots = 1;
    if (spotsText !== '') {
      spots = /^\d+$/.test(spotsText) ? Number(spotsText) : 0;
      if (spots < 1 || spots > CONFIG.maxEntrants) {
        problems.push(`line ${record.line}: spots must be a whole number from 1 to `
          + `${CONFIG.maxEntrants}, not "${spotsText.slice(0, 12)}"`);
        continue;
      }
    }
    rows.push({ name, spots, line: record.line });
  }
  return { rows, problems };
}

/**
 * csvTemplate() → string. The downloadable template: the header and three example rows.
 */
export function csvTemplate() {
  return `${CSV_NAME_COLUMN},${CSV_SPOTS_COLUMN}\nRich,3\nk2-7,\nSam,1\n`;
}

/**
 * expandEntrants(rows) → [{ name }].
 * Spots add up in list order: `Rich,3` becomes three consecutive Rich entrants, the same as
 * three lines of Rich. The result is the race's entrant list; its order is part of the input.
 */
export function expandEntrants(rows) {
  const entrants = [];
  for (const row of rows) {
    const spots = Number.isInteger(row.spots) && row.spots > 0 ? row.spots : 1;
    for (let i = 0; i < spots; i++) entrants.push({ name: row.name });
  }
  return entrants;
}

/**
 * displayNames(entrants) → [string].
 * A name that appears more than once gets -1, -2, … in list order, on display only (car
 * labels, the grid, the finish order). A unique name is unchanged. The dash and number read as
 * a suffix even on an alphanumeric username: k2-7 twice is k2-7-1 and k2-7-2.
 */
export function displayNames(entrants) {
  const counts = new Map();
  for (const entrant of entrants) counts.set(entrant.name, (counts.get(entrant.name) || 0) + 1);
  const seen = new Map();
  return entrants.map(entrant => {
    if (counts.get(entrant.name) === 1) return entrant.name;
    const ordinal = (seen.get(entrant.name) || 0) + 1;
    seen.set(entrant.name, ordinal);
    return `${entrant.name}-${ordinal}`;
  });
}

/* ==== TRACK ==== */

// Cruise speed in track units per second: the definition of a track unit.
const CRUISE_SPEED = 1;
// Straights can't scale below this share of their drawn length, so a duration too short for
// its turns still gives a track (the nominal time is then over the duration; a self-test
// checks the stock config never gets there), nor above this multiple.
const MIN_STRAIGHT_SCALE = 0.05;
const MAX_STRAIGHT_SCALE = 64;
// The straight scale is found by bisection (the speed profile makes a formula inexact):
// this many halvings of the scale range land the nominal car within a tick of the duration.
const SCALING_PASSES = 40;

/**
 * clamp(value, min, max) → value kept within [min, max].
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * orderedRange(low, high) → [min, max]. A tunable pair in the right order, whatever a link set.
 */
function orderedRange(low, high) {
  return [Math.min(low, high), Math.max(low, high)];
}

/**
 * drawTrackShape(seedText, durationSec, config) → { straightUnits, isLong, direction, apexSpeed }.
 * The seeded shape before scaling: the turn count (2 to 3 per 10 s of duration, Rich's call),
 * which straights are long (1 to 3 of them, Rich's call; never more than half, Claude's call),
 * each straight's length with its jitter, and each turn's direction and apex speed. All from
 * the 'track' stream, in a fixed order, so the shape depends on the seed and duration only.
 */
function drawTrackShape(seedText, durationSec, config) {
  const random = createRandom(seedText, 'track');
  const [turnsMin, turnsMax] = orderedRange(config.turnsPerTenSecMin, config.turnsPerTenSecMax);
  const turnsPerTenSec = random.nextBetween(turnsMin, turnsMax);
  const turnCount = Math.max(1, Math.round(durationSec / 10 * turnsPerTenSec));
  const straightCount = turnCount + 1;
  const [longMin, longMax] = orderedRange(config.longStraightsMin, config.longStraightsMax);
  const longLimit = Math.max(1, Math.floor(straightCount / 2));
  const longCount = clamp(longMin + random.nextInt(longMax - longMin + 1), 0, longLimit);
  const isLong = new Array(straightCount).fill(false);
  let placed = 0;
  while (placed < longCount) {
    const slot = random.nextInt(straightCount);
    if (isLong[slot]) continue;
    isLong[slot] = true;
    placed++;
  }
  const straightUnits = new Float64Array(straightCount);
  for (let i = 0; i < straightCount; i++) {
    const jitter = 1 + random.nextBetween(-config.straightJitter, config.straightJitter);
    straightUnits[i] = (isLong[i] ? config.longStraightRatio : 1) * jitter;
  }
  const direction = new Int32Array(turnCount);
  const apexSpeed = new Float64Array(turnCount);
  const [apexMin, apexMax] = orderedRange(config.apexSpeedMin, config.apexSpeedMax);
  for (let i = 0; i < turnCount; i++) {
    direction[i] = random.nextInt(2) === 0 ? -1 : 1;
    apexSpeed[i] = random.nextBetween(apexMin, apexMax);
  }
  return { straightUnits, isLong, direction, apexSpeed };
}

/**
 * layoutTrack(shape, scale, config) → track positions.
 * Lays the straights (scaled by `scale`) and the turn zones end to end along the road:
 * straightStart/End, then each turn's brakeStart, apex and exitEnd, in track units.
 */
function layoutTrack(shape, scale, config) {
  const turnCount = shape.direction.length;
  const straightStart = new Float64Array(turnCount + 1);
  const straightEnd = new Float64Array(turnCount + 1);
  const brakeStart = new Float64Array(turnCount);
  const apex = new Float64Array(turnCount);
  const exitEnd = new Float64Array(turnCount);
  let position = 0;
  for (let i = 0; i <= turnCount; i++) {
    straightStart[i] = position;
    position += shape.straightUnits[i] * scale;
    straightEnd[i] = position;
    if (i === turnCount) break;
    brakeStart[i] = position;
    apex[i] = position + config.brakeZoneUnits;
    exitEnd[i] = apex[i] + config.exitZoneUnits;
    position = exitEnd[i];
  }
  return {
    turnCount,
    straightStart,
    straightEnd,
    brakeStart,
    apex,
    exitEnd,
    direction: shape.direction,
    apexSpeed: shape.apexSpeed,
    isLong: shape.isLong,
    totalUnits: position,
    finishUnits: position,
    topSpeed: config.straightTopSpeed,
  };
}

/**
 * targetSpeedAt(track, distance, turnIndex) → the track's target speed at `distance`.
 * The top speed on a straight (a car builds toward it at its acceleration rate, so a short
 * straight never gets there); falling linearly from the top speed to the apex speed through
 * the braking zone; rising linearly back to cruise through the exit zone, after which the
 * straight pulls the car on. `turnIndex` is the first turn the car has not left yet (the caller
 * keeps it current), and the next turn is checked too because a very short straight lets two
 * zones touch; the lower target wins.
 */
function targetSpeedAt(track, distance, turnIndex) {
  const topSpeed = track.topSpeed;
  let target = topSpeed;
  const last = Math.min(turnIndex + 1, track.turnCount - 1);
  for (let i = turnIndex; i <= last; i++) {
    const apexSpeed = track.apexSpeed[i];
    let turnTarget = topSpeed;
    if (distance >= track.exitEnd[i] || distance < track.brakeStart[i]) {
      turnTarget = topSpeed;
    } else if (distance < track.apex[i]) {
      const brakeUnits = track.apex[i] - track.brakeStart[i];
      const brakeFraction = (distance - track.brakeStart[i]) / brakeUnits;
      turnTarget = topSpeed - (topSpeed - apexSpeed) * brakeFraction;
    } else {
      const exitFraction = (distance - track.apex[i]) / (track.exitEnd[i] - track.apex[i]);
      turnTarget = apexSpeed + (CRUISE_SPEED - apexSpeed) * exitFraction;
    }
    if (turnTarget < target) target = turnTarget;
  }
  return target;
}

/**
 * runNominalCar(track, tickLimit, stopDistance, config) → { ticks, distance }.
 * Drives a car with every factor at 1.0 through the track with the race's own speed rules,
 * until it reaches `stopDistance` or `tickLimit` ticks have run. Used to size the straights
 * and to place the finish line, so "the nominal car finishes at the duration" is measured
 * with the same arithmetic the race uses, not estimated with a formula.
 */
function runNominalCar(track, tickLimit, stopDistance, config) {
  const tickSec = 1 / config.ticksPerSecond;
  let distance = 0;
  let speed = 0;
  let turnIndex = 0;
  let ticks = 0;
  while (ticks < tickLimit && distance < stopDistance) {
    while (turnIndex < track.turnCount && distance >= track.exitEnd[turnIndex]) turnIndex++;
    const desired = targetSpeedAt(track, distance, turnIndex);
    if (desired > speed) {
      speed = Math.min(desired, speed + config.accelerationPerSec * tickSec);
    } else {
      speed = Math.max(desired, speed - config.brakingPerSec * tickSec);
    }
    distance += speed * tickSec;
    ticks++;
  }
  return { ticks, distance };
}

/**
 * nominalTicks(shape, scale, config, tickLimit) → the ticks the nominal car needs to the end of
 * the track laid out with the straights at `scale`, capped at `tickLimit`.
 */
function nominalTicks(shape, scale, config, tickLimit) {
  const track = layoutTrack(shape, scale, config);
  return runNominalCar(track, tickLimit, track.totalUnits, config).ticks;
}

/**
 * buildTrack(seedText, durationSec, config) → track.
 * The track for a seed and duration: the seeded shape, the straights scaled so the nominal
 * car's time matches the duration (the turn zones take what they take; the straights absorb
 * the rest), then the finish line placed exactly where the nominal car is at the duration's
 * last tick. The scale is bisected: the smallest scale at which the nominal car is not early,
 * within the bisection's precision, so the fit holds whatever the speed profile.
 */
function buildTrack(seedText, durationSec, config) {
  const shape = drawTrackShape(seedText, durationSec, config);
  const durationTicks = Math.round(durationSec * config.ticksPerSecond);
  const tickLimit = durationTicks * 10;
  let low = MIN_STRAIGHT_SCALE;
  let high = 1;
  while (high < MAX_STRAIGHT_SCALE) {
    if (nominalTicks(shape, high, config, tickLimit) >= durationTicks) break;
    high *= 2;
  }
  for (let pass = 0; pass < SCALING_PASSES; pass++) {
    const middle = (low + high) / 2;
    if (nominalTicks(shape, middle, config, tickLimit) < durationTicks) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const track = layoutTrack(shape, high, config);
  const atDuration = runNominalCar(track, durationTicks, track.totalUnits * 2, config);
  track.finishUnits = Math.min(atDuration.distance, track.totalUnits);
  return track;
}

/* ==== RACE ==== */

// A crossed car's order key sits above any distance, highest place first.
const CROSSED_ORDER_BASE = 1e9;
// Every car's base pace, as a factor on the track's target speed: the same for all, always
// (Rich's decision, 2026-11-01). Only the seeded checkpoints along the road set a car apart.
const BASE_PACE = 1;

/**
 * drawCarCheckpoints(seedText, carIndex, track, config) → { distance, factor } (Float64Arrays).
 * A car's speed factors along the road, from its own 'car:<index>' stream: a launch factor at
 * the start line, checkpoints along each straight (within the straight, in distance order) and
 * a corner factor at each turn's braking point. Every car has the same base pace (Rich's
 * decision, 2026-11-01: nothing is fixed before the start); the factor set at a checkpoint
 * holds until the next one, so each car's race comes out of these draws alone. The last draw
 * is the car's tiebreak for a dead heat.
 */
function drawCarCheckpoints(seedText, carIndex, track, config) {
  const random = createRandom(seedText, `car:${carIndex}`);
  const pace = BASE_PACE;
  const perStraight = Math.max(1, Math.round(config.checkpointsPerStraight));
  const count = 1 + (track.turnCount + 1) * perStraight + track.turnCount;
  const distance = new Float64Array(count);
  const factor = new Float64Array(count);
  distance[0] = 0;
  factor[0] = pace * (1 + random.nextBetween(-config.launchSpread, config.launchSpread));
  let next = 1;
  for (let i = 0; i <= track.turnCount; i++) {
    const first = next;
    for (let j = 0; j < perStraight; j++) {
      const along = random.nextBetween(track.straightStart[i], track.straightEnd[i]);
      const spread = random.nextBetween(-config.checkpointSpread, config.checkpointSpread);
      // Insertion sort within the straight keeps the checkpoints in distance order.
      let slot = next;
      while (slot > first && distance[slot - 1] > along) {
        distance[slot] = distance[slot - 1];
        factor[slot] = factor[slot - 1];
        slot--;
      }
      distance[slot] = along;
      factor[slot] = pace * (1 + spread);
      next++;
    }
    if (i === track.turnCount) break;
    distance[next] = track.brakeStart[i];
    factor[next] = pace * (1 + random.nextBetween(-config.cornerSpread, config.cornerSpread));
    next++;
  }
  const tiebreak = random.nextFloat();
  return { distance, factor, tiebreak };
}

/**
 * drawLanes(seedText, carCount) → Float64Array of lane positions in [-1, 1].
 * Evenly spaced lanes across the road, dealt to the cars in a seeded order ('lanes' stream, a
 * Fisher–Yates shuffle). Cosmetic: the lane is where the stage draws the car; it never changes
 * the race. Every car starts on one line at distance 0, no grid rows (Rich's decision,
 * 2026-11-01), so the lane is the only thing that tells cars apart at the start.
 */
function drawLanes(seedText, carCount) {
  const random = createRandom(seedText, 'lanes');
  const slots = new Int32Array(carCount);
  for (let i = 0; i < carCount; i++) slots[i] = i;
  for (let i = carCount - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    const swapped = slots[i];
    slots[i] = slots[j];
    slots[j] = swapped;
  }
  const lane = new Float64Array(carCount);
  for (let i = 0; i < carCount; i++) lane[i] = -1 + 2 * (slots[i] + 0.5) / carCount;
  return lane;
}

/**
 * createRace({ entrants, seed, durationSec, config, overrides }) → race.
 * The race at tick 0: the track, every car's checkpoints and lane, and the state arrays the
 * ticks update in place. `entrants` is the expanded list ([{ name }], 2 to 100); `config` is
 * the effective CONFIG (defaults when omitted); `overrides` are the link settings in effect,
 * carried into the result so a tweaked race says so. Throws on an input the shell should have
 * refused, because a race from bad input would be a silent lie.
 */
export function createRace(options) {
  const config = options.config || CONFIG;
  const entrants = Array.isArray(options.entrants) ? options.entrants : [];
  const carCount = entrants.length;
  if (carCount < config.minEntrants || carCount > config.maxEntrants) {
    throw new Error(
      `entrants: ${carCount} is outside ${config.minEntrants} to ${config.maxEntrants}`,
    );
  }
  const seed = sanitizeSeed(options.seed);
  if (!seed) throw new Error('seed: empty');
  const [durationMin, durationMax] = CONFIG_LIMITS.durationSec;
  const durationSec = Number(options.durationSec);
  if (!(durationSec >= durationMin && durationSec <= durationMax)) {
    throw new Error(
      `durationSec: ${options.durationSec} is outside ${durationMin} to ${durationMax}`,
    );
  }
  const track = buildTrack(seed, durationSec, config);
  const perCar = [];
  let checkpointTotal = 0;
  for (let i = 0; i < carCount; i++) {
    perCar.push(drawCarCheckpoints(seed, i, track, config));
    checkpointTotal += perCar[i].distance.length;
  }
  const checkpointDistance = new Float64Array(checkpointTotal);
  const checkpointFactor = new Float64Array(checkpointTotal);
  const checkpointStart = new Int32Array(carCount);
  const checkpointEnd = new Int32Array(carCount);
  const tiebreak = new Float64Array(carCount);
  let offset = 0;
  for (let i = 0; i < carCount; i++) {
    checkpointStart[i] = offset;
    checkpointDistance.set(perCar[i].distance, offset);
    checkpointFactor.set(perCar[i].factor, offset);
    offset += perCar[i].distance.length;
    checkpointEnd[i] = offset;
    tiebreak[i] = perCar[i].tiebreak;
  }
  const order = new Int32Array(carCount);
  for (let i = 0; i < carCount; i++) order[i] = i;
  return {
    seed,
    durationSec,
    config,
    overrides: options.overrides || {},
    entrants: entrants.map(entrant => ({ name: sanitizeName(entrant.name) })),
    displayNames: displayNames(entrants),
    track,
    carCount,
    tick: 0,
    tickSec: 1 / config.ticksPerSecond,
    maxTicks: Math.round(config.maxRaceSec * config.ticksPerSecond),
    isFinished: false,
    crossedCount: 0,
    finishOrder: [],
    lane: drawLanes(seed, carCount),
    tiebreak,
    checkpointDistance,
    checkpointFactor,
    checkpointStart,
    checkpointEnd,
    checkpointIndex: Int32Array.from(checkpointStart),
    turnIndex: new Int32Array(carCount),
    distance: new Float64Array(carCount),
    previousDistance: new Float64Array(carCount),
    speed: new Float64Array(carCount),
    factor: new Float64Array(carCount),
    place: new Int32Array(carCount),
    finishTick: new Float64Array(carCount),
    orderKey: new Float64Array(carCount),
    order,
    crossingBuffer: new Int32Array(carCount),
    snapshot: {
      tick: 0,
      elapsedSec: 0,
      isFinished: false,
      crossedCount: 0,
      leader: 0,
      distance: new Float64Array(carCount),
      speed: null,
      lane: null,
      order,
    },
  };
}

/**
 * moveCars(race) → the number of cars that crossed the finish this tick (their indices are in
 * race.crossingBuffer).
 * One tick for every car: apply any checkpoint reached, keep the turn pointer current, move
 * speed toward the target by at most the acceleration or braking rate, advance. Flat on
 * purpose: this runs 60 times a second for up to 100 cars, so nothing is allocated here.
 */
function moveCars(race) {
  const { track, tickSec, config } = race;
  const accelerationStep = config.accelerationPerSec * tickSec;
  const brakingStep = config.brakingPerSec * tickSec;
  const finishUnits = track.finishUnits;
  let crossings = 0;
  for (let i = 0; i < race.carCount; i++) {
    const distance = race.distance[i];
    let checkpoint = race.checkpointIndex[i];
    while (checkpoint < race.checkpointEnd[i] && distance >= race.checkpointDistance[checkpoint]) {
      race.factor[i] = race.checkpointFactor[checkpoint];
      checkpoint++;
    }
    race.checkpointIndex[i] = checkpoint;
    let turnIndex = race.turnIndex[i];
    while (turnIndex < track.turnCount && distance >= track.exitEnd[turnIndex]) turnIndex++;
    race.turnIndex[i] = turnIndex;
    const desired = targetSpeedAt(track, distance, turnIndex) * race.factor[i];
    let speed = race.speed[i];
    if (desired > speed) {
      speed = Math.min(desired, speed + accelerationStep);
    } else {
      speed = Math.max(desired, speed - brakingStep);
    }
    race.speed[i] = speed;
    race.previousDistance[i] = distance;
    race.distance[i] = distance + speed * tickSec;
    if (race.place[i] === 0 && race.distance[i] >= finishUnits) {
      race.crossingBuffer[crossings] = i;
      crossings++;
    }
  }
  return crossings;
}

/**
 * compareCrossings(race) → a comparator ordering this tick's crossings.
 * Earlier within the tick first; an exact dead heat (the same crossing tick as a double) goes
 * to the car's seeded tiebreak, then to list order, so the order is total and the same
 * everywhere.
 */
function compareCrossings(race) {
  return (first, second) => {
    const tickDifference = race.finishTick[first] - race.finishTick[second];
    if (tickDifference !== 0) return tickDifference;
    const tiebreakDifference = race.tiebreak[first] - race.tiebreak[second];
    if (tiebreakDifference !== 0) return tiebreakDifference;
    return first - second;
  };
}

/**
 * recordCrossings(race, crossings) → nothing.
 * Gives this tick's crossing cars their places. The crossing time is the tick plus the linear
 * fraction of the tick at which the car reached the line, so two cars crossing on the same
 * tick are placed by where in the tick they crossed. Allocates only on a tick with crossings.
 */
function recordCrossings(race, crossings) {
  const finishUnits = race.track.finishUnits;
  const crossed = [];
  for (let i = 0; i < crossings; i++) {
    const car = race.crossingBuffer[i];
    const moved = race.distance[car] - race.previousDistance[car];
    const fraction = moved > 0 ? (finishUnits - race.previousDistance[car]) / moved : 1;
    race.finishTick[car] = race.tick - 1 + fraction;
    crossed.push(car);
  }
  crossed.sort(compareCrossings(race));
  for (const car of crossed) {
    race.crossedCount++;
    race.place[car] = race.crossedCount;
    race.finishOrder.push(car);
  }
}

/**
 * sortOrder(race) → nothing.
 * Keeps race.order sorted: crossed cars first by place, then the rest by distance, furthest
 * first; a tie on distance goes to the tiebreak. Insertion sort, because the order barely
 * changes between ticks, so it is nearly linear and allocates nothing.
 */
function sortOrder(race) {
  const { order, orderKey } = race;
  for (let i = 0; i < race.carCount; i++) {
    orderKey[i] = race.place[i] > 0
      ? CROSSED_ORDER_BASE - race.place[i]
      : race.distance[i] + race.tiebreak[i] * 1e-9;
  }
  for (let i = 1; i < race.carCount; i++) {
    const car = order[i];
    const key = orderKey[car];
    let slot = i;
    while (slot > 0 && orderKey[order[slot - 1]] < key) {
      order[slot] = order[slot - 1];
      slot--;
    }
    order[slot] = car;
  }
}

/**
 * finishByPosition(race) → nothing.
 * The guard for a race that hits maxRaceSec with cars still out: they are placed by distance
 * (race.order is already in that order) with no crossing time. With the stock config every
 * car crosses long before that; a self-test checks it.
 */
function finishByPosition(race) {
  for (let i = 0; i < race.carCount; i++) {
    const car = race.order[i];
    if (race.place[car] > 0) continue;
    race.crossedCount++;
    race.place[car] = race.crossedCount;
    race.finishTick[car] = -1;
    race.finishOrder.push(car);
  }
}

/**
 * advanceTick(race) → race.isFinished.
 * One tick of race time (1 / ticksPerSecond s), in place. The race is finished when every car
 * has crossed the line (Rich's decision, 2026-11-01: hold the line, every place is a real
 * crossing). A finished race ignores further ticks.
 */
export function advanceTick(race) {
  if (race.isFinished) return true;
  race.tick++;
  const crossings = moveCars(race);
  if (crossings) recordCrossings(race, crossings);
  sortOrder(race);
  if (race.crossedCount === race.carCount) {
    race.isFinished = true;
  } else if (race.tick >= race.maxTicks) {
    finishByPosition(race);
    race.isFinished = true;
  }
  return race.isFinished;
}

/**
 * runToFinish(race) → race.
 * Ticks until the race is finished (the reduced-motion mode, Re-run checks and the tests).
 * Bounded by maxRaceSec through advanceTick.
 */
export function runToFinish(race) {
  while (!advanceTick(race)) { /* every tick does the work */ }
  return race;
}

/**
 * clockToTicks(race, raceClockMs) → { ticksDue, tickFraction }.
 * The shell keeps a race clock in milliseconds (wall time while the race is playing, not
 * counting pauses or a hidden tab) and asks, each frame, how many ticks it owes the engine
 * (`ticksDue`, to run with advanceTick) and how far the frame is into the next tick
 * (`tickFraction`, 0 to 1, for raceSnapshot). Computed from the whole clock, never by adding
 * up frame deltas, so the ticks run never drift from the clock. The frame rate only sets how
 * often this is asked. Negative or non-numeric input owes nothing.
 */
export function clockToTicks(race, raceClockMs) {
  const clockMs = Number(raceClockMs);
  const ticksElapsed = clockMs > 0 ? clockMs * race.config.ticksPerSecond / 1000 : 0;
  const wholeTicks = Math.floor(ticksElapsed);
  return {
    ticksDue: Math.max(0, wholeTicks - race.tick),
    tickFraction: ticksElapsed - wholeTicks,
  };
}

/**
 * liveOrder(race) → [carIndex, …], leader first.
 * Crossed cars by place, then the rest by distance.
 */
export function liveOrder(race) {
  return Array.from(race.order);
}

/**
 * raceSnapshot(race, tickFraction) → the reusable snapshot object, refilled.
 * What the stage draws: each car's distance interpolated between the last two ticks by
 * `tickFraction` (0 to 1, how far the frame is into the current tick; cosmetic, never fed
 * back), its lane and speed, the order, elapsed race seconds and the leader. One object per
 * race, refilled on each call, so a frame allocates nothing.
 */
export function raceSnapshot(race, tickFraction) {
  const snapshot = race.snapshot;
  const fraction = clamp(Number(tickFraction) || 0, 0, 1);
  for (let i = 0; i < race.carCount; i++) {
    const from = race.previousDistance[i];
    snapshot.distance[i] = from + (race.distance[i] - from) * fraction;
  }
  snapshot.tick = race.tick;
  snapshot.elapsedSec = race.tick * race.tickSec;
  snapshot.isFinished = race.isFinished;
  snapshot.crossedCount = race.crossedCount;
  snapshot.leader = race.order[0];
  snapshot.speed = race.speed;
  snapshot.lane = race.lane;
  snapshot.order = race.order;
  return snapshot;
}

/**
 * trackLayout(race) → { turns, straights, finishUnits, totalUnits }.
 * The static track for the stage, in track units: each turn's braking start, apex, exit end,
 * direction (-1 left, 1 right) and apex speed; each straight's start, end and whether it is a
 * long one; the finish line.
 */
export function trackLayout(race) {
  const { track } = race;
  const turns = [];
  for (let i = 0; i < track.turnCount; i++) {
    turns.push({
      brakeStart: track.brakeStart[i],
      apex: track.apex[i],
      exitEnd: track.exitEnd[i],
      direction: track.direction[i],
      apexSpeed: track.apexSpeed[i],
    });
  }
  const straights = [];
  for (let i = 0; i <= track.turnCount; i++) {
    straights.push({
      start: track.straightStart[i],
      end: track.straightEnd[i],
      isLong: track.isLong[i],
    });
  }
  return { turns, straights, finishUnits: track.finishUnits, totalUnits: track.totalUnits };
}

/* ==== RESULT ==== */

// Finish times are kept to the millisecond (a tick is 16.7 ms): rounded at this scale.
const TIME_SCALE = 1000;
// The export columns, locked once a version with them is released.
const CSV_RESULT_COLUMNS = [
  'place', 'display_name', 'name', 'time_sec', 'seed', 'duration_sec', 'entrant_count',
  'app_version', 'overrides',
];

/**
 * roundTime(ticks, ticksPerSecond) → seconds with three decimals, as a number.
 */
function roundTime(ticks, ticksPerSecond) {
  return Math.round(ticks / ticksPerSecond * TIME_SCALE) / TIME_SCALE;
}

/**
 * finishResult(race) → the race record, or null while the race is running.
 * { appVersion, seed, durationSec, entrantCount, overrides, places: [{ place, entrantIndex,
 * name, displayName, timeSec }] }. timeSec is the crossing time in race seconds, or null for
 * a car placed by position when maxRaceSec ran out. Plain data: safe to store and export.
 */
export function finishResult(race) {
  if (!race.isFinished) return null;
  const places = race.finishOrder.map((car, index) => ({
    place: index + 1,
    entrantIndex: car,
    name: race.entrants[car].name,
    displayName: race.displayNames[car],
    timeSec: race.finishTick[car] < 0
      ? null
      : roundTime(race.finishTick[car], race.config.ticksPerSecond),
  }));
  return {
    appVersion: race.config.appVersion,
    seed: race.seed,
    durationSec: race.durationSec,
    entrantCount: race.carCount,
    overrides: { ...race.overrides },
    places,
  };
}

/**
 * csvCell(value) → the value as one CSV cell.
 * Quoted when it holds a comma, a quote or a line break (quotes doubled), and prefixed with an
 * apostrophe when it starts like a spreadsheet formula, so an entrant named "=1+1" stays text
 * when the export is opened in a spreadsheet.
 */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_STARTERS.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * overridesText(overrides) → 'key=value key=value', or '' for a stock race.
 * The link settings in effect, as one cell, so a CSV alone shows whether a race was stock
 * (Rich's decision, 2026-11-01: a clean audit from either export). Keys in sorted order so the
 * same settings always read the same.
 */
function overridesText(overrides) {
  const keys = Object.keys(overrides || {}).sort();
  return keys.map(key => `${key}=${overrides[key]}`).join(' ');
}

/**
 * resultToCsv(result) → string. One row per entrant in finishing order, with the race's seed,
 * duration, entrant count, version and overrides repeated on every row so a row stands alone.
 */
export function resultToCsv(result) {
  const lines = [CSV_RESULT_COLUMNS.join(',')];
  const overrides = overridesText(result.overrides);
  for (const entry of result.places) {
    lines.push([
      entry.place,
      entry.displayName,
      entry.name,
      entry.timeSec,
      result.seed,
      result.durationSec,
      result.entrantCount,
      result.appVersion,
      overrides,
    ].map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * resultToJson(result) → string. The record as readable JSON.
 */
export function resultToJson(result) {
  return JSON.stringify(result, null, 2);
}

/* ==== SANITIZERS ==== */

// What a stored session may hold, with the rule for each field (a field without a rule is
// reset on load). The keys are part of what the browser's storage holds; they don't get renamed.
const MAX_VERSION_LENGTH = 40;
const MAX_OVERRIDE_COUNT = 64;

/**
 * sanitizeOverrides(entries, config) → { config, overrides, ignored }.
 * Link settings (an iterable of [key, value] string pairs, as URLSearchParams gives them) over
 * `config`: only keys in CONFIG_LIMITS, only numbers, kept within their range. Anything else is
 * ignored and named in `ignored` ('bad=<b>x</b>: not a setting') for the console. The
 * applied settings come back in `overrides` so the race record can carry them.
 */
export function sanitizeOverrides(entries, config) {
  const base = config || CONFIG;
  const overrides = {};
  const ignored = [];
  let count = 0;
  for (const pair of entries || []) {
    if (count++ >= MAX_OVERRIDE_COUNT) break;
    const key = cleanText(pair[0], MAX_VERSION_LENGTH);
    const text = cleanText(pair[1], MAX_VERSION_LENGTH);
    const limits = Object.prototype.hasOwnProperty.call(CONFIG_LIMITS, key)
      ? CONFIG_LIMITS[key]
      : null;
    if (!limits) {
      ignored.push(`${key}=${text}: not a setting`);
      continue;
    }
    const value = text === '' ? Number.NaN : Number(text);
    if (!Number.isFinite(value)) {
      ignored.push(`${key}=${text}: not a number`);
      continue;
    }
    overrides[key] = clamp(value, limits[0], limits[1]);
  }
  return { config: { ...base, ...overrides }, overrides, ignored };
}

/**
 * sanitizeStoredOverrides(value) → { key: number } with only known keys within their limits.
 */
function sanitizeStoredOverrides(value) {
  if (!value || typeof value !== 'object') return {};
  const pairs = Object.keys(value).map(key => [key, String(value[key])]);
  return sanitizeOverrides(pairs).overrides;
}

/**
 * sanitizeResult(value) → a race record with every field checked, or null.
 * A crafted record (markup in a name, a wrong type, a place out of range) comes back as text
 * or is dropped; nothing in it is trusted.
 */
export function sanitizeResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.places)) return null;
  const entrantCount = value.places.length;
  if (entrantCount < CONFIG.minEntrants || entrantCount > CONFIG.maxEntrants) return null;
  const [durationMin, durationMax] = CONFIG_LIMITS.durationSec;
  const durationSec = Number(value.durationSec);
  if (!(durationSec >= durationMin && durationSec <= durationMax)) return null;
  const seed = sanitizeSeed(value.seed);
  if (!seed) return null;
  const places = [];
  for (let i = 0; i < entrantCount; i++) {
    const entry = value.places[i];
    if (!entry || typeof entry !== 'object') return null;
    const entrantIndex = Number(entry.entrantIndex);
    if (!Number.isInteger(entrantIndex) || entrantIndex < 0 || entrantIndex >= entrantCount) {
      return null;
    }
    const timeSec = Number(entry.timeSec);
    const name = sanitizeName(entry.name);
    if (!name) return null;
    places.push({
      place: i + 1,
      entrantIndex,
      name,
      displayName: sanitizeName(entry.displayName) || name,
      timeSec: entry.timeSec === null || !Number.isFinite(timeSec) || timeSec < 0
        ? null
        : timeSec,
    });
  }
  return {
    appVersion: cleanText(value.appVersion, MAX_VERSION_LENGTH),
    seed,
    durationSec,
    entrantCount,
    overrides: sanitizeStoredOverrides(value.overrides),
    places,
  };
}

/**
 * sanitizeStoredSession(value) → { version, entrantsText, seed, durationSec, lastResult,
 * savedAtMs }, or null when nothing usable was stored.
 * `value` is what the browser's storage held (JSON text or an already parsed object). Every
 * field has a rule; a field that fails its rule is reset, not trusted: the list and seed are
 * plain text, the duration falls back to the default, a bad record becomes null, a bad time
 * becomes 0.
 */
export function sanitizeStoredSession(value) {
  let stored = value;
  if (typeof stored === 'string') {
    try {
      stored = JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }
  if (!stored || typeof stored !== 'object') return null;
  const maxTextLength = CONFIG.maxEntrants * (CONFIG.maxNameLength + 8);
  const rawText = typeof stored.entrantsText === 'string' ? stored.entrantsText : '';
  const entrantsText = parseEntrantText(rawText.slice(0, maxTextLength)).rows
    .map(row => row.name)
    .join('\n');
  const [durationMin, durationMax] = CONFIG_LIMITS.durationSec;
  const storedDuration = Number(stored.durationSec);
  const isDurationOk = storedDuration >= durationMin && storedDuration <= durationMax;
  const savedAtMs = Number(stored.savedAtMs);
  const session = {
    version: cleanText(stored.version, MAX_VERSION_LENGTH),
    entrantsText,
    seed: sanitizeSeed(stored.seed),
    durationSec: isDurationOk ? storedDuration : CONFIG.durationSec,
    lastResult: sanitizeResult(stored.lastResult),
    savedAtMs: Number.isFinite(savedAtMs) && savedAtMs > 0 ? savedAtMs : 0,
  };
  const isEmpty = !session.entrantsText && !session.seed && !session.lastResult;
  return isEmpty ? null : session;
}

/* ==== SELF-TEST ==== */

// The field sizes and durations the self-tests sweep: the routine break and a small list.
const TEST_FIELD_SIZES = [24, 75];
const TEST_DURATIONS = [10, 30, 120];
const TEST_SEED_COUNT = 8;
// The duration promise, measured on the stock config (Claude's bounds, checked here so a
// tuning change that breaks them fails the test): the winner crosses no earlier than this
// share of the duration, the last car no later than that share.
const WINNER_EARLIEST_SHARE = 0.9;
const LAST_CAR_LATEST_SHARE = 1.15;
// The reference race: 75 cars, this seed, 30 s on the stock config, and the FNV-1a hash of its
// finish signature as measured in Node (V8). The same value on an iPhone (JavaScriptCore) is the
// proof that the engine's arithmetic is identical across engines; a tuning change moves it, and
// that is a user-visible change (a new version), so the constant is updated with the version.
const REFERENCE_SEED = 'P1HUNT';
const REFERENCE_FINGERPRINT = '54c0c8eb';

/**
 * testEntrants(count) → [{ name }], `count` distinct names.
 */
function testEntrants(count) {
  const entrants = [];
  for (let i = 0; i < count; i++) entrants.push({ name: `Racer ${i + 1}` });
  return entrants;
}

/**
 * finishSignature(race) → a string of the finish order with each crossing tick, for comparing
 * two runs exactly.
 */
function finishSignature(race) {
  return race.finishOrder.map(car => `${car}@${race.finishTick[car]}`).join(' ');
}

/**
 * runInBatches(race, batchSize) → race, ticked `batchSize` ticks at a time, as a frame loop
 * at a lower frame rate would.
 */
function runInBatches(race, batchSize) {
  while (!race.isFinished) {
    for (let i = 0; i < batchSize && !race.isFinished; i++) advanceTick(race);
  }
  return race;
}

/**
 * raceFor(entrantCount, seed, durationSec) → a fresh race on the stock config.
 */
function raceFor(entrantCount, seed, durationSec) {
  return createRace({ entrants: testEntrants(entrantCount), seed, durationSec });
}

/**
 * randomTests(check) → nothing. The generator: known FNV-1a answers, a fixed first output (a
 * regression guard for the seeding, not a published vector), independent streams, and a
 * roughly uniform spread.
 */
function randomTests(check) {
  // FNV-1a 32-bit test values: the empty string is the offset basis; 'a' is from the
  // reference implementation's test suite.
  check('Random: FNV-1a known answers',
    hashText('') === 0x811c9dc5 && hashText('a') === 0xe40c292c,
    `${hashText('').toString(16)} ${hashText('a').toString(16)}`);
  const first = createRandom('P1HUNT', 'track').nextUint32();
  const again = createRandom('P1HUNT', 'track').nextUint32();
  check('Random: the same seed and purpose give the same stream', first === again, `${first}`);
  const other = createRandom('P1HUNT', 'lanes').nextUint32();
  const otherSeed = createRandom('P1HUNT ', 'track').nextUint32();
  check('Random: another purpose or seed gives another stream',
    other !== first && otherSeed !== first, `${first} ${other} ${otherSeed}`);
  const random = createRandom('spread', 'test');
  const buckets = new Int32Array(10);
  const draws = 10000;
  let sum = 0;
  for (let i = 0; i < draws; i++) {
    const value = random.nextFloat();
    sum += value;
    buckets[Math.floor(value * 10)]++;
  }
  const mean = sum / draws;
  const isSpread = buckets.every(count => count > draws / 10 * 0.8 && count < draws / 10 * 1.2);
  check('Random: floats in [0, 1) spread evenly', isSpread && Math.abs(mean - 0.5) < 0.02,
    `mean ${mean.toFixed(3)}, buckets ${Array.from(buckets).join(' ')}`);
}

/**
 * determinismTests(check) → nothing. The fairness story: same inputs twice, tick by tick
 * against batches of ticks, and a different seed or duration giving a different race.
 */
function determinismTests(check) {
  const seed = 'K7MX-4QZD';
  let isSame = true;
  let detail = '';
  for (const durationSec of TEST_DURATIONS) {
    const first = finishSignature(runToFinish(raceFor(75, seed, durationSec)));
    const second = finishSignature(runToFinish(raceFor(75, seed, durationSec)));
    if (first !== second) isSame = false;
    detail += `${durationSec}s ok; `;
  }
  check('Determinism: the same entrants, seed and duration twice give the identical finish',
    isSame, detail.trim());
  const tickByTick = finishSignature(runToFinish(raceFor(75, seed, 30)));
  const batchDetail = [];
  let isBatchSame = true;
  for (const batchSize of [2, 7, 60]) {
    const batched = finishSignature(runInBatches(raceFor(75, seed, 30), batchSize));
    if (batched !== tickByTick) isBatchSame = false;
    batchDetail.push(`${batchSize} ticks per frame`);
  }
  check('Determinism: ticks in batches (any frame rate, reduced motion) give the identical finish',
    isBatchSame, batchDetail.join(', '));
  const otherSeed = finishSignature(runToFinish(raceFor(75, 'K7MX-4QZE', 30)));
  const otherDuration = finishSignature(runToFinish(raceFor(75, seed, 31)));
  check('Determinism: another seed or another duration gives another race',
    otherSeed !== tickByTick && otherDuration !== tickByTick, 'seed and duration both matter');
  const lowerCase = raceFor(75, 'k7mx-4qzd', 30);
  check('Determinism: the seed is case-folded for the race and kept as typed for display',
    finishSignature(runToFinish(lowerCase)) === tickByTick && lowerCase.seed === 'k7mx-4qzd',
    lowerCase.seed);
  const fingerprint = hashText(finishSignature(runToFinish(raceFor(75, REFERENCE_SEED, 30))))
    .toString(16);
  check('Determinism: the reference race matches the fingerprint measured in Node',
    fingerprint === REFERENCE_FINGERPRINT, `${fingerprint} (expected ${REFERENCE_FINGERPRINT})`);
  const twins = createRace({
    entrants: [{ name: 'Rich' }, { name: 'Rich' }, { name: 'Rich' }],
    seed,
    durationSec: 10,
  });
  runToFinish(twins);
  const twinTicks = twins.finishOrder.map(car => twins.finishTick[car]);
  check('Determinism: entrants with the same name race differently (streams by list index)',
    new Set(twinTicks).size === 3, twinTicks.map(tick => tick.toFixed(2)).join(' '));
}

/**
 * durationTests(check) → nothing. The duration promise: the nominal car finishes at the
 * duration to within a tick; across a seed sweep the winner and the last car stay within the
 * shares above; every car crosses (no race hits the maxRaceSec guard); the finish line is past
 * the last apex.
 */
function durationTests(check) {
  const nominalDetail = [];
  let isNominalOk = true;
  for (const durationSec of TEST_DURATIONS) {
    const track = buildTrack('nominal', durationSec, CONFIG);
    const durationTicks = durationSec * CONFIG.ticksPerSecond;
    const nominal = runNominalCar(track, durationTicks * 2, track.finishUnits, CONFIG);
    const offTicks = Math.abs(nominal.ticks - durationTicks);
    if (offTicks > 1) isNominalOk = false;
    nominalDetail.push(`${durationSec}s: ${nominal.ticks} ticks`);
    if (track.finishUnits <= track.apex[track.turnCount - 1]) isNominalOk = false;
  }
  check('Duration: the nominal car crosses at the duration to within a tick, past the last apex',
    isNominalOk, nominalDetail.join(', '));
  const fastRace = raceFor(2, 'top-speed', 30);
  let fastest = 0;
  while (!fastRace.isFinished) {
    advanceTick(fastRace);
    fastest = Math.max(fastest, fastRace.speed[0]);
  }
  check('Track: a straight takes a car above cruise toward the top speed',
    fastest > CRUISE_SPEED * 1.3 && fastest <= CONFIG.straightTopSpeed * 1.4,
    `fastest ${fastest.toFixed(3)} of top ${CONFIG.straightTopSpeed}`);
  let winnerShareMin = Infinity;
  let winnerShareMax = 0;
  let lastShareMax = 0;
  let isEveryCarCrossed = true;
  for (const fieldSize of TEST_FIELD_SIZES) {
    for (const durationSec of TEST_DURATIONS) {
      for (let i = 0; i < TEST_SEED_COUNT; i++) {
        const race = runToFinish(raceFor(fieldSize, `sweep-${i}`, durationSec));
        const winnerSec = race.finishTick[race.finishOrder[0]] / CONFIG.ticksPerSecond;
        const lastCar = race.finishOrder[race.carCount - 1];
        const lastSec = race.finishTick[lastCar] / CONFIG.ticksPerSecond;
        if (race.finishTick[lastCar] < 0) isEveryCarCrossed = false;
        winnerShareMin = Math.min(winnerShareMin, winnerSec / durationSec);
        winnerShareMax = Math.max(winnerShareMax, winnerSec / durationSec);
        lastShareMax = Math.max(lastShareMax, lastSec / durationSec);
      }
    }
  }
  const asPercent = share => `${(share * 100).toFixed(1)}%`;
  const sweepDetail = `winner ${asPercent(winnerShareMin)} to ${asPercent(winnerShareMax)}`
    + ` of the duration, last car up to ${asPercent(lastShareMax)}`;
  check('Duration: across a seed sweep the winner is on time or early within bounds',
    winnerShareMin >= WINNER_EARLIEST_SHARE && winnerShareMax <= 1.02, sweepDetail);
  check('Duration: across the sweep every car crosses, the last within bounds',
    isEveryCarCrossed && lastShareMax <= LAST_CAR_LATEST_SHARE, sweepDetail);
}

/**
 * raceTests(check) → nothing. The race's bookkeeping: places are 1..n with ascending times,
 * the live order agrees with the finish, the snapshot interpolates, the layout is consistent,
 * and bad inputs are refused.
 */
function raceTests(check) {
  const race = raceFor(24, 'bookkeeping', 30);
  runToFinish(race);
  let isAscending = true;
  for (let i = 1; i < race.carCount; i++) {
    const earlier = race.finishTick[race.finishOrder[i - 1]];
    const later = race.finishTick[race.finishOrder[i]];
    if (later < earlier) isAscending = false;
  }
  const placesSeen = new Set(Array.from(race.place));
  check('Race: every car gets one place, 1 to n, in ascending crossing time',
    placesSeen.size === 24 && race.place.every(place => place >= 1 && place <= 24) && isAscending,
    `${race.crossedCount} places`);
  check('Race: the live order at the finish equals the finish order',
    liveOrder(race).join(',') === race.finishOrder.join(','), 'same order');
  const fresh = raceFor(24, 'bookkeeping', 30);
  advanceTick(fresh);
  advanceTick(fresh);
  const halfway = raceSnapshot(fresh, 0.5);
  const isBetween = halfway.distance.every((drawn, i) => drawn >= fresh.previousDistance[i]
    && drawn <= fresh.distance[i]);
  check('Race: the snapshot interpolates between the last two ticks, never ahead',
    isBetween && halfway.elapsedSec === 2 / CONFIG.ticksPerSecond && halfway.tick === 2,
    `tick ${halfway.tick}`);
  const layout = trackLayout(fresh);
  const turnsPerTenSec = layout.turns.length / (30 / 10);
  const longCount = layout.straights.filter(straight => straight.isLong).length;
  check('Track: 2 to 3 turns per 10 s, 1 to 3 long straights, finish past the last turn',
    turnsPerTenSec >= 2 && turnsPerTenSec <= 3 && longCount >= 1 && longCount <= 3
      && layout.finishUnits > layout.turns[layout.turns.length - 1].exitEnd,
    `${layout.turns.length} turns, ${longCount} long straights`);
  const refused = [];
  const attempts = [
    ['1 entrant', { entrants: testEntrants(1), seed: 'x', durationSec: 30 }],
    ['101 entrants', { entrants: testEntrants(101), seed: 'x', durationSec: 30 }],
    ['empty seed', { entrants: testEntrants(5), seed: '  ', durationSec: 30 }],
    ['duration 9', { entrants: testEntrants(5), seed: 'x', durationSec: 9 }],
    ['duration text', { entrants: testEntrants(5), seed: 'x', durationSec: 'soon' }],
  ];
  for (const [label, options] of attempts) {
    try {
      createRace(options);
    } catch (error) {
      refused.push(label);
    }
  }
  check('Race: bad inputs are refused with an error', refused.length === attempts.length,
    refused.join(', '));
  const clocked = raceFor(5, 'clock', 10);
  const firstFrame = clockToTicks(clocked, 1000);
  for (let i = 0; i < firstFrame.ticksDue; i++) advanceTick(clocked);
  const sameFrame = clockToTicks(clocked, 1000);
  const partTick = clockToTicks(clocked, 1025);
  const noClock = clockToTicks(clocked, 'soon');
  check('Race: clockToTicks owes the whole clock in ticks, never drifting, with the fraction',
    firstFrame.ticksDue === 60 && clocked.tick === 60 && sameFrame.ticksDue === 0
      && partTick.ticksDue === 1 && Math.abs(partTick.tickFraction - 0.5) < 1e-9
      && noClock.ticksDue === 0 && noClock.tickFraction === 0,
    `${firstFrame.ticksDue} ticks at 1000 ms, then ${partTick.ticksDue} at 1025 ms`);
}

/**
 * entrantTests(check) → nothing. Text and CSV parsing, spots, suffixes and the template.
 */
function entrantTests(check) {
  const typed = parseEntrantText('Rich\n\n  k2-7 \r\nSam\n');
  check('Entrants: one name per line, blank lines ignored, names trimmed',
    typed.rows.map(row => row.name).join('|') === 'Rich|k2-7|Sam' && typed.rows[1].line === 3,
    typed.rows.map(row => `${row.name}@${row.line}`).join(' '));
  const csv = parseCsv('﻿name,spots\r\nRich,3\r\nRich,\r\nRich\r\n"Smith, Jo",2\r\n\r\n');
  const expanded = expandEntrants(csv.rows);
  check('CSV: the template parses, spots add up across lines, blank = 1',
    expanded.length === 7 && expanded.filter(entrant => entrant.name === 'Rich').length === 5
      && expanded[5].name === 'Smith, Jo' && csv.problems.length === 0,
    `${expanded.length} entrants, ${csv.problems.length} problems`);
  const swapped = parseCsv('Spots,Name\n2,Rich\n,Sam\n');
  check('CSV: header columns in either order and any case',
    expandEntrants(swapped.rows).map(entrant => entrant.name).join('|') === 'Rich|Rich|Sam',
    swapped.rows.map(row => `${row.name}:${row.spots}`).join(' '));
  const bare = parseCsv('Rich\nSam\n');
  check('CSV: a file with no name header is read as names in the first column',
    bare.rows.map(row => row.name).join('|') === 'Rich|Sam', bare.rows.length + ' rows');
  const bad = parseCsv('name,spots\nRich,3\n,2\nSam,two\nJo,0\nAl,1\n');
  check('CSV: a bad line is skipped and named by number; the rest import',
    bad.rows.map(row => row.name).join('|') === 'Rich|Al' && bad.problems.length === 3
      && bad.problems[0].startsWith('line 3:') && bad.problems[1].startsWith('line 4:'),
    bad.problems.join('; '));
  const quoted = parseCsv('name,spots\n"He said ""hi""",1\n"two\nlines",1\nAfter,1\n');
  check('CSV: quoted fields keep commas, doubled quotes and line breaks; line numbers follow',
    quoted.rows[0].name === 'He said "hi"' && quoted.rows[1].name === 'two lines'
      && quoted.rows[2].line === 5,
    quoted.rows.map(row => `${row.name}@${row.line}`).join(' | '));
  const names = displayNames(expandEntrants(parseCsv(
    'name,spots\nRich,3\nk2-7,2\nSam,1\n',
  ).rows));
  check('Entrants: repeated names get -1, -2, … on display; unique names are unchanged',
    names.join('|') === 'Rich-1|Rich-2|Rich-3|k2-7-1|k2-7-2|Sam', names.join(' '));
  check('CSV: the template has the name,spots header',
    csvTemplate().startsWith('name,spots\n') && parseCsv(csvTemplate()).problems.length === 0,
    csvTemplate().split('\n')[0]);
}

/**
 * sanitizerTests(check) → nothing. Untrusted input: names, link settings, a stored session
 * and a crafted record, and the export escaping.
 */
function sanitizerTests(check) {
  const markup = sanitizeName('  <b>Rich</b>\u0000\u001f   two  ');
  check('Sanitize: markup stays text, control characters go, whitespace collapses',
    markup === '<b>Rich</b> two' && sanitizeName('x'.repeat(80)).length === CONFIG.maxNameLength,
    markup);
  const link = sanitizeOverrides([
    ['durationSec', '45'],
    ['durationSec2', '45'],
    ['cornerSpread', '9'],
    ['checkpointSpread', '<b>x</b>'],
    ['appVersion', '9.9.9'],
    ['ticksPerSecond', '1'],
  ]);
  check('Sanitize: link settings apply only known numeric keys within their limits',
    link.config.durationSec === 45 && link.config.cornerSpread === 0.3
      && link.config.appVersion === CONFIG.appVersion && link.config.ticksPerSecond === 60
      && link.ignored.length === 4
      && Object.keys(link.overrides).join(',') === 'durationSec,cornerSpread',
    link.ignored.join('; '));
  const stored = sanitizeStoredSession(JSON.stringify({
    version: 'x',
    entrantsText: 'Rich\n<i>Sam</i>\n\n',
    seed: ' K7MX ',
    durationSec: 999,
    savedAtMs: 'yesterday',
    lastResult: { places: 'none' },
    extra: 'field',
  }));
  check('Sanitize: a stored session keeps text as text and resets every bad field',
    stored.entrantsText === 'Rich\n<i>Sam</i>' && stored.seed === 'K7MX'
      && stored.durationSec === CONFIG.durationSec && stored.savedAtMs === 0
      && stored.lastResult === null && !('extra' in stored),
    JSON.stringify(stored));
  check('Sanitize: unusable storage (bad JSON, a number, an empty object) gives null',
    sanitizeStoredSession('{oops') === null && sanitizeStoredSession(5) === null
      && sanitizeStoredSession({}) === null, 'null');
  const race = runToFinish(raceFor(5, 'record', 10));
  const result = finishResult(race);
  const roundTrip = sanitizeResult(JSON.parse(resultToJson(result)));
  check('Sanitize: a real record round-trips through JSON unchanged',
    JSON.stringify(roundTrip) === JSON.stringify(result), `${result.places.length} places`);
  const crafted = sanitizeResult({
    ...result,
    places: result.places.map(entry => ({ ...entry, name: '<b>x</b>', entrantIndex: 99 })),
  });
  const typed = sanitizeResult({ ...result, places: result.places.map(entry => ({
    ...entry,
    timeSec: 'fast',
    name: entry.name,
  })) });
  check('Sanitize: a crafted record is dropped or reduced to text',
    crafted === null && typed.places.every(entry => entry.timeSec === null),
    'bad index dropped, bad time nulled');
  const hostile = createRace({
    entrants: [{ name: '=1+1' }, { name: 'Smith, "Jo"' }, { name: '-rich' }],
    seed: 'export',
    durationSec: 10,
  });
  const csv = resultToCsv(finishResult(runToFinish(hostile)));
  const rows = csv.trim().split('\r\n');
  check('Export: one CSV row per entrant; formula-like and quoted cells are escaped',
    rows.length === 4 && rows[0] === CSV_RESULT_COLUMNS.join(',')
      && csv.includes("'=1+1") && csv.includes('"Smith, ""Jo"""') && csv.includes("'-rich"),
    rows[0]);
  const tweaked = sanitizeOverrides([['cornerSpread', '0.2'], ['durationSec', '12']]);
  const tweakedRace = createRace({
    entrants: testEntrants(3),
    seed: 'audit',
    durationSec: 12,
    config: tweaked.config,
    overrides: tweaked.overrides,
  });
  const tweakedCsv = resultToCsv(finishResult(runToFinish(tweakedRace)));
  check('Export: the overrides column names every link setting in effect, blank when stock',
    tweakedCsv.split('\r\n')[1].endsWith(',cornerSpread=0.2 durationSec=12')
      && rows[1].endsWith(`,${CONFIG.appVersion},`),
    tweakedCsv.split('\r\n')[1]);
  const sampleBytes = [0, 31, 32, 255, 7, 8, 9, 10];
  const SEED_PATTERN = /^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;
  check('Seed: seedFromBytes formats 8 bytes as XXXX-XXXX from the unambiguous alphabet',
    SEED_PATTERN.test(seedFromBytes(sampleBytes)) && seedFromBytes([]) === '2222-2222',
    seedFromBytes(sampleBytes));
}

/**
 * selfTest() → { results: [{ name, pass, detail }] }.
 * Runs every engine self-test; Node (tests/selftest.js) and the app (?selftest=1) both call it.
 */
export function selfTest() {
  const results = [];
  const check = (name, pass, detail) => {
    results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  };
  const groups = [randomTests, determinismTests, durationTests, raceTests, entrantTests,
    sanitizerTests];
  for (const group of groups) {
    try {
      group(check);
    } catch (error) {
      check(`${group.name} threw`, false, error.message);
    }
  }
  return { results };
}
