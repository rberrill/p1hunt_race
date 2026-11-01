// The stage: everything drawn on the race canvas, from a snapshot and the track layout. A
// pseudo-3D road receding to a horizon in the Pole Position manner, bending through the turn
// zones; cars seen from behind, drawn from primitives in the brand palette and recolored per
// entrant; the finish band; the start lights. Drawing is cosmetic: nothing here feeds back into
// the race (Rich, 2026-11-01: code-drawn vectors for 0.1; the camera follows the leader and
// parks at the finish line; labels only on cars drawn wide enough).
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
const COLOR_LABEL_BG = 'rgba(22, 22, 24, 0.82)';
const COLOR_LABEL_TEXT = '#e8e8ea';
const COLOR_LIGHT_ON = '#e5322d';
const COLOR_LIGHT_OFF = '#3a3a40';
// Twelve flat car colors by list index; no mapping onto any real livery (Claude's call).
const CAR_COLORS = [
  '#e5322d', '#e8e8ea', '#f2c230', '#2f7de1', '#3fb950', '#f07a1c',
  '#2bc4d6', '#e85aa0', '#8e5be8', '#9c9ca4', '#b7e23a', '#c0392b',
];
// The horizon sits this far down the stage; the road fills the rest (Claude's call).
const HORIZON_FRACTION = 0.38;
// The road's half-width at the bottom edge, as a share of the stage width, capped by height so
// a wide desktop stage doesn't draw a road wider than it is tall.
const ROAD_HALF_WIDTH_FRACTION = 0.46;
const ROAD_HALF_WIDTH_HEIGHT_CAP = 0.6;
// Screen rows of road between the bottom edge and the horizon; each is one trapezoid.
const ROAD_STRIPS = 64;
// Kerb blocks and centre dashes repeat every so many track units, so they scroll with the road.
const KERB_UNITS = 0.25;
const DASH_UNITS = 0.5;
const KERB_WIDTH_FRACTION = 0.07;
const DASH_WIDTH_FRACTION = 0.02;
// How far a turn's bend starts before the braking zone (the turn is seen before it is braked
// for) and how strongly the road's centre moves per unit of curvature. Look only.
const BEND_LEAD_UNITS = 1.0;
const BEND_GAIN = 0.9;
// A car's width at the bottom edge as a share of the road's full width there, and its height
// as a share of its width (a rear view is wider than it is tall).
const CAR_WIDTH_FRACTION = 0.22;
const CAR_HEIGHT_RATIO = 0.62;
// Labels: font size as a share of car width, within these pixel bounds.
const LABEL_FONT_FRACTION = 0.34;
const LABEL_FONT_MIN_PX = 10;
const LABEL_FONT_MAX_PX = 16;
const LABEL_PADDING_PX = 3;
// The top three of the live order are always labelled (Rich, 2026-11-01), at this font at
// least; one that would cover another top-three label is lifted by its own height, this many
// times at most, so the top three never hide each other.
const TOP_LABEL_COUNT = 3;
const LABEL_FONT_TOP_MIN_PX = 12;
const LABEL_LIFT_TRIES = 3;
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
// The current race's static layout and per-car looks, set once per race.
const scene = {
  layout: null,
  carCount: 0,
  displayNames: [],
  colors: [],
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
  scene.config = config;
  camera.units = -config.lookBackUnits;
  camera.targetUnits = camera.units;
  camera.isParked = false;
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
 * curvatureAt(trackUnits) → the road's bend at a distance, -1 (left) to 1 (right), zero on the
 * straights and peaking at each turn's apex; sharper for a slower apex.
 */
function curvatureAt(trackUnits) {
  const { turns } = scene.layout;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const bendStart = turn.brakeStart - BEND_LEAD_UNITS;
    if (trackUnits < bendStart || trackUnits > turn.exitEnd) continue;
    const strength = 1 - turn.apexSpeed;
    if (trackUnits < turn.apex) {
      return turn.direction * strength * (trackUnits - bendStart) / (turn.apex - bendStart);
    }
    return turn.direction * strength * (turn.exitEnd - trackUnits) / (turn.exitEnd - turn.apex);
  }
  return 0;
}

/**
 * computeStrips() → for each road strip from the bottom edge to the horizon: its depth from
 * the camera (track units), its perspective scale and the road centre's lateral offset (in
 * road widths, from the bend integrated outward). The same table places the cars.
 */
function computeStrips() {
  const near = scene.config.cameraNearUnits;
  let heading = 0;
  let lateral = 0;
  let previousDepth = near;
  for (let i = 0; i <= ROAD_STRIPS; i++) {
    const scale = 1 - i / (ROAD_STRIPS + 1);
    const depth = near / scale;
    const stepUnits = depth - previousDepth;
    heading += curvatureAt(camera.units + depth) * BEND_GAIN * stepUnits;
    lateral += heading * stepUnits;
    strips.depth[i] = depth;
    strips.scale[i] = scale;
    strips.lateral[i] = lateral;
    previousDepth = depth;
  }
}

/**
 * stripIndexFor(depthUnits) → the strip table position (fractional) for a depth, for
 * interpolating a car's lateral offset.
 */
function stripIndexFor(depthUnits) {
  const scale = scene.config.cameraNearUnits / depthUnits;
  return Math.min(ROAD_STRIPS, Math.max(0, (1 - scale) * (ROAD_STRIPS + 1)));
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
 * drawRoad() → the road from the bottom edge to the horizon, strip by strip: tarmac in two
 * alternating shades, red and white kerbs and the centre dashes, all repeating by track
 * position so they scroll as the camera moves.
 */
function drawRoad() {
  const halfNear = roadHalfWidthNearPx();
  for (let i = 0; i < ROAD_STRIPS; i++) {
    const scaleNear = strips.scale[i];
    const scaleFar = strips.scale[i + 1];
    const yNear = screenYAt(scaleNear) + 1;
    const yFar = screenYAt(scaleFar);
    const centreNear = roadCentreXAt(scaleNear, strips.lateral[i]);
    const centreFar = roadCentreXAt(scaleFar, strips.lateral[i + 1]);
    const halfWidthNear = halfNear * scaleNear;
    const halfWidthFar = halfNear * scaleFar;
    const trackUnits = camera.units + strips.depth[i];
    const isEvenRoad = Math.floor(trackUnits / DASH_UNITS) % 2 === 0;
    const isEvenKerb = Math.floor(trackUnits / KERB_UNITS) % 2 === 0;
    const kerbNear = halfWidthNear * KERB_WIDTH_FRACTION;
    const kerbFar = halfWidthFar * KERB_WIDTH_FRACTION;
    fillStrip(
      centreNear - halfWidthNear - kerbNear, centreNear + halfWidthNear + kerbNear, yNear,
      centreFar - halfWidthFar - kerbFar, centreFar + halfWidthFar + kerbFar, yFar,
      isEvenKerb ? COLOR_KERB_RED : COLOR_KERB_WHITE,
    );
    fillStrip(
      centreNear - halfWidthNear, centreNear + halfWidthNear, yNear,
      centreFar - halfWidthFar, centreFar + halfWidthFar, yFar,
      isEvenRoad ? COLOR_ROAD_A : COLOR_ROAD_B,
    );
    if (isEvenRoad) {
      const dashNear = halfWidthNear * DASH_WIDTH_FRACTION;
      const dashFar = halfWidthFar * DASH_WIDTH_FRACTION;
      fillStrip(
        centreNear - dashNear, centreNear + dashNear, yNear,
        centreFar - dashFar, centreFar + dashFar, yFar,
        COLOR_LINE,
      );
    }
  }
}

/**
 * drawFinishLine() → the checkered band across the road at the finish distance, with FINISH
 * above it, when it is in view.
 */
function drawFinishLine() {
  const depth = scene.layout.finishUnits - camera.units;
  const near = scene.config.cameraNearUnits;
  if (depth < near || depth > scene.config.viewDepthUnits * 2) return;
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
 * drawCar(x, y, widthPx, color) → a rear view of an open-wheel car from primitives: two tyres,
 * the body, a rear wing on pillars and a helmet, with its bottom centre at (x, y). The only
 * function that knows what a car looks like, so sprites could replace it later.
 */
function drawCar(x, y, widthPx, color) {
  const { ctx } = view;
  const height = widthPx * CAR_HEIGHT_RATIO;
  const tyreWidth = widthPx * 0.24;
  const tyreHeight = height * 0.55;
  const bodyWidth = widthPx * 0.46;
  const bodyHeight = height * 0.5;
  const wingHeight = height * 0.16;
  ctx.fillStyle = COLOR_TYRE;
  ctx.fillRect(x - widthPx / 2, y - tyreHeight, tyreWidth, tyreHeight);
  ctx.fillRect(x + widthPx / 2 - tyreWidth, y - tyreHeight, tyreWidth, tyreHeight);
  ctx.fillStyle = color;
  ctx.fillRect(x - bodyWidth / 2, y - bodyHeight, bodyWidth, bodyHeight);
  ctx.fillRect(x - widthPx * 0.08, y - height, widthPx * 0.16, height - bodyHeight);
  ctx.fillRect(x - widthPx * 0.42, y - height, widthPx * 0.84, wingHeight);
  ctx.fillStyle = COLOR_KERB_WHITE;
  const helmet = Math.max(1, widthPx * 0.09);
  ctx.beginPath();
  ctx.arc(x, y - bodyHeight - helmet * 0.6, helmet, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR_LIGHT_ON;
  ctx.fillRect(
    x - widthPx * 0.04,
    y - height + wingHeight * 0.25,
    widthPx * 0.08,
    wingHeight * 0.5,
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
 * drawLabel(x, y, widthPx, text, fontPx, liftPx) → a name on a dark pill above the car at
 * (x, y) drawn widthPx wide, liftPx higher than its resting place.
 */
function drawLabel(x, y, widthPx, text, fontPx, liftPx) {
  const { ctx } = view;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const textWidth = ctx.measureText(text).width;
  const top = y - widthPx * CAR_HEIGHT_RATIO - fontPx - LABEL_PADDING_PX * 2 - liftPx;
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
 * drawLabels() → places this frame's label candidates: the top three of the live order first
 * (always drawn; one that would cover another top-three label is lifted above it), then the
 * rest nearest car first, dropping any that would overlap a label already placed, so a bunched
 * pack never reads as a pile of text. The accepted boxes are kept in the same arrays,
 * compacted from the front.
 */
function drawLabels() {
  let accepted = 0;
  for (let i = 0; i < labels.count; i++) {
    if (labels.isTop[i]) accepted = placeLabel(i, accepted, true);
  }
  for (let i = labels.count - 1; i >= 0; i--) {
    if (!labels.isTop[i]) accepted = placeLabel(i, accepted, false);
  }
  labels.count = 0;
}

/**
 * placeLabel(i, accepted, isForced) → the accepted count after candidate i. Measures its box;
 * a forced label is lifted by its own height until it is free (LABEL_LIFT_TRIES at most) and
 * always drawn, an ordinary one is dropped when it overlaps. An accepted box is recorded at
 * index `accepted`.
 */
function placeLabel(i, accepted, isForced) {
  const { ctx } = view;
  const fontPx = labelFontPx(labels.widthPx[i], isForced);
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  const text = scene.displayNames[labels.car[i]];
  const halfWidth = ctx.measureText(text).width / 2 + LABEL_PADDING_PX;
  const heightPx = fontPx + LABEL_PADDING_PX * 2;
  const left = labels.x[i] - halfWidth;
  const right = labels.x[i] + halfWidth;
  let bottom = labels.y[i] - labels.widthPx[i] * CAR_HEIGHT_RATIO;
  let liftPx = 0;
  let tries = 0;
  while (isForced && tries < LABEL_LIFT_TRIES) {
    if (isBoxFree(left, right, bottom - heightPx, bottom, accepted)) break;
    bottom -= heightPx + 1;
    liftPx += heightPx + 1;
    tries++;
  }
  if (!isForced && !isBoxFree(left, right, bottom - heightPx, bottom, accepted)) return accepted;
  drawLabel(labels.x[i], labels.y[i], labels.widthPx[i], text, fontPx, liftPx);
  labels.left[accepted] = left;
  labels.right[accepted] = right;
  labels.top[accepted] = bottom - heightPx;
  labels.bottom[accepted] = bottom;
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
 * drawCars(snapshot) → every car in view, far to near so the near ones overlap, each at its
 * lane across the road; labels on the cars drawn at least labelMinWidthPx wide and always on
 * the top three of the live order (Rich, 2026-11-01).
 */
function drawCars(snapshot) {
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
    drawCar(x, y, widthPx, scene.colors[car]);
    const isTop = i < TOP_LABEL_COUNT;
    if ((isTop || widthPx >= labelMin) && labels.count < MAX_CARS) {
      labels.car[labels.count] = car;
      labels.x[labels.count] = x;
      labels.y[labels.count] = y;
      labels.widthPx[labels.count] = widthPx;
      labels.isTop[labels.count] = isTop ? 1 : 0;
      labels.count++;
    }
  }
  drawLabels();
}

/* ==== LIGHTS ==== */

/**
 * drawLights(litCount, clearLeftPx) → the start lights over the road: three discs, `litCount`
 * of them red, drawn while the countdown runs and for a moment after they go out. The box sits
 * just above the cars on the start line (where the camera's look-back puts them at tick 0),
 * centred on the stage, or pushed right as far as it takes to clear `clearLeftPx` (the timing
 * tower's edge) so the two never overlap (Rich, 2026-11-01).
 */
function drawLights(litCount, clearLeftPx) {
  const { ctx } = view;
  const diameter = Math.min(LIGHT_MAX_DIAMETER_PX, view.width * LIGHT_DIAMETER_FRACTION);
  const gap = diameter * 0.5;
  const totalWidth = LIGHT_COUNT * diameter + (LIGHT_COUNT - 1) * gap;
  const centredLeft = (view.width - totalWidth) / 2;
  const clearLeft = clearLeftPx + gap * 2;
  const left = Math.min(view.width - totalWidth - gap, Math.max(centredLeft, clearLeft));
  const startScale = Math.min(1, scene.config.cameraNearUnits / scene.config.lookBackUnits);
  const carHeightPx = roadHalfWidthNearPx() * 2 * CAR_WIDTH_FRACTION * startScale
    * CAR_HEIGHT_RATIO;
  const boxHeight = diameter + gap;
  const boxBottom = screenYAt(startScale) - carHeightPx - LIGHT_CLEARANCE_PX;
  const boxTop = Math.max(LIGHT_TOP_MARGIN_PX, boxBottom - boxHeight);
  const top = boxTop + gap / 2;
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
 * drawFrame(snapshot, options) → one frame: { frameDeltaSec, lightsLit, lightsClearPx } where
 * lightsLit is -1 for no lights, else how many of the three are red, and lightsClearPx is the
 * stage width the lights must keep clear of at the left (the tower).
 */
export function drawFrame(snapshot, options) {
  const { ctx } = view;
  ctx.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0);
  updateCamera(snapshot, options.frameDeltaSec);
  computeStrips();
  drawBackground();
  drawRoad();
  drawFinishLine();
  drawCars(snapshot);
  if (options.lightsLit >= 0) drawLights(options.lightsLit, options.lightsClearPx || 0);
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
  drawFinishLine();
  drawLights(0);
}
