// The stage: everything drawn on the race canvas, from a snapshot and the track layout. A
// pseudo-3D road receding to a horizon in the Pole Position manner, bending through the turn
// zones; cars seen from behind, drawn from primitives in a color and an accent per entrant
// (Option B of the 2026-11-02 mockup, Rich's pick); the finish band; the start lights. Drawing
// is cosmetic: nothing here feeds back into the race (Rich, 2026-11-01: code-drawn vectors for
// 0.1; the camera follows the leader and parks at the finish line; labels only on cars drawn
// wide enough).
//
// Sections: SETUP, CAMERA, ROAD, CARS, LIGHTS, FRAME.

/* ==== SETUP ==== */

// The brand palette (CLAUDE.md): matte black, white and P1Hunt red, with the Finisher's greys.
const COLOR_SKY = '#161618';
const COLOR_VERGE = '#1f1f22';
const COLOR_ROAD_A = '#3a3a40';
const COLOR_ROAD_B = '#34343a';
const COLOR_KERB_RED = '#e5322d';
const COLOR_KERB_WHITE = '#e8e8ea';
const COLOR_LINE = '#e8e8ea';
const COLOR_TYRE = '#0c0c0e';
const COLOR_TREAD = '#2c2c31';
const COLOR_CAR_DARK = '#232327';
const COLOR_HELMET = '#e8e8ea';
const COLOR_MIX_WHITE = '#ffffff';
const COLOR_MIX_BLACK = '#000000';
const COLOR_LABEL_BG = 'rgba(22, 22, 24, 0.82)';
const COLOR_LABEL_TEXT = '#e8e8ea';
const COLOR_LIGHT_ON = '#e5322d';
const COLOR_LIGHT_OFF = '#3a3a40';
// Twelve flat car colors by list index; no mapping onto any real livery (Claude's call).
const CAR_COLORS = [
  '#e5322d', '#e8e8ea', '#f2c230', '#2f7de1', '#3fb950', '#f07a1c',
  '#2bc4d6', '#e85aa0', '#8e5be8', '#9c9ca4', '#b7e23a', '#c0392b',
];
// A second color per dozen cars (Rich, 2026-11-02): the first twelve single-tone, then white,
// dark, yellow, blue and red, so 75 cars get 72 liveries from the same twelve colors. A car
// whose accent would equal its own color takes the next one (Claude's call). The dark accent
// is the sky grey, not the tyres' black, so it still shows against the tarmac.
const CAR_ACCENTS = [null, '#e8e8ea', '#161618', '#f2c230', '#2f7de1', '#e5322d'];
// Flat shade bands, never gradients (the brand brief; Rich, 2026-11-02, for the cars): how far
// a band lightens the car's color, and how far the wing's underside darkens it.
const SHADE_LIGHTEN = 0.28;
const SHADE_DARKEN = 0.45;
// Below this drawn width the car's small parts (wishbones, strakes, exhausts, the roll hoop,
// the rain light) are skipped: they would be under a pixel (Claude's call).
const CAR_DETAIL_MIN_PX = 22;
// The car's proportions: Option B of the 2026-11-02 mockup, Rich's pick (wide low pods, an
// engine cover that hides all but the top of the helmet, a two-element wing low over the
// cover). Widths and x offsets are shares of the drawn width, from the centre; heights and y
// offsets are shares of the drawn height, up from the bottom; the exceptions say so.
const CAR_SHAPE = {
  tyreWidth: 0.23,
  tyreHeight: 0.54,
  tyreCorner: 0.2, // of the tyre's width
  treadHeight: 0.14, // of the tyre's height
  wishboneBodyX: 0.31,
  wishboneUpperY: 0.34,
  wishboneLowerY: 0.15,
  wishboneUpperRise: 0.06,
  wishboneLowerRise: 0.04,
  wishboneWidth: 0.022,
  diffuserHalfWidth: 0.33,
  diffuserHeight: 0.08,
  strakeWidth: 0.016,
  podHalfWidth: 0.32,
  podTopY: 0.32,
  podBottomY: 0.05,
  podCorner: 0.03,
  podBandHeight: 0.08,
  podShadeHeight: 0.05,
  exhaustX: 0.24,
  exhaustY: 0.16,
  exhaustRadius: 0.03,
  pillarInnerX: 0.08,
  pillarWidth: 0.03,
  pillarTopY: 0.74,
  pillarBottomY: 0.54,
  hoopY: 0.57,
  hoopRadius: 0.08,
  hoopWidth: 0.03,
  helmetY: 0.56,
  helmetRadius: 0.07,
  coverBaseHalfWidth: 0.20,
  coverBaseY: 0.30,
  coverTopHalfWidth: 0.10,
  coverTopY: 0.58,
  coverShadeHeight: 0.05,
  coverBandY: 0.46,
  coverBandHeight: 0.07,
  wingHalfWidth: 0.43,
  wingTopY: 0.80,
  wingThickness: 0.09,
  wingShadeShare: 0.3, // of the plane's thickness
  wingUndersideShare: 0.22, // of the plane's thickness
  flapHalfWidth: 0.40,
  flapGapY: 0.03,
  flapThickness: 0.06,
  endplateWidth: 0.035,
  endplateTopY: 0.92,
  endplateBottomY: 0.62,
  rainLightWidth: 0.05,
  rainLightInset: 0.2, // of the plane's thickness
  rainLightHeight: 0.6, // of the plane's thickness
};
// Where the diffuser's strakes stand, as shares of its half-width from the centre.
const STRAKE_POSITIONS = [-0.6, -0.2, 0.2, 0.6];
// The horizon sits this far down the stage; the road fills the rest (Claude's call).
const HORIZON_FRACTION = 0.38;
// The road's half-width at the bottom edge, as a share of the stage width, capped by height so
// a wide desktop stage doesn't draw a road wider than it is tall.
const ROAD_HALF_WIDTH_FRACTION = 0.46;
const ROAD_HALF_WIDTH_HEIGHT_CAP = 0.6;
// Screen rows of road between the bottom edge and the far end of the drawn road (at
// roadViewUnits, short of the horizon); each is one trapezoid. The last share of them fades
// into the verge so the road rolls off at a vanishing point (Rich, 2026-11-01).
const ROAD_STRIPS = 64;
const ROAD_FADE_FRACTION = 0.25;
// A strip's bend is integrated in steps this long at most (track units), so a far turn, where
// one strip spans several units, slides in smoothly instead of popping (Rich, 2026-11-01).
const BEND_STEP_UNITS = 0.1;
// Kerb blocks and centre dashes repeat every `kerbUnits` / `dashUnits` of track (CONFIG), so
// they scroll with the road; their widths as shares of the road's half-width.
const KERB_WIDTH_FRACTION = 0.07;
const DASH_WIDTH_FRACTION = 0.02;
// Braking boards (Rich, 2026-11-02): a post on the outside verge with a white board carrying
// red bars, 3, 2, 1 toward the corner. Sizes are shares of the road's half-width at the
// board's depth, so they scale with perspective like the cars (Claude's proportions).
const BOARD_OFFSET_FRACTION = 1.35;
const BOARD_WIDTH_FRACTION = 0.22;
const BOARD_HEIGHT_RATIO = 0.75;
const BOARD_POST_RATIO = 1;
const BOARD_POST_WIDTH_FRACTION = 0.08;
const BOARD_BAR_INSET_RATIO = 0.15;
const BOARD_BAR_HEIGHT_RATIO = 0.7;
const BOARD_MIN_WIDTH_PX = 2;
// The bend is drawn over the corner alone (the braking happens on straight road before it;
// Rich, 2026-11-02) and peaks at the apex with a strength from a sweeper's to a hairpin's by
// the corner's sharpness; BEND_GAIN is how strongly the road's centre moves per unit of
// curvature. Look only.
const BEND_STRENGTH_SWEEPER = 0.55;
const BEND_STRENGTH_HAIRPIN = 1.9;
const BEND_GAIN = 0.9;
// A car's width at the bottom edge as a share of the road's full width there, and its height
// as a share of its width (a rear view is wider than it is tall).
const CAR_WIDTH_FRACTION = 0.22;
const CAR_HEIGHT_RATIO = 0.64;
// Labels: font size as a share of car width, within these pixel bounds.
const LABEL_FONT_FRACTION = 0.34;
const LABEL_FONT_MIN_PX = 10;
const LABEL_FONT_MAX_PX = 16;
const LABEL_PADDING_PX = 3;
// The top three of the live order are always labelled (Rich, 2026-11-01), at this font at
// least. A label sits directly over its car and is never lifted into a stack (Rich,
// 2026-11-02; the first cut lifted a top-three label that would cover another).
const TOP_LABEL_COUNT = 3;
const LABEL_FONT_TOP_MIN_PX = 12;
// The finish band: two rows of checks, this tall at the bottom edge.
const FINISH_BAND_FRACTION = 0.06;
const FINISH_CHECKS = 12;
// The start lights: three discs (Rich, 2026-11-01), sized from the stage width.
const LIGHT_COUNT = 3;
const LIGHT_DIAMETER_FRACTION = 0.07;
const LIGHT_MAX_DIAMETER_PX = 56;
// The lights sit this far above the start-line cars' labels (Rich, 2026-11-01: close to the
// cars, near the centre of the screen), and at least this far from the stage's top edge.
const LIGHT_CLEARANCE_PX = 76;
const LIGHT_TOP_MARGIN_PX = 8;
// The device pixel ratio is capped so a 3× phone doesn't draw nine times the pixels.
const MAX_PIXEL_RATIO = 2;
// Camera smoothing: the share of the remaining distance covered per second of frame time.
const CAMERA_FOLLOW_PER_SEC = 4;

// The canvas and its measured size, in CSS pixels.
const view = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  pixelRatio: 1,
};
// The current race's static layout and per-car looks, set once per race: each car's color
// (the tower's swatch), its accent (null for single-tone) and the color's shade bands.
const scene = {
  layout: null,
  carCount: 0,
  displayNames: [],
  colors: [],
  accents: [],
  lightColors: [],
  darkColors: [],
  config: null,
};
// Camera state (track units) and the per-strip road geometry computed each frame.
const camera = { units: 0, targetUnits: 0, isParked: false };
const strips = {
  depth: new Float64Array(ROAD_STRIPS + 1),
  lateral: new Float64Array(ROAD_STRIPS + 1),
  scale: new Float64Array(ROAD_STRIPS + 1),
};
// Label candidates for one frame (the cars drawn wide enough), filled in drawCars and placed
// in a second pass, nearest first, so overlapping labels are dropped rather than piled up.
const MAX_CARS = 100;
const labels = {
  count: 0,
  car: new Int32Array(MAX_CARS),
  x: new Float64Array(MAX_CARS),
  y: new Float64Array(MAX_CARS),
  widthPx: new Float64Array(MAX_CARS),
  isTop: new Uint8Array(MAX_CARS),
  left: new Float64Array(MAX_CARS),
  right: new Float64Array(MAX_CARS),
  top: new Float64Array(MAX_CARS),
  bottom: new Float64Array(MAX_CARS),
};
// Per car, the frame time its label was first shown and the frame time its spot was first
// found clear, -1 for neither: a shown label holds its spot against newer names, and a new
// one waits labelShowDelayMs for a clear spot (Rich, 2026-11-02: the pack's names popped in
// and out too fast to read). `shownOrder` is scratch for the shown candidates, oldest first.
const labelShownSinceMs = new Float64Array(MAX_CARS).fill(-1);
const labelFreeSinceMs = new Float64Array(MAX_CARS).fill(-1);
const labelIsCandidate = new Uint8Array(MAX_CARS);
const shownOrder = new Int32Array(MAX_CARS);
// The box of the label measured last, by measureLabel.
const labelBox = { left: 0, right: 0, top: 0, bottom: 0, fontPx: 0 };

/**
 * initStage(canvas) → takes the canvas and its drawing context.
 */
export function initStage(canvas) {
  view.canvas = canvas;
  view.ctx = canvas.getContext('2d');
}

/**
 * resizeStage(widthPx, heightPx) → matches the canvas to its box in CSS pixels, at the device
 * pixel ratio (capped).
 */
export function resizeStage(widthPx, heightPx) {
  view.width = Math.max(1, Math.floor(widthPx));
  view.height = Math.max(1, Math.floor(heightPx));
  view.pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  view.canvas.width = Math.round(view.width * view.pixelRatio);
  view.canvas.height = Math.round(view.height * view.pixelRatio);
  view.canvas.style.width = `${view.width}px`;
  view.canvas.style.height = `${view.height}px`;
}

/**
 * setScene(layout, displayNames, config) → the track and the cars for a new race; the camera
 * starts behind the line.
 */
export function setScene(layout, displayNames, config) {
  scene.layout = layout;
  scene.carCount = displayNames.length;
  scene.displayNames = displayNames;
  scene.colors = displayNames.map((name, index) => CAR_COLORS[index % CAR_COLORS.length]);
  scene.accents = scene.colors.map(accentFor);
  scene.lightColors = scene.colors.map(
    (color) => mixedColor(color, COLOR_MIX_WHITE, SHADE_LIGHTEN),
  );
  scene.darkColors = scene.colors.map(
    (color) => mixedColor(color, COLOR_MIX_BLACK, SHADE_DARKEN),
  );
  scene.config = config;
  camera.units = -config.lookBackUnits;
  camera.targetUnits = camera.units;
  camera.isParked = false;
  labelShownSinceMs.fill(-1);
  labelFreeSinceMs.fill(-1);
}

/**
 * accentFor(color, index) → the second color of car `index`, drawn in `color`: the accent of
 * its dozen, or the next one when that is its own color; null for a single-tone car.
 */
function accentFor(color, index) {
  const dozen = Math.floor(index / CAR_COLORS.length);
  let slot = dozen % CAR_ACCENTS.length;
  if (CAR_ACCENTS[slot] === color) {
    slot += 1;
    if (slot === CAR_ACCENTS.length) slot = 1;
  }
  return CAR_ACCENTS[slot];
}

/* ==== CAMERA ==== */

/**
 * horizonY() → the horizon's screen y.
 */
function horizonY() {
  return view.height * HORIZON_FRACTION;
}

/**
 * roadHalfWidthNearPx() → the road's half-width at the bottom edge, in pixels.
 */
function roadHalfWidthNearPx() {
  return Math.min(
    view.width * ROAD_HALF_WIDTH_FRACTION,
    view.height * ROAD_HALF_WIDTH_HEIGHT_CAP,
  );
}

/**
 * updateCamera(snapshot, frameDeltaSec) → moves the camera toward its target: a fixed distance
 * behind the leader, until the first car crosses; then it stays parked at the finish line so
 * the rest stream across (Rich, 2026-11-01).
 */
function updateCamera(snapshot, frameDeltaSec) {
  const lookBack = scene.config.lookBackUnits;
  if (!camera.isParked && snapshot.crossedCount > 0) camera.isParked = true;
  camera.targetUnits = camera.isParked
    ? scene.layout.finishUnits - lookBack
    : snapshot.distance[snapshot.leader] - lookBack;
  const share = Math.min(1, CAMERA_FOLLOW_PER_SEC * frameDeltaSec);
  camera.units += (camera.targetUnits - camera.units) * share;
}

/**
 * curvatureAt(trackUnits) → the road's bend at a distance, negative left and positive right,
 * zero on the straights, rising from the corner's start to its apex and falling back to zero at
 * its end, so the road straightens exactly where the cars open the throttle; a hairpin bends
 * harder than a sweeper by its sharpness.
 */
function curvatureAt(trackUnits) {
  const { turns } = scene.layout;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (trackUnits < turn.cornerStart || trackUnits > turn.cornerEnd) continue;
    const strength = BEND_STRENGTH_SWEEPER
      + (BEND_STRENGTH_HAIRPIN - BEND_STRENGTH_SWEEPER) * turn.sharpness;
    if (trackUnits < turn.apex) {
      return turn.direction * strength * (trackUnits - turn.cornerStart)
        / (turn.apex - turn.cornerStart);
    }
    return turn.direction * strength * (turn.cornerEnd - trackUnits)
      / (turn.cornerEnd - turn.apex);
  }
  return 0;
}

/**
 * farScale() → the perspective scale at the far end of the drawn road (roadViewUnits ahead).
 */
function farScale() {
  return Math.min(1, scene.config.cameraNearUnits / scene.config.roadViewUnits);
}

/**
 * computeStrips() → for each road strip from the bottom edge to the far end of the drawn
 * road: its depth from the camera (track units), its perspective scale and the road centre's
 * lateral offset (in road widths, from the bend integrated outward in steps of at most
 * BEND_STEP_UNITS). The same table places the cars.
 */
function computeStrips() {
  const near = scene.config.cameraNearUnits;
  const far = farScale();
  let heading = 0;
  let lateral = 0;
  let previousDepth = near;
  for (let i = 0; i <= ROAD_STRIPS; i++) {
    const scale = 1 - (i / ROAD_STRIPS) * (1 - far);
    const depth = near / scale;
    const stepCount = Math.max(1, Math.ceil((depth - previousDepth) / BEND_STEP_UNITS));
    const stepUnits = (depth - previousDepth) / stepCount;
    for (let step = 1; step <= stepCount; step++) {
      const stepDepth = previousDepth + stepUnits * step;
      heading += curvatureAt(camera.units + stepDepth) * BEND_GAIN * stepUnits;
      lateral += heading * stepUnits;
    }
    strips.depth[i] = depth;
    strips.scale[i] = scale;
    strips.lateral[i] = lateral;
    previousDepth = depth;
  }
}

/**
 * stripIndexFor(depthUnits) → the strip table position (fractional) for a depth, for
 * interpolating a car's lateral offset; clamped to the table past the far end.
 */
function stripIndexFor(depthUnits) {
  const scale = scene.config.cameraNearUnits / depthUnits;
  const position = ((1 - scale) / (1 - farScale())) * ROAD_STRIPS;
  return Math.min(ROAD_STRIPS, Math.max(0, position));
}

/**
 * lateralAt(depthUnits) → the road centre's lateral offset at a depth, interpolated.
 */
function lateralAt(depthUnits) {
  const position = stripIndexFor(depthUnits);
  const low = Math.floor(position);
  const high = Math.min(ROAD_STRIPS, low + 1);
  const mix = position - low;
  return strips.lateral[low] + (strips.lateral[high] - strips.lateral[low]) * mix;
}

/**
 * screenYAt(scale) → the screen y for a perspective scale (1 at the bottom edge, 0 at the
 * horizon).
 */
function screenYAt(scale) {
  return horizonY() + (view.height - horizonY()) * scale;
}

/**
 * roadCentreXAt(scale, lateral) → the road centre's screen x at a depth: the lateral offset
 * is in road widths, so it is scaled with the road.
 */
function roadCentreXAt(scale, lateral) {
  return view.width / 2 + lateral * roadHalfWidthNearPx() * 2 * scale;
}

/* ==== ROAD ==== */

/**
 * drawBackground() → sky above the horizon, verge below.
 */
function drawBackground() {
  const { ctx } = view;
  ctx.fillStyle = COLOR_SKY;
  ctx.fillRect(0, 0, view.width, horizonY());
  ctx.fillStyle = COLOR_VERGE;
  ctx.fillRect(0, horizonY(), view.width, view.height - horizonY());
}

/**
 * fillStrip(leftNear, rightNear, yNear, leftFar, rightFar, yFar, color) → one trapezoid.
 */
function fillStrip(leftNear, rightNear, yNear, leftFar, rightFar, yFar, color) {
  const { ctx } = view;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(leftNear, yNear);
  ctx.lineTo(rightNear, yNear);
  ctx.lineTo(rightFar, yFar);
  ctx.lineTo(leftFar, yFar);
  ctx.closePath();
  ctx.fill();
}

/**
 * mixedColor(hex, targetHex, share) → a '#rrggbb' colour mixed toward another by `share` (0
 * keeps it, 1 is the target), as an rgb() string. Opaque fills, never alpha: an alpha fill over
 * the fill below it lets that one show through, and the kerb red bled onto the tarmac (found on
 * the phone, 2026-11-01).
 */
function mixedColor(hex, targetHex, share) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const targetRed = parseInt(targetHex.slice(1, 3), 16);
  const targetGreen = parseInt(targetHex.slice(3, 5), 16);
  const targetBlue = parseInt(targetHex.slice(5, 7), 16);
  const mixedRed = Math.round(red + (targetRed - red) * share);
  const mixedGreen = Math.round(green + (targetGreen - green) * share);
  const mixedBlue = Math.round(blue + (targetBlue - blue) * share);
  return `rgb(${mixedRed}, ${mixedGreen}, ${mixedBlue})`;
}

/**
 * fadedColor(hex, fade) → `hex` mixed toward the verge by `fade`, for the road's roll-off.
 */
function fadedColor(hex, fade) {
  return mixedColor(hex, COLOR_VERGE, fade);
}

/**
 * drawRoad() → the road from the bottom edge to its far end, strip by strip: tarmac in two
 * alternating shades, red and white kerbs beside it (never under it) and the centre dashes,
 * all repeating by track position so they scroll as the camera moves. Strip edges sit on
 * whole pixels so no seam shows between strips. The last ROAD_FADE_FRACTION of the strips are
 * mixed toward the verge, so the road rolls off at a vanishing point.
 */
function drawRoad() {
  const halfNear = roadHalfWidthNearPx();
  const fadeStart = ROAD_STRIPS * (1 - ROAD_FADE_FRACTION);
  for (let i = 0; i < ROAD_STRIPS; i++) {
    const fade = i < fadeStart ? 0 : (i - fadeStart) / (ROAD_STRIPS - fadeStart);
    const scaleNear = strips.scale[i];
    const scaleFar = strips.scale[i + 1];
    const yNear = Math.round(screenYAt(scaleNear));
    const yFar = Math.round(screenYAt(scaleFar));
    if (yFar >= yNear) continue;
    const centreNear = roadCentreXAt(scaleNear, strips.lateral[i]);
    const centreFar = roadCentreXAt(scaleFar, strips.lateral[i + 1]);
    const halfWidthNear = halfNear * scaleNear;
    const halfWidthFar = halfNear * scaleFar;
    const trackUnits = camera.units + strips.depth[i];
    const isEvenRoad = Math.floor(trackUnits / scene.config.dashUnits) % 2 === 0;
    const isEvenKerb = Math.floor(trackUnits / scene.config.kerbUnits) % 2 === 0;
    const kerbNear = halfWidthNear * KERB_WIDTH_FRACTION;
    const kerbFar = halfWidthFar * KERB_WIDTH_FRACTION;
    const kerbColor = fadedColor(isEvenKerb ? COLOR_KERB_RED : COLOR_KERB_WHITE, fade);
    // Each kerb reaches one pixel under the tarmac's edge, so the slanted join never shows
    // the verge through its anti-aliasing.
    fillStrip(
      centreNear - halfWidthNear - kerbNear, centreNear - halfWidthNear + 1, yNear,
      centreFar - halfWidthFar - kerbFar, centreFar - halfWidthFar + 1, yFar,
      kerbColor,
    );
    fillStrip(
      centreNear + halfWidthNear - 1, centreNear + halfWidthNear + kerbNear, yNear,
      centreFar + halfWidthFar - 1, centreFar + halfWidthFar + kerbFar, yFar,
      kerbColor,
    );
    fillStrip(
      centreNear - halfWidthNear, centreNear + halfWidthNear, yNear,
      centreFar - halfWidthFar, centreFar + halfWidthFar, yFar,
      fadedColor(isEvenRoad ? COLOR_ROAD_A : COLOR_ROAD_B, fade),
    );
    if (isEvenRoad) {
      const dashNear = halfWidthNear * DASH_WIDTH_FRACTION;
      const dashFar = halfWidthFar * DASH_WIDTH_FRACTION;
      fillStrip(
        centreNear - dashNear, centreNear + dashNear, yNear,
        centreFar - dashFar, centreFar + dashFar, yFar,
        fadedColor(COLOR_LINE, fade),
      );
    }
  }
}

/**
 * drawBoards() → the braking boards before every corner in view: `boardCount` of them,
 * `boardUnits` apart on the straight before the corner's start, on the outside verge (the
 * side away from the turn), far to near so a near board paints over a far one. A board that
 * would stand before the start line is not drawn. Far boards fade with the road.
 */
function drawBoards() {
  const { boardCount, boardUnits, cameraNearUnits, roadViewUnits } = scene.config;
  if (boardCount <= 0) return;
  const { turns } = scene.layout;
  const fadeStart = ROAD_STRIPS * (1 - ROAD_FADE_FRACTION);
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    for (let bars = boardCount; bars >= 1; bars--) {
      const trackUnits = turn.cornerStart - bars * boardUnits;
      if (trackUnits < 0) continue;
      const depth = trackUnits - camera.units;
      if (depth < cameraNearUnits || depth > roadViewUnits) continue;
      const stripIndex = stripIndexFor(depth);
      const fade = stripIndex < fadeStart
        ? 0
        : (stripIndex - fadeStart) / (ROAD_STRIPS - fadeStart);
      drawBoard(depth, -turn.direction, bars, fade);
    }
  }
}

/**
 * drawBoard(depth, side, barCount, fade) → one braking board at `depth` (track units from the
 * camera) on `side` of the road (-1 left, 1 right): a post from the verge, a white board on
 * top with `barCount` red bars, both mixed toward the verge by `fade` (0 to 1).
 */
function drawBoard(depth, side, barCount, fade) {
  const scale = scene.config.cameraNearUnits / depth;
  const halfWidth = roadHalfWidthNearPx() * scale;
  const width = halfWidth * BOARD_WIDTH_FRACTION;
  if (width < BOARD_MIN_WIDTH_PX) return;
  const x = roadCentreXAt(scale, lateralAt(depth)) + side * halfWidth * BOARD_OFFSET_FRACTION;
  const groundY = screenYAt(scale);
  const height = width * BOARD_HEIGHT_RATIO;
  const postHeight = width * BOARD_POST_RATIO;
  const postWidth = Math.max(1, width * BOARD_POST_WIDTH_FRACTION);
  const top = groundY - postHeight - height;
  const { ctx } = view;
  ctx.fillStyle = fadedColor(COLOR_KERB_WHITE, fade);
  ctx.fillRect(x - postWidth / 2, groundY - postHeight, postWidth, postHeight);
  ctx.fillRect(x - width / 2, top, width, height);
  ctx.fillStyle = fadedColor(COLOR_KERB_RED, fade);
  const barWidth = width / (barCount * 2 + 1);
  const barTop = top + height * BOARD_BAR_INSET_RATIO;
  const barHeight = height * BOARD_BAR_HEIGHT_RATIO;
  for (let bar = 0; bar < barCount; bar++) {
    ctx.fillRect(x - width / 2 + barWidth * (2 * bar + 1), barTop, barWidth, barHeight);
  }
}

/**
 * drawFinishLine() → the checkered band across the road at the finish distance, with FINISH
 * above it, when it is in view.
 */
function drawFinishLine() {
  const depth = scene.layout.finishUnits - camera.units;
  const near = scene.config.cameraNearUnits;
  const farDepth = Math.min(scene.config.viewDepthUnits * 2, scene.config.roadViewUnits);
  if (depth < near || depth > farDepth) return;
  const scale = near / depth;
  const y = screenYAt(scale);
  const centre = roadCentreXAt(scale, lateralAt(depth));
  const halfWidth = roadHalfWidthNearPx() * scale;
  const bandHeight = Math.max(3, view.height * FINISH_BAND_FRACTION * scale);
  const checkWidth = halfWidth * 2 / FINISH_CHECKS;
  const { ctx } = view;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < FINISH_CHECKS; i++) {
      ctx.fillStyle = (i + row) % 2 === 0 ? COLOR_KERB_WHITE : COLOR_TYRE;
      ctx.fillRect(
        centre - halfWidth + i * checkWidth,
        y - bandHeight + row * bandHeight / 2,
        checkWidth + 0.5,
        bandHeight / 2,
      );
    }
  }
  const fontPx = Math.max(LABEL_FONT_MIN_PX, Math.min(28, 40 * scale));
  if (fontPx < LABEL_FONT_MIN_PX + 1) return;
  ctx.fillStyle = COLOR_LABEL_TEXT;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('FINISH', centre, y - bandHeight - 2);
}

/* ==== CARS ==== */

/**
 * drawCar(x, y, widthPx, car) → car `car` from behind with its bottom centre at (x, y), drawn
 * widthPx wide from primitives in its color and accent (CAR_SHAPE has the proportions). Back to
 * front: tyres and wishbones, the diffuser, the pods, the wing pillars, the roll hoop and the
 * helmet, the engine cover over them (only the helmet's top shows), the wing last. These are
 * the only functions that know what a car looks like, so sprites could replace them later.
 */
function drawCar(x, y, widthPx, car) {
  const heightPx = widthPx * CAR_HEIGHT_RATIO;
  const isDetailed = widthPx >= CAR_DETAIL_MIN_PX;
  drawTyres(x, y, widthPx, heightPx);
  if (isDetailed) drawWishbones(x, y, widthPx, heightPx);
  drawDiffuser(x, y, widthPx, heightPx, isDetailed);
  drawPods(x, y, widthPx, heightPx, car, isDetailed);
  drawPillars(x, y, widthPx, heightPx);
  if (isDetailed) drawRollHoop(x, y, widthPx, heightPx);
  drawHelmet(x, y, widthPx, heightPx);
  drawEngineCover(x, y, widthPx, heightPx, car);
  drawWing(x, y, widthPx, heightPx, car, isDetailed);
}

/**
 * fillRoundedRect(left, top, width, height, radius) → fills a rectangle with rounded corners
 * (radius capped at half the shorter side), in the current fill style.
 */
function fillRoundedRect(left, top, width, height, radius) {
  const { ctx } = view;
  const corner = Math.min(radius, width / 2, height / 2);
  const right = left + width;
  const bottom = top + height;
  ctx.beginPath();
  ctx.moveTo(left + corner, top);
  ctx.lineTo(right - corner, top);
  ctx.arcTo(right, top, right, top + corner, corner);
  ctx.lineTo(right, bottom - corner);
  ctx.arcTo(right, bottom, right - corner, bottom, corner);
  ctx.lineTo(left + corner, bottom);
  ctx.arcTo(left, bottom, left, bottom - corner, corner);
  ctx.lineTo(left, top + corner);
  ctx.arcTo(left, top, left + corner, top, corner);
  ctx.closePath();
  ctx.fill();
}

/**
 * drawTyres(x, y, widthPx, heightPx) → the two rear tyres at the car's outer edges: a rounded
 * tread band over black that squares off where the tyre meets the road.
 */
function drawTyres(x, y, widthPx, heightPx) {
  const { ctx } = view;
  const tyreWidth = widthPx * CAR_SHAPE.tyreWidth;
  const tyreHeight = heightPx * CAR_SHAPE.tyreHeight;
  const treadHeight = tyreHeight * CAR_SHAPE.treadHeight;
  const corner = tyreWidth * CAR_SHAPE.tyreCorner;
  for (let side = -1; side <= 1; side += 2) {
    let left = x - widthPx / 2;
    if (side > 0) left = x + widthPx / 2 - tyreWidth;
    ctx.fillStyle = COLOR_TREAD;
    fillRoundedRect(left, y - tyreHeight, tyreWidth, tyreHeight, corner);
    ctx.fillStyle = COLOR_TYRE;
    ctx.fillRect(left, y - tyreHeight + treadHeight, tyreWidth, tyreHeight - treadHeight);
  }
}

/**
 * drawWishbones(x, y, widthPx, heightPx) → the rear suspension: an upper and a lower arm from
 * the body out to each tyre, rising slightly toward the tyre.
 */
function drawWishbones(x, y, widthPx, heightPx) {
  const { ctx } = view;
  ctx.strokeStyle = COLOR_CAR_DARK;
  ctx.lineWidth = Math.max(1, widthPx * CAR_SHAPE.wishboneWidth);
  ctx.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    const inner = x + side * widthPx * CAR_SHAPE.wishboneBodyX;
    const outer = x + side * (widthPx / 2 - widthPx * CAR_SHAPE.tyreWidth);
    ctx.moveTo(inner, y - heightPx * CAR_SHAPE.wishboneUpperY);
    ctx.lineTo(outer, y - heightPx * (CAR_SHAPE.wishboneUpperY + CAR_SHAPE.wishboneUpperRise));
    ctx.moveTo(inner, y - heightPx * CAR_SHAPE.wishboneLowerY);
    ctx.lineTo(outer, y - heightPx * (CAR_SHAPE.wishboneLowerY + CAR_SHAPE.wishboneLowerRise));
  }
  ctx.stroke();
}

/**
 * drawDiffuser(x, y, widthPx, heightPx, isDetailed) → the dark diffuser along the bottom, with
 * vertical strakes when the car is drawn wide enough.
 */
function drawDiffuser(x, y, widthPx, heightPx, isDetailed) {
  const { ctx } = view;
  const halfWidth = widthPx * CAR_SHAPE.diffuserHalfWidth;
  const height = heightPx * CAR_SHAPE.diffuserHeight;
  ctx.fillStyle = COLOR_CAR_DARK;
  ctx.fillRect(x - halfWidth, y - height, halfWidth * 2, height);
  if (!isDetailed) return;
  const strakeWidth = Math.max(1, widthPx * CAR_SHAPE.strakeWidth);
  ctx.fillStyle = COLOR_TREAD;
  for (let i = 0; i < STRAKE_POSITIONS.length; i++) {
    const strakeX = x + halfWidth * STRAKE_POSITIONS[i] - strakeWidth / 2;
    ctx.fillRect(strakeX, y - height, strakeWidth, height);
  }
}

/**
 * drawPods(x, y, widthPx, heightPx, car, isDetailed) → the wide low pods across the back: a
 * band along the rounded top edge in the accent (a lighter shade on a single-tone car), the
 * car's color below it, squared off at the diffuser, and an exhaust in each when detailed.
 */
function drawPods(x, y, widthPx, heightPx, car, isDetailed) {
  const { ctx } = view;
  const left = x - widthPx * CAR_SHAPE.podHalfWidth;
  const podWidth = widthPx * CAR_SHAPE.podHalfWidth * 2;
  const top = y - heightPx * CAR_SHAPE.podTopY;
  const podHeight = heightPx * (CAR_SHAPE.podTopY - CAR_SHAPE.podBottomY);
  const accent = scene.accents[car];
  let bandHeight = heightPx * CAR_SHAPE.podShadeHeight;
  if (accent) bandHeight = heightPx * CAR_SHAPE.podBandHeight;
  ctx.fillStyle = accent || scene.lightColors[car];
  fillRoundedRect(left, top, podWidth, podHeight, widthPx * CAR_SHAPE.podCorner);
  ctx.fillStyle = scene.colors[car];
  ctx.fillRect(left, top + bandHeight, podWidth, podHeight - bandHeight);
  if (!isDetailed) return;
  ctx.fillStyle = COLOR_TYRE;
  ctx.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    const exhaustX = x + side * widthPx * CAR_SHAPE.exhaustX;
    const exhaustY = y - heightPx * CAR_SHAPE.exhaustY;
    ctx.moveTo(exhaustX + widthPx * CAR_SHAPE.exhaustRadius, exhaustY);
    ctx.arc(exhaustX, exhaustY, widthPx * CAR_SHAPE.exhaustRadius, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * drawPillars(x, y, widthPx, heightPx) → the two dark pillars from the engine cover up to the
 * wing; the cover and the wing are drawn over their ends.
 */
function drawPillars(x, y, widthPx, heightPx) {
  const { ctx } = view;
  const pillarWidth = widthPx * CAR_SHAPE.pillarWidth;
  const top = y - heightPx * CAR_SHAPE.pillarTopY;
  const pillarHeight = heightPx * (CAR_SHAPE.pillarTopY - CAR_SHAPE.pillarBottomY);
  ctx.fillStyle = COLOR_CAR_DARK;
  ctx.fillRect(x - widthPx * CAR_SHAPE.pillarInnerX - pillarWidth, top, pillarWidth, pillarHeight);
  ctx.fillRect(x + widthPx * CAR_SHAPE.pillarInnerX, top, pillarWidth, pillarHeight);
}

/**
 * drawRollHoop(x, y, widthPx, heightPx) → the roll hoop's arc behind the helmet; the engine
 * cover hides its legs.
 */
function drawRollHoop(x, y, widthPx, heightPx) {
  const { ctx } = view;
  ctx.strokeStyle = COLOR_CAR_DARK;
  ctx.lineWidth = Math.max(1, widthPx * CAR_SHAPE.hoopWidth);
  ctx.beginPath();
  ctx.arc(x, y - heightPx * CAR_SHAPE.hoopY, widthPx * CAR_SHAPE.hoopRadius, Math.PI, Math.PI * 2);
  ctx.stroke();
}

/**
 * drawHelmet(x, y, widthPx, heightPx) → the helmet, drawn whole; the engine cover over it
 * leaves only the top showing (Rich, 2026-11-02).
 */
function drawHelmet(x, y, widthPx, heightPx) {
  const { ctx } = view;
  ctx.fillStyle = COLOR_HELMET;
  ctx.beginPath();
  ctx.arc(x, y - heightPx * CAR_SHAPE.helmetY, widthPx * CAR_SHAPE.helmetRadius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * coverHalfWidthAt(widthPx, yShare) → the engine cover's half-width in pixels at `yShare` of
 * the car's height: it tapers in a straight line from its base to its top.
 */
function coverHalfWidthAt(widthPx, yShare) {
  const climb = (yShare - CAR_SHAPE.coverBaseY) / (CAR_SHAPE.coverTopY - CAR_SHAPE.coverBaseY);
  const taper = CAR_SHAPE.coverTopHalfWidth - CAR_SHAPE.coverBaseHalfWidth;
  return widthPx * (CAR_SHAPE.coverBaseHalfWidth + taper * climb);
}

/**
 * fillCoverSlice(x, y, widthPx, heightPx, bottomShare, topShare) → the engine cover between
 * two heights (shares of the car's height), as a trapezoid in the current fill style.
 */
function fillCoverSlice(x, y, widthPx, heightPx, bottomShare, topShare) {
  const { ctx } = view;
  const bottomHalf = coverHalfWidthAt(widthPx, bottomShare);
  const topHalf = coverHalfWidthAt(widthPx, topShare);
  const bottom = y - heightPx * bottomShare;
  const top = y - heightPx * topShare;
  ctx.beginPath();
  ctx.moveTo(x - bottomHalf, bottom);
  ctx.lineTo(x + bottomHalf, bottom);
  ctx.lineTo(x + topHalf, top);
  ctx.lineTo(x - topHalf, top);
  ctx.closePath();
  ctx.fill();
}

/**
 * drawEngineCover(x, y, widthPx, heightPx, car) → the cover rising out of the pods, in the
 * car's color with a lighter band along its top and, on a two-tone car, a band in the accent.
 */
function drawEngineCover(x, y, widthPx, heightPx, car) {
  const { ctx } = view;
  ctx.fillStyle = scene.colors[car];
  fillCoverSlice(x, y, widthPx, heightPx, CAR_SHAPE.coverBaseY, CAR_SHAPE.coverTopY);
  ctx.fillStyle = scene.lightColors[car];
  fillCoverSlice(
    x,
    y,
    widthPx,
    heightPx,
    CAR_SHAPE.coverTopY - CAR_SHAPE.coverShadeHeight,
    CAR_SHAPE.coverTopY,
  );
  const accent = scene.accents[car];
  if (!accent) return;
  ctx.fillStyle = accent;
  fillCoverSlice(
    x,
    y,
    widthPx,
    heightPx,
    CAR_SHAPE.coverBandY,
    CAR_SHAPE.coverBandY + CAR_SHAPE.coverBandHeight,
  );
}

/**
 * drawWing(x, y, widthPx, heightPx, car, isDetailed) → the two-element rear wing, low over the
 * cover: the main plane in the car's color, lit along its top edge and dark underneath; the
 * flap above it and the endplates in the accent; the rain light on the plane when detailed.
 */
function drawWing(x, y, widthPx, heightPx, car, isDetailed) {
  const { ctx } = view;
  const halfWidth = widthPx * CAR_SHAPE.wingHalfWidth;
  const top = y - heightPx * CAR_SHAPE.wingTopY;
  const thickness = heightPx * CAR_SHAPE.wingThickness;
  const undersideHeight = thickness * CAR_SHAPE.wingUndersideShare;
  ctx.fillStyle = scene.colors[car];
  ctx.fillRect(x - halfWidth, top, halfWidth * 2, thickness);
  ctx.fillStyle = scene.lightColors[car];
  ctx.fillRect(x - halfWidth, top, halfWidth * 2, thickness * CAR_SHAPE.wingShadeShare);
  ctx.fillStyle = scene.darkColors[car];
  ctx.fillRect(x - halfWidth, top + thickness - undersideHeight, halfWidth * 2, undersideHeight);
  const flapHalfWidth = widthPx * CAR_SHAPE.flapHalfWidth;
  const flapThickness = heightPx * CAR_SHAPE.flapThickness;
  const flapTop = top - heightPx * CAR_SHAPE.flapGapY - flapThickness;
  ctx.fillStyle = scene.accents[car] || scene.colors[car];
  ctx.fillRect(x - flapHalfWidth, flapTop, flapHalfWidth * 2, flapThickness);
  const plateWidth = widthPx * CAR_SHAPE.endplateWidth;
  const plateTop = y - heightPx * CAR_SHAPE.endplateTopY;
  const plateHeight = heightPx * (CAR_SHAPE.endplateTopY - CAR_SHAPE.endplateBottomY);
  ctx.fillRect(x - halfWidth - plateWidth, plateTop, plateWidth, plateHeight);
  ctx.fillRect(x + halfWidth, plateTop, plateWidth, plateHeight);
  if (!isDetailed) return;
  const lightWidth = widthPx * CAR_SHAPE.rainLightWidth;
  ctx.fillStyle = COLOR_LIGHT_ON;
  ctx.fillRect(
    x - lightWidth / 2,
    top + thickness * CAR_SHAPE.rainLightInset,
    lightWidth,
    thickness * CAR_SHAPE.rainLightHeight,
  );
}

/**
 * labelFontPx(widthPx, isTop) → the label font for a car drawn widthPx wide: a share of the
 * car's width within bounds; a top-three label never goes below LABEL_FONT_TOP_MIN_PX.
 */
function labelFontPx(widthPx, isTop) {
  const minPx = isTop ? LABEL_FONT_TOP_MIN_PX : LABEL_FONT_MIN_PX;
  return Math.max(minPx, Math.min(LABEL_FONT_MAX_PX, widthPx * LABEL_FONT_FRACTION));
}

/**
 * drawLabel(x, y, widthPx, text, fontPx) → a name on a dark pill directly above the car at
 * (x, y) drawn widthPx wide.
 */
function drawLabel(x, y, widthPx, text, fontPx) {
  const { ctx } = view;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const textWidth = ctx.measureText(text).width;
  const top = y - widthPx * CAR_HEIGHT_RATIO - fontPx - LABEL_PADDING_PX * 2;
  ctx.fillStyle = COLOR_LABEL_BG;
  ctx.fillRect(
    x - textWidth / 2 - LABEL_PADDING_PX,
    top,
    textWidth + LABEL_PADDING_PX * 2,
    fontPx + LABEL_PADDING_PX * 2,
  );
  ctx.fillStyle = COLOR_LABEL_TEXT;
  ctx.fillText(text, x, top + fontPx + LABEL_PADDING_PX);
}

/**
 * drawLabels(frameTimeMs) → places this frame's label candidates, each directly over its car
 * and never lifted into a stack (Rich, 2026-11-02): the top three of the live order first,
 * always drawn, walked from third to first so that where two of them overlap the car ahead is
 * painted last and stays whole; then the labels already shown, oldest first, each kept while
 * its spot is clear, so an established name yields only to a top-three name or an older one;
 * then the newcomers nearest car first, each drawn once its spot has been clear for
 * labelShowDelayMs (Rich, 2026-11-02: names that popped in and out could not be read). A
 * bunched pack never reads as a pile of text. The candidates arrive far to near, which for the
 * top three is race order. The accepted boxes are kept in the same arrays, compacted from the
 * front. A car with no candidate this frame (off the stage, too small, or the names held)
 * starts over.
 */
function drawLabels(frameTimeMs) {
  let accepted = 0;
  labelIsCandidate.fill(0, 0, scene.carCount);
  for (let i = labels.count - 1; i >= 0; i--) {
    if (!labels.isTop[i]) continue;
    const car = labels.car[i];
    labelIsCandidate[car] = 1;
    if (labelShownSinceMs[car] < 0) labelShownSinceMs[car] = frameTimeMs;
    measureLabel(i, true);
    accepted = acceptLabel(i, accepted);
  }
  const shownCount = collectShown();
  for (let shown = 0; shown < shownCount; shown++) {
    const i = shownOrder[shown];
    measureLabel(i, false);
    if (isBoxFree(labelBox.left, labelBox.right, labelBox.top, labelBox.bottom, accepted)) {
      accepted = acceptLabel(i, accepted);
    } else {
      hideLabel(labels.car[i]);
    }
  }
  const delayMs = scene.config.labelShowDelayMs;
  for (let i = labels.count - 1; i >= 0; i--) {
    const car = labels.car[i];
    if (labels.isTop[i] || labelShownSinceMs[car] >= 0) continue;
    measureLabel(i, false);
    if (!isBoxFree(labelBox.left, labelBox.right, labelBox.top, labelBox.bottom, accepted)) {
      labelFreeSinceMs[car] = -1;
      continue;
    }
    if (labelFreeSinceMs[car] < 0) labelFreeSinceMs[car] = frameTimeMs;
    if (frameTimeMs - labelFreeSinceMs[car] < delayMs) continue;
    labelShownSinceMs[car] = frameTimeMs;
    accepted = acceptLabel(i, accepted);
  }
  for (let car = 0; car < scene.carCount; car++) {
    if (!labelIsCandidate[car]) hideLabel(car);
  }
  labels.count = 0;
}

/**
 * collectShown() → how many of this frame's pack candidates already carry a label, their
 * indices put in `shownOrder` oldest first; every pack candidate is marked as one.
 */
function collectShown() {
  let count = 0;
  for (let i = 0; i < labels.count; i++) {
    const car = labels.car[i];
    if (labels.isTop[i]) continue;
    labelIsCandidate[car] = 1;
    if (labelShownSinceMs[car] < 0) continue;
    let slot = count;
    while (slot > 0 && shownSinceOf(shownOrder[slot - 1]) > labelShownSinceMs[car]) {
      shownOrder[slot] = shownOrder[slot - 1];
      slot--;
    }
    shownOrder[slot] = i;
    count++;
  }
  return count;
}

/**
 * shownSinceOf(i) → when candidate i's car was first shown with a label.
 */
function shownSinceOf(i) {
  return labelShownSinceMs[labels.car[i]];
}

/**
 * hideLabel(car) → the car's label is no longer shown and its spot no longer counted clear.
 */
function hideLabel(car) {
  labelShownSinceMs[car] = -1;
  labelFreeSinceMs[car] = -1;
}

/**
 * measureLabel(i, isForced) → candidate i's box at rest over its car, into `labelBox`, with
 * the canvas font set for it.
 */
function measureLabel(i, isForced) {
  const { ctx } = view;
  const fontPx = labelFontPx(labels.widthPx[i], isForced);
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  const text = scene.displayNames[labels.car[i]];
  const halfWidth = ctx.measureText(text).width / 2 + LABEL_PADDING_PX;
  const heightPx = fontPx + LABEL_PADDING_PX * 2;
  labelBox.fontPx = fontPx;
  labelBox.left = labels.x[i] - halfWidth;
  labelBox.right = labels.x[i] + halfWidth;
  labelBox.bottom = labels.y[i] - labels.widthPx[i] * CAR_HEIGHT_RATIO;
  labelBox.top = labelBox.bottom - heightPx;
}

/**
 * acceptLabel(i, accepted) → the accepted count after drawing candidate i at the box last
 * measured and recording that box at index `accepted`.
 */
function acceptLabel(i, accepted) {
  const text = scene.displayNames[labels.car[i]];
  drawLabel(labels.x[i], labels.y[i], labels.widthPx[i], text, labelBox.fontPx);
  labels.left[accepted] = labelBox.left;
  labels.right[accepted] = labelBox.right;
  labels.top[accepted] = labelBox.top;
  labels.bottom[accepted] = labelBox.bottom;
  return accepted + 1;
}

/**
 * isBoxFree(left, right, top, bottom, accepted) → whether the box clears every accepted box.
 */
function isBoxFree(left, right, top, bottom, accepted) {
  for (let j = 0; j < accepted; j++) {
    const isApart = right < labels.left[j]
      || left > labels.right[j]
      || bottom < labels.top[j]
      || top > labels.bottom[j];
    if (!isApart) return false;
  }
  return true;
}

/**
 * drawCars(snapshot, isLabelled, frameTimeMs) → every car in view, far to near so the near ones
 * overlap, each at its lane across the road; when `isLabelled`, labels on the cars drawn at
 * least labelMinWidthPx wide and always on the top three of the live order (Rich, 2026-11-01).
 */
function drawCars(snapshot, isLabelled, frameTimeMs) {
  const near = scene.config.cameraNearUnits;
  const far = scene.config.viewDepthUnits;
  const carWidthNear = roadHalfWidthNearPx() * 2 * CAR_WIDTH_FRACTION;
  const labelMin = scene.config.labelMinWidthPx;
  // snapshot.order is leader first: the furthest car along the road comes first.
  for (let i = 0; i < scene.carCount; i++) {
    const car = snapshot.order[i];
    const depth = snapshot.distance[car] - camera.units;
    if (depth < near * 0.8 || depth > far) continue;
    const scale = near / depth;
    const y = screenYAt(scale);
    const centre = roadCentreXAt(scale, lateralAt(depth));
    const x = centre + snapshot.lane[car] * roadHalfWidthNearPx() * scale * 0.82;
    const widthPx = carWidthNear * scale;
    drawCar(x, y, widthPx, car);
    const isTop = i < TOP_LABEL_COUNT;
    if (isLabelled && (isTop || widthPx >= labelMin) && labels.count < MAX_CARS) {
      labels.car[labels.count] = car;
      labels.x[labels.count] = x;
      labels.y[labels.count] = y;
      labels.widthPx[labels.count] = widthPx;
      labels.isTop[labels.count] = isTop ? 1 : 0;
      labels.count++;
    }
  }
  drawLabels(frameTimeMs);
}

/* ==== LIGHTS ==== */

/**
 * lightsGeometry() → where the start lights go: { diameter, gap, totalWidth, boxTop, boxHeight,
 * centredLeft }. The box sits just above the cars on the start line (where the camera's
 * look-back puts them at tick 0), centred on the road there (Rich, 2026-11-01).
 */
function lightsGeometry() {
  const diameter = Math.min(LIGHT_MAX_DIAMETER_PX, view.width * LIGHT_DIAMETER_FRACTION);
  const gap = diameter * 0.5;
  const totalWidth = LIGHT_COUNT * diameter + (LIGHT_COUNT - 1) * gap;
  const startScale = Math.min(1, scene.config.cameraNearUnits / scene.config.lookBackUnits);
  const carHeightPx = roadHalfWidthNearPx() * 2 * CAR_WIDTH_FRACTION * startScale
    * CAR_HEIGHT_RATIO;
  const boxHeight = diameter + gap;
  const boxBottom = screenYAt(startScale) - carHeightPx - LIGHT_CLEARANCE_PX;
  const boxTop = Math.max(LIGHT_TOP_MARGIN_PX, boxBottom - boxHeight);
  const roadCentreX = roadCentreXAt(startScale, lateralAt(scene.config.lookBackUnits));
  const centredLeft = roadCentreX - totalWidth / 2;
  return { diameter, gap, totalWidth, boxTop, boxHeight, centredLeft };
}

/**
 * drawLights(litCount) → the start lights over the road: three discs, `litCount` of them red,
 * drawn while the countdown runs and for a moment after they go out, centred on the road at
 * the start line (nothing else is on the stage then: the tower is held until after lights
 * out; Rich, 2026-11-02).
 */
function drawLights(litCount) {
  const { ctx } = view;
  const { diameter, gap, totalWidth, boxTop, boxHeight, centredLeft } = lightsGeometry();
  const top = boxTop + gap / 2;
  const left = centredLeft;
  ctx.fillStyle = COLOR_TYRE;
  ctx.fillRect(left - gap, boxTop, totalWidth + gap * 2, boxHeight);
  for (let i = 0; i < LIGHT_COUNT; i++) {
    ctx.fillStyle = i < litCount ? COLOR_LIGHT_ON : COLOR_LIGHT_OFF;
    ctx.beginPath();
    ctx.arc(left + i * (diameter + gap) + diameter / 2, top + diameter / 2, diameter / 2, 0,
      Math.PI * 2);
    ctx.fill();
  }
}

/* ==== FRAME ==== */

/**
 * carColor(car) → the color the stage draws car `car` in, for the tower's swatches.
 */
export function carColor(car) {
  return scene.colors[car];
}

/**
 * drawFrame(snapshot, options) → one frame: { frameDeltaSec, frameTimeMs, lightsLit,
 * isLabelled } where lightsLit is -1 for no lights, else how many of the three are red,
 * isLabelled says whether the cars carry their names (held back with the tower after the
 * start), and frameTimeMs paces the labels' show delay.
 */
export function drawFrame(snapshot, options) {
  const { ctx } = view;
  ctx.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
  updateCamera(snapshot, options.frameDeltaSec);
  computeStrips();
  drawBackground();
  drawRoad();
  drawBoards();
  drawFinishLine();
  drawCars(snapshot, options.isLabelled, options.frameTimeMs);
  if (options.lightsLit >= 0) drawLights(options.lightsLit);
}

/**
 * drawStill() → the reduced-motion picture: the road from the finish line, no cars, lights
 * out. Drawn once per resize.
 */
export function drawStill() {
  const { ctx } = view;
  ctx.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
  camera.units = scene.layout.finishUnits - scene.config.lookBackUnits;
  camera.isParked = true;
  computeStrips();
  drawBackground();
  drawRoad();
  drawBoards();
  drawFinishLine();
  drawLights(0);
}
