// Every tunable of P1 Hunt Race, in one place. A link can override the keys listed in
// CONFIG_LIMITS (numbers only, kept within their range; see sanitizeOverrides in engine.js).
// The keys are read from links in the wild and from the race record, so they don't get renamed.
//
// Race time is counted in ticks of 1 / ticksPerSecond s. The engine's track units: one unit is
// what a car at cruise speed covers in one second, so a straight of 3 units is a 3 s straight.

export const CONFIG = {
  appVersion: '0.1.0-dev',
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

  // Track: turns per 10 s of duration, the straights (a few long ones among short ones), the
  // apex speed as a fraction of cruise, and the braking and exit zones around each apex
  turnsPerTenSecMin: 2,
  turnsPerTenSecMax: 3,
  longStraightsMin: 1,
  longStraightsMax: 3,
  longStraightRatio: 3,
  straightJitter: 0.25,
  apexSpeedMin: 0.5,
  apexSpeedMax: 0.75,
  brakeZoneUnits: 0.5,
  exitZoneUnits: 0.8,

  // Cars: a base pace per car, a launch factor, speed checkpoints along each straight and a
  // corner factor per turn (each a spread around 1.0), and how fast speed can change
  paceSpread: 0.02,
  launchSpread: 0.1,
  checkpointsPerStraight: 3,
  checkpointSpread: 0.06,
  cornerSpread: 0.08,
  accelerationPerSec: 0.8,
  brakingPerSec: 2,
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
  apexSpeedMin: [0.2, 0.95],
  apexSpeedMax: [0.2, 0.95],
  brakeZoneUnits: [0.1, 3],
  exitZoneUnits: [0.1, 3],
  paceSpread: [0, 0.2],
  launchSpread: [0, 0.5],
  checkpointsPerStraight: [1, 8],
  checkpointSpread: [0, 0.3],
  cornerSpread: [0, 0.3],
  accelerationPerSec: [0.2, 5],
  brakingPerSec: [0.2, 10],
};
