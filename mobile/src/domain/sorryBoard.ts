import { SAFETY_SPACES, SIDE_SPACES, safetyGate, slideSpans, startExit, type SlideSpan } from './sorry';

export type Point = { x: number; y: number };

const INWARD: Point[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

/** Clockwise from the bottom-left corner: bottom, right, top, left. */
export function trackPoint(index: number): Point {
  const side = Math.floor(index / SIDE_SPACES) % 4;
  const offset = index % SIDE_SPACES;
  switch (side) {
    case 0:
      return { x: offset, y: 15 };
    case 1:
      return { x: 15, y: 15 - offset };
    case 2:
      return { x: 15 - offset, y: 0 };
    default:
      return { x: 0, y: offset };
  }
}

export function safetyPoint(colorIndex: number, safetyIndex: number): Point {
  const gate = trackPoint(safetyGate(colorIndex));
  const dir = INWARD[colorIndex] ?? INWARD[0];
  const step = safetyIndex + 1;
  return { x: gate.x + dir.x * step, y: gate.y + dir.y * step };
}

/** Last safety space: a square with a roof pointing into the home circle. */
export function safetyHouse(colorIndex: number): string {
  const dir = INWARD[colorIndex] ?? INWARD[0];
  const perp = { x: -dir.y, y: dir.x };
  const center = safetyPoint(colorIndex, SAFETY_SPACES - 1);
  const half = 0.5;
  const roof = 0.55;
  const corners = [
    { x: center.x - dir.x * half + perp.x * half, y: center.y - dir.y * half + perp.y * half },
    { x: center.x - dir.x * half - perp.x * half, y: center.y - dir.y * half - perp.y * half },
    { x: center.x + dir.x * half - perp.x * half, y: center.y + dir.y * half - perp.y * half },
    { x: center.x + dir.x * (half + roof), y: center.y + dir.y * (half + roof) },
    { x: center.x + dir.x * half + perp.x * half, y: center.y + dir.y * half + perp.y * half },
  ];
  return corners.map((point) => `${point.x},${point.y}`).join(' ');
}

export function homePoint(colorIndex: number): Point {
  const gate = trackPoint(safetyGate(colorIndex));
  const dir = INWARD[colorIndex] ?? INWARD[0];
  return { x: gate.x + dir.x * (SAFETY_SPACES + 1.6), y: gate.y + dir.y * (SAFETY_SPACES + 1.6) };
}

export function gateChevron(colorIndex: number): string {
  const gate = trackPoint(safetyGate(colorIndex));
  const dir = INWARD[colorIndex] ?? INWARD[0];
  const px = -dir.y;
  const py = dir.x;
  const tip = { x: gate.x + dir.x * 0.78, y: gate.y + dir.y * 0.78 };
  const base = { x: gate.x + dir.x * 0.46, y: gate.y + dir.y * 0.46 };
  const w = 0.18;
  return `${tip.x},${tip.y} ${base.x + px * w},${base.y + py * w} ${base.x - px * w},${base.y - py * w}`;
}

/** Start circle sits just inside the track, beside that color's exit space. */
export function startCircleCenter(colorIndex: number): Point {
  const exit = trackPoint(startExit(colorIndex));
  const dir = INWARD[colorIndex] ?? INWARD[0];
  const inset = 2.55;
  return { x: exit.x + dir.x * inset, y: exit.y + dir.y * inset };
}

export function startPoint(colorIndex: number, pawnIndex: number): Point {
  const center = startCircleCenter(colorIndex);
  const angle = -Math.PI / 2 + (pawnIndex * Math.PI) / 2;
  const orbit = 0.62;
  return {
    x: center.x + Math.cos(angle) * orbit,
    y: center.y + Math.sin(angle) * orbit,
  };
}

function travelDir(index: number): Point {
  const side = Math.floor(index / SIDE_SPACES) % 4;
  if (side === 0) return { x: 1, y: 0 };
  if (side === 1) return { x: 0, y: -1 };
  if (side === 2) return { x: -1, y: 0 };
  return { x: 0, y: 1 };
}

function perpendicular(dir: Point): Point {
  return { x: -dir.y, y: dir.x };
}

/** Tapered slide: thin at the triangle, wider at the ending circle. */
export function slideTaper(span: SlideSpan): string {
  const start = trackPoint(span.start);
  const end = trackPoint(span.end);
  const dir = travelDir(span.start);
  const normal = perpendicular(dir);
  const thin = 0.035;
  const thick = 0.22;
  const tail = { x: start.x - dir.x * 0.15, y: start.y - dir.y * 0.15 };
  const head = { x: end.x + dir.x * 0.02, y: end.y + dir.y * 0.02 };
  const corners = [
    { x: tail.x + normal.x * thin, y: tail.y + normal.y * thin },
    { x: tail.x - normal.x * thin, y: tail.y - normal.y * thin },
    { x: head.x - normal.x * thick, y: head.y - normal.y * thick },
    { x: head.x + normal.x * thick, y: head.y + normal.y * thick },
  ];
  return corners.map((point) => `${point.x},${point.y}`).join(' ');
}

export function slideTriangle(index: number): string {
  const origin = trackPoint(index);
  const dir = travelDir(index);
  const normal = perpendicular(dir);
  const tip = { x: origin.x + dir.x * 0.24, y: origin.y + dir.y * 0.24 };
  const base = { x: origin.x - dir.x * 0.15, y: origin.y - dir.y * 0.15 };
  const width = 0.26;
  return [
    `${tip.x},${tip.y}`,
    `${base.x + normal.x * width},${base.y + normal.y * width}`,
    `${base.x - normal.x * width},${base.y - normal.y * width}`,
  ].join(' ');
}

export function boardSlides(): SlideSpan[] {
  return slideSpans();
}
