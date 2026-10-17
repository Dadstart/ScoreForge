import { projectTiltedPoint } from './dieProjection';
import { cellBox, nearestBoardTurn, spaceToCell, TRACK_DEPTH, type Point } from './opolyBoard';

export const MIN_ZOOM = 0.5;
/** Far enough in to inspect a deed up close, without an unbounded pinch. */
export const MAX_ZOOM = 5;

/** Corner cell at which the board draws property names. */
const NAME_CELL = 96;
const NAME_BOARD = NAME_CELL / TRACK_DEPTH;
/** Along-edge of a side property when its name is comfortable to read. */
const READABLE_EDGE = 72;
const READABLE_BOARD = READABLE_EDGE / ((1 - 2 * TRACK_DEPTH) / 9);

/** Page width, then two smaller boards. */
const PAGE_STOPS = [0.5, 0.75, 1];
/** Button zoom-in steps beyond page width (pinch still clamps at MAX_ZOOM). */
const CLOSE_STOPS = [1.5, 2, 2.5, 3, 4, 5];
const TRACK = TRACK_DEPTH;

/**
 * Shortest clockwise step from one two-finger angle to the next, in degrees.
 * Both angles are screen degrees, where clockwise is positive.
 */
export function twistStep(previous: number, next: number): number {
  const diff = ((next - previous) % 360 + 360) % 360;
  return diff > 180 ? diff - 360 : diff;
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * How far to slide a board that stays at `layoutZoom` so scaling it around its
 * center matches a board resized to `zoom`. The resized board is laid out once
 * when the pinch ends, so the board does not flicker on every finger move.
 */
export function centeredZoomShift(layoutZoom: number, zoom: number, viewport: number) {
  if (layoutZoom <= 0 || viewport <= 0) return 0;
  return (viewport * (zoom - layoutZoom)) / 2;
}

/**
 * Closer stop for a phone. The full board stays at zoom 1 and draws compact
 * names; this is how far + goes when those names should be read up close.
 */
export function readingZoom(viewport: number) {
  if (viewport <= 0 || viewport >= NAME_BOARD) return 1;
  const zoom = Math.round((READABLE_BOARD / viewport) * 20) / 20;
  return Math.min(MAX_ZOOM, Math.max(1, zoom));
}

function zoomStops(viewport: number) {
  const reading = readingZoom(viewport);
  const close = CLOSE_STOPS.filter(
    (stop) => stop <= MAX_ZOOM && (reading <= 1 || Math.abs(stop - reading) >= 0.08),
  );
  const stops = [...PAGE_STOPS, ...close];
  if (reading > 1) stops.push(reading);
  return stops.sort((a, b) => a - b);
}

export function stepZoom(zoom: number, direction: -1 | 1, viewport = 0) {
  const stops = zoomStops(viewport);
  if (direction > 0) {
    return stops.find((stop) => stop > zoom + 1e-6) ?? stops[stops.length - 1];
  }
  return [...stops].reverse().find((stop) => stop < zoom - 1e-6) ?? stops[0];
}

export function clampPan(pan: { x: number; y: number }, zoom: number, viewport: number) {
  if (zoom < 1) {
    const inset = (viewport * (1 - zoom)) / 2;
    return { x: inset, y: 0 };
  }
  const min = Math.min(0, viewport * (1 - zoom));
  return {
    x: Math.min(0, Math.max(min, pan.x)),
    y: Math.min(0, Math.max(min, pan.y)),
  };
}

type BoardWheel = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/** Wheel travel, in pixels, that counts as one zoom notch. Smaller moves add up. */
const WHEEL_ZOOM_NOTCH = 40;

/** Pan the board from the mouse wheel. Ctrl zooms, and Meta stays with the browser. */
export function panForWheel(pan: { x: number; y: number }, wheel: BoardWheel, zoom: number, viewport: number) {
  if (wheel.ctrlKey || wheel.metaKey) return null;
  if (wheel.deltaX === 0 && wheel.deltaY === 0) return null;
  const scale = wheel.deltaMode === 1 ? 40 : wheel.deltaMode === 2 ? viewport : 1;
  return clampPan(
    { x: pan.x - wheel.deltaX * scale, y: pan.y - wheel.deltaY * scale },
    zoom,
    viewport,
  );
}

/**
 * Zoom from ctrl+wheel. A mouse notch moves one stop. Smaller trackpad
 * deltas add up to a stop. Wheel up zooms in. Null when this wheel should pan.
 */
export function zoomForWheel(
  pan: { x: number; y: number },
  wheel: BoardWheel,
  zoom: number,
  viewport: number,
  pending = 0,
): { zoom: number; pan: { x: number; y: number }; pending: number } | null {
  if (!wheel.ctrlKey) return null;
  const scale = wheel.deltaMode === 1 ? 40 : wheel.deltaMode === 2 ? viewport : 1;
  const delta = wheel.deltaY * scale;
  if (delta === 0) return { zoom, pan, pending };
  let steps = 0;
  let carry = pending;
  if (Math.abs(delta) >= WHEEL_ZOOM_NOTCH) {
    steps = delta > 0 ? -1 : 1;
    carry = 0;
  } else {
    carry += delta;
    while (carry >= WHEEL_ZOOM_NOTCH) {
      steps -= 1;
      carry -= WHEEL_ZOOM_NOTCH;
    }
    while (carry <= -WHEEL_ZOOM_NOTCH) {
      steps += 1;
      carry += WHEEL_ZOOM_NOTCH;
    }
  }
  if (steps === 0) return { zoom, pan, pending: carry };
  const direction: -1 | 1 = steps > 0 ? 1 : -1;
  let nextZoom = zoom;
  let nextPan = pan;
  for (let i = 0; i < Math.abs(steps); i += 1) {
    const stepped = stepZoom(nextZoom, direction, viewport);
    if (stepped === nextZoom) {
      carry = 0;
      break;
    }
    nextPan = panForZoom(nextPan, nextZoom, stepped, viewport);
    nextZoom = stepped;
  }
  return { zoom: nextZoom, pan: nextPan, pending: carry };
}

/**
 * The felt center has no spaces. Button zoom keeps the nearest board edge
 * (or corner) fixed so the property track stays on screen.
 */
export function panForZoom(
  pan: { x: number; y: number },
  prevZoom: number,
  nextZoom: number,
  viewport: number,
) {
  if (viewport <= 0 || prevZoom <= 0) return pan;
  const anchor = zoomAnchor(pan, prevZoom, viewport);
  const span = viewport * prevZoom;
  const kept = {
    x: pan.x + anchor.x * span,
    y: pan.y + anchor.y * span,
  };
  const target = {
    x: Math.min(viewport, Math.max(0, kept.x)),
    y: Math.min(viewport, Math.max(0, kept.y)),
  };
  return clampPan(
    {
      x: target.x - anchor.x * viewport * nextZoom,
      y: target.y - anchor.y * viewport * nextZoom,
    },
    nextZoom,
    viewport,
  );
}

/** Where a token sits in its cell: toward the outer rim, where the piece stands. */
export function spaceAnchor(space: number, board: number): Point {
  const index = ((space % 40) + 40) % 40;
  const { row, col } = spaceToCell(index);
  const box = cellBox(row, col);
  const outward = 0.7;
  let u = 0.5;
  let v = 0.5;
  if (row === 10) v = outward;
  else if (row === 0) v = 1 - outward;
  if (col === 0) u = 1 - outward;
  else if (col === 10) u = outward;
  return {
    x: (box.x + box.w * u) * board,
    y: (box.y + box.h * v) * board,
  };
}

/** Board point, after the table turn, as an offset from the board center in viewport pixels. */
function projectAnchor(anchor: Point, turn: number, board: number): Point {
  const ox = anchor.x - board / 2;
  const oy = anchor.y - board / 2;
  const rad = (turn * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return projectTiltedPoint(ox * cos - oy * sin, ox * sin + oy * cos, 0, board);
}

/** Viewport position of a space. The board's top-left is `pan`. */
export function spaceScreen(
  space: number,
  turn: number,
  pan: { x: number; y: number },
  zoom: number,
  viewport: number,
): Point {
  const board = viewport * zoom;
  const offset = projectAnchor(spaceAnchor(space, board), turn, board);
  return { x: pan.x + board / 2 + offset.x, y: pan.y + board / 2 + offset.y };
}

function screenOf(anchor: Point, turn: number, pan: { x: number; y: number }, board: number): Point {
  const offset = projectAnchor(anchor, turn, board);
  return { x: pan.x + board / 2 + offset.x, y: pan.y + board / 2 + offset.y };
}

/** Pan that puts `anchor` at `screen` while the board is turned by `turn` degrees. */
function panHolding(
  anchor: Point,
  turn: number,
  screen: Point,
  zoom: number,
  viewport: number,
): { x: number; y: number } {
  const board = viewport * zoom;
  const offset = projectAnchor(anchor, turn, board);
  return clampPan(
    {
      x: screen.x - (board / 2 + offset.x),
      y: screen.y - (board / 2 + offset.y),
    },
    zoom,
    viewport,
  );
}

/**
 * Near-edge band, matching the unzoomed table: the piece sits low, just above
 * the buttons, and away from the left and right edges.
 */
function tokenBand(viewport: number) {
  const marginX = viewport * 0.16;
  const marginY = viewport * 0.1;
  return {
    minX: marginX,
    maxX: viewport - marginX,
    minY: marginY,
    maxY: viewport * 0.86,
    homeY: viewport * 0.74,
  };
}

/**
 * Turn and pan that keep a space viewable.
 * The space's side becomes the near edge. When that still leaves the piece
 * outside the phone, the board slides until the piece sits in the lower band.
 * A piece already there is left where the player put it.
 */
export function frameToken(args: {
  space: number;
  turn: number;
  pan: { x: number; y: number };
  zoom: number;
  viewport: number;
}): { turn: number; pan: { x: number; y: number } } {
  const { space, turn, zoom, viewport } = args;
  if (viewport <= 0 || zoom <= 0) return { turn, pan: args.pan };
  const nextTurn = nearestBoardTurn(turn, space);
  if (zoom <= 1) return { turn: nextTurn, pan: clampPan(args.pan, zoom, viewport) };

  const board = viewport * zoom;
  const offset = projectAnchor(spaceAnchor(space, board), nextTurn, board);
  const screen = {
    x: args.pan.x + board / 2 + offset.x,
    y: args.pan.y + board / 2 + offset.y,
  };
  const band = tokenBand(viewport);
  const xOk = screen.x >= band.minX && screen.x <= band.maxX;
  const yOk = screen.y >= band.minY && screen.y <= band.maxY;
  if (Math.abs(nextTurn - turn) < 1 && xOk && yOk) return { turn, pan: args.pan };

  return {
    turn: nextTurn,
    pan: clampPan(
      {
        x: xOk ? args.pan.x : viewport / 2 - (board / 2 + offset.x),
        y: yOk ? args.pan.y : band.homeY - (board / 2 + offset.y),
      },
      zoom,
      viewport,
    ),
  };
}

export type TokenShot = {
  fromSpace: number;
  toSpace: number;
  startTurn: number;
  endTurn: number;
  startPan: { x: number; y: number };
  endPan: { x: number; y: number };
  zoom: number;
  viewport: number;
};

/**
 * Camera while a piece moves from one space to the next.
 * `t` is 0 at the start and 1 at the landing. Turn and pan move together so
 * the piece stays on the straight line between its start and end on screen.
 */
export function cameraAlong(shot: TokenShot, t: number): { turn: number; pan: { x: number; y: number } } {
  const clamped = Math.min(1, Math.max(0, t));
  const turn = shot.startTurn + (shot.endTurn - shot.startTurn) * clamped;
  const board = shot.viewport * shot.zoom;
  const from = spaceAnchor(shot.fromSpace, board);
  const to = spaceAnchor(shot.toSpace, board);
  const anchor = {
    x: from.x + (to.x - from.x) * clamped,
    y: from.y + (to.y - from.y) * clamped,
  };
  const startScreen = screenOf(from, shot.startTurn, shot.startPan, board);
  const endScreen = screenOf(to, shot.endTurn, shot.endPan, board);
  const screen = {
    x: startScreen.x + (endScreen.x - startScreen.x) * clamped,
    y: startScreen.y + (endScreen.y - startScreen.y) * clamped,
  };
  return { turn, pan: panHolding(anchor, turn, screen, shot.zoom, shot.viewport) };
}

/** Where the moving piece sits on screen at `t` along a hop. */
export function pieceScreen(shot: TokenShot, t: number): Point {
  const camera = cameraAlong(shot, t);
  const board = shot.viewport * shot.zoom;
  const from = spaceAnchor(shot.fromSpace, board);
  const to = spaceAnchor(shot.toSpace, board);
  const clamped = Math.min(1, Math.max(0, t));
  const anchor = {
    x: from.x + (to.x - from.x) * clamped,
    y: from.y + (to.y - from.y) * clamped,
  };
  return screenOf(anchor, camera.turn, camera.pan, board);
}

function zoomAnchor(pan: { x: number; y: number }, zoom: number, viewport: number) {
  const span = viewport * zoom;
  const center = {
    x: Math.min(1, Math.max(0, (-pan.x + viewport / 2) / span)),
    y: Math.min(1, Math.max(0, (-pan.y + viewport / 2) / span)),
  };
  const lo = TRACK;
  const hi = 1 - TRACK;
  if (center.x <= lo || center.x >= hi || center.y <= lo || center.y >= hi) return center;

  const dLeft = center.x - lo;
  const dRight = hi - center.x;
  const dTop = center.y - lo;
  const dBottom = hi - center.y;
  const dx = Math.min(dLeft, dRight);
  const dy = Math.min(dTop, dBottom);
  let x = center.x;
  let y = center.y;
  const snapX = dx < dy || Math.abs(dx - dy) < TRACK;
  const snapY = dy < dx || Math.abs(dx - dy) < TRACK;
  if (snapX) x = dLeft < dRight ? 0 : 1;
  if (snapY) y = dTop < dBottom ? 0 : 1;
  return { x, y };
}
