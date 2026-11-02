// Every tunable of P1 Hunt Race, in one place. A link can override the keys listed in
// CONFIG_LIMITS (numbers only, kept within their range; see sanitizeOverrides in engine.js).
// The keys are read from links in the wild and from the race record, so they don't get renamed.
//
// Race time is counted in ticks of 1 / ticksPerSecond s. The engine's track units: one unit is
// what a car at cruise speed covers in one second, so a straight of 3 units is a 3 s straight.

export const CONFIG = {
  appVersion: '0.1.0-dev.34',
  storageKey: 'p1hunt.race.v1',

  // Race time (not overridable: it is the definition of race time)
  ticksPerSecond: 60,
  durationSec: 30,
  maxRaceSec: 600,

  // Entrants (the limits are Rich's; the name and seed caps are Claude's)
  minEntrants: 2,
  maxEntrants: 100,
  maxNameLength: 40,
  maxSeedLength: 40,

  // Track: turns per 10 s of duration (1.5 to 2 since 2026-11-02, Rich: the straights were
  // too short; 2 to 3 before), the straights (a few long ones among short ones, the long
  // ones five times the short), and
  // the corners. Each corner draws a sharpness from 0 (a sweeper) to 1 (a hairpin); its held
  // speed runs from apexSpeedMax down to apexSpeedMin with it, as a fraction of cruise (1.0;
  // the straight's top speed is straightTopSpeed, so a ceiling equal to it makes the widest
  // sweeper a flat-out corner with no lift: Rich, 2026-11-02, "100 % of max"; a car never asks
  // more of a corner than its own straight pace), and its
  // length from cornerUnitsMax down to cornerUnitsMin, with a seeded jitter on the length, so a
  // hairpin is slow and short and a sweeper fast and long (Rich, 2026-11-02: corners differ in
  // speed by how sharp and long they are; the coupling keeps every corner between about 1.2 and
  // 1.8 s and is Claude's call). The ranges are starting values, to tune on the stage
  turnsPerTenSecMin: 1.5,
  turnsPerTenSecMax: 2,
  longStraightsMin: 1,
  longStraightsMax: 3,
  longStraightRatio: 5,
  straightJitter: 0.25,
  apexSpeedMin: 0.5,
  apexSpeedMax: 1.5,
  cornerUnitsMin: 0.5,
  cornerUnitsMax: 2,
  cornerLengthJitter: 0.15,

  // Cars: every car has the same base pace (not a tunable; Rich's decision). A launch factor,
  // speed checkpoints along each straight and a corner factor per turn (each a spread around
  // 1.0) are what set a car apart, and how fast speed can change. On a straight a car builds
  // from cruise (1.0, the track unit) toward straightTopSpeed at accelerationPerSec; it brakes
  // at brakingPerSec on the straight, as late as that rate allows, to reach the corner's speed
  // where the bend starts, holds it to the apex and builds again from the apex out (Rich,
  // 2026-11-02: slow at the very end of the straight, not in the corner; the throttle opens
  // at the apex; the floor raised from 0.4 the same day, "too slow across the board"; braking
  // 4/s → 2/s the same day, so the braking zone is long enough to read on the stage)
  launchSpread: 0.15,
  // Speed checkpoints per unit of straight, at least one per straight (Rich, 2026-11-02: a
  // count per straight left a long straight with no new draw for most of its length, so the
  // order froze there; a short straight of about two units keeps about three checkpoints)
  checkpointsPerUnit: 1.5,
  // A seeded pace per car for each straight as a whole, added to every checkpoint on it
  // (Rich, 2026-11-02: the per-unit checkpoints bunched the field, since independent draws
  // average out over a straight; a pace that lasts the straight spreads it again, at the
  // cost of some lead changes; to settle on the stage against checkpointSpread)
  straightSpread: 0.06,
  checkpointSpread: 0.12,
  cornerSpread: 0.15,
  straightTopSpeed: 1.5,
  accelerationPerSec: 1,
  brakingPerSec: 2,
  // Corner exits (Rich, 2026-11-02): per car per corner a seeded exit quality on a bell,
  // -1 to 1 with most near 0, scales the car's acceleration from the apex by
  // 1 + exitSpread * quality until it is back at its straight pace; a flat-out sweeper has
  // no exit, a slow corner a long one. Meant to keep the order moving, at the front too
  exitSpread: 0.6,

  // The shell and the stage: how the race is shown, never what it decides. Shell time, in the
  // units named. The countdown, the hold after the last car and the reduced-motion reveal are
  // Rich's decisions (2026-11-01); the numbers and the camera are Claude's starting values
  startCountdownSec: 3,
  finishHoldMs: 1500,
  revealSec: 4,
  maxFrameGapMs: 1000,
  cameraNearUnits: 0.6,
  lookBackUnits: 1.5,
  // Speed on screen is units per second over units in view, so less road and fewer cars
  // drawn ahead make the same race read faster (Rich, 2026-11-02: F1 is fast; 6 and 12
  // before). Look only
  viewDepthUnits: 4,
  // The road is drawn this far ahead of the camera and fades out there, at a vanishing
  // point; bends further away are not there to snake (Rich, 2026-11-01). Look only
  roadViewUnits: 7,
  // Kerb blocks and centre dashes repeat every so many track units; denser texture streams
  // past faster at the same speed (Rich, 2026-11-02; 0.25 and 0.5 before). Look only
  kerbUnits: 0.15,
  dashUnits: 0.3,
  // Braking boards on the outside verge before each corner, boardCount of them boardUnits
  // apart, the nearest with one bar: the trackside parallax the stage otherwise lacks, and a
  // mark for the braking zone (Rich, 2026-11-02). 0 boards for none. Look only
  boardCount: 3,
  boardUnits: 1,
  labelMinWidthPx: 28,
  // The timing tower's rows flow to the bottom of the stage and "+ n more" is the last line
  // only when they run out of room (Rich, 2026-11-01); this cap is a link-only extra, off at
  // the field's maximum
  towerMaxRows: 100,
  // The tower's places and gaps refresh this often, like a TV timing graphic, not every frame
  // (Rich, 2026-11-01)
  towerRefreshMs: 1500,
  reducedMotion: 0,
  saveDebounceMs: 300,
};

// [min, max] for every key a link may override. A key missing here is not overridable.
export const CONFIG_LIMITS = {
  durationSec: [10, 120],
  turnsPerTenSecMin: [1, 6],
  turnsPerTenSecMax: [1, 6],
  longStraightsMin: [0, 10],
  longStraightsMax: [0, 10],
  longStraightRatio: [1.5, 6],
  straightJitter: [0, 0.5],
  apexSpeedMin: [0.2, 3],
  apexSpeedMax: [0.2, 3],
  cornerUnitsMin: [0.2, 4],
  cornerUnitsMax: [0.2, 4],
  cornerLengthJitter: [0, 0.5],
  launchSpread: [0, 0.5],
  checkpointsPerUnit: [0.2, 10],
  straightSpread: [0, 0.3],
  checkpointSpread: [0, 0.3],
  cornerSpread: [0, 0.3],
  straightTopSpeed: [1, 3],
  accelerationPerSec: [0.2, 5],
  brakingPerSec: [0.2, 10],
  exitSpread: [0, 0.9],
  startCountdownSec: [0, 5],
  finishHoldMs: [0, 5000],
  revealSec: [1, 10],
  maxFrameGapMs: [200, 5000],
  cameraNearUnits: [0.1, 2],
  lookBackUnits: [0, 6],
  viewDepthUnits: [2, 20],
  roadViewUnits: [3, 40],
  kerbUnits: [0.05, 2],
  dashUnits: [0.1, 4],
  boardCount: [0, 6],
  boardUnits: [0.2, 5],
  labelMinWidthPx: [0, 200],
  towerMaxRows: [3, 100],
  towerRefreshMs: [100, 5000],
  reducedMotion: [0, 1],
};
