import { TRACK_DEPTH } from './monopolyBoard';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1;

/** Page width, then two smaller boards. */
const ZOOM_STOPS = [0.5, 0.75, 1];

const TRACK = TRACK_DEPTH;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function stepZoom(zoom: number, direction: -1 | 1) {
  if (direction > 0) {
    return ZOOM_STOPS.find((stop) => stop > zoom + 1e-6) ?? MAX_ZOOM;
  }
  return [...ZOOM_STOPS].reverse().find((stop) => stop < zoom - 1e-6) ?? MIN_ZOOM;
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

/** Pan the board from the mouse wheel. Ctrl or Meta leaves the gesture for the browser. */
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
