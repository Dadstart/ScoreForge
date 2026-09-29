import { COLLEGE, COUNTRY, ESTATE, TRACK, type LifePath, type PlayerLife } from './life';

export type Point = { x: number; y: number };

export type Tile = {
  x: number;
  y: number;
  angle: number;
  corners: [Point, Point, Point, Point];
  peg: Point;
};

export const VIEW = { x: 0, y: 0, w: 640, h: 520 };
export const SPINNER = { x: 348, y: 158, r: 70 };
export const ROAD_WIDTH = 34;

const TRACK_CORNERS: Point[] = [
  { x: 132, y: 72 },
  { x: 300, y: 40 },
  { x: 500, y: 52 },
  { x: 592, y: 128 },
  { x: 578, y: 236 },
  { x: 470, y: 292 },
  { x: 280, y: 304 },
  { x: 118, y: 286 },
  { x: 52, y: 348 },
  { x: 108, y: 424 },
  { x: 250, y: 452 },
];

const COLLEGE_CORNERS: Point[] = [
  { x: 28, y: 292 },
  { x: 28, y: 150 },
  { x: 78, y: 96 },
  { x: 132, y: 72 },
];

const COUNTRY_CORNERS: Point[] = [
  { x: 250, y: 452 },
  { x: 150, y: 478 },
  { x: 48, y: 456 },
  { x: 36, y: 390 },
];

const ESTATE_CORNERS: Point[] = [
  { x: 250, y: 452 },
  { x: 380, y: 478 },
  { x: 520, y: 470 },
  { x: 600, y: 430 },
];

const collegeTiles = placeRibbon(COLLEGE_CORNERS, COLLEGE.length, ROAD_WIDTH);
const trackTiles = placeRibbon(TRACK_CORNERS, TRACK.length, ROAD_WIDTH);
const countryTiles = placeRibbon(COUNTRY_CORNERS, COUNTRY.length, ROAD_WIDTH, 46);
const estateTiles = placeRibbon(ESTATE_CORNERS, ESTATE.length, ROAD_WIDTH, 46);

export const START: Point = { x: 188, y: 230 };
export const CAREER_GATE: Point = { x: 168, y: 118 };

export function pathRibbon(path: 'college' | 'track' | 'country' | 'estate'): Point[] {
  if (path === 'college') return smooth(COLLEGE_CORNERS, 28);
  if (path === 'country') return smooth(COUNTRY_CORNERS, 28);
  if (path === 'estate') return smooth(ESTATE_CORNERS, 28);
  return smooth(TRACK_CORNERS, 28);
}

export function tilesFor(path: 'college' | 'track' | 'country' | 'estate'): Tile[] {
  if (path === 'college') return collegeTiles;
  if (path === 'country') return countryTiles;
  if (path === 'estate') return estateTiles;
  return trackTiles;
}

export function markerPoint(life: PlayerLife): Point {
  if (life.path === 'retired') {
    const tiles = life.exit === 'country' ? countryTiles : estateTiles;
    return tiles[tiles.length - 1]?.peg ?? trackTiles[trackTiles.length - 1].peg;
  }
  if (life.index < 0) return waitingPoint(life.path);
  const tiles = tilesFor(life.path === 'choice' ? 'track' : life.path);
  return tiles[life.index]?.peg ?? waitingPoint(life.path);
}

function waitingPoint(path: LifePath): Point {
  if (path === 'track') return CAREER_GATE;
  if (path === 'estate' || path === 'country') return trackTiles[trackTiles.length - 1].peg;
  return START;
}

function placeRibbon(corners: Point[], count: number, width: number, skip = 0): Tile[] {
  const samples = smooth(corners, 28);
  const length = polylineLength(samples);
  const usable = Math.max(length - skip, count);
  const gap = Math.min(4, usable / count / 6);
  const pitch = usable / count;
  const tiles: Tile[] = [];
  const half = width / 2;

  for (let index = 0; index < count; index++) {
    const start = skip + index * pitch + gap / 2;
    const end = skip + (index + 1) * pitch - gap / 2;
    const lead = pointAlong(samples, start);
    const middle = pointAlong(samples, (start + end) / 2);
    const tail = pointAlong(samples, end);
    const leadSide = side(lead.point, lead.angle, half);
    const tailSide = side(tail.point, tail.angle, half);
    const normal = middle.angle + Math.PI / 2;
    tiles.push({
      x: middle.point.x,
      y: middle.point.y,
      angle: readable(middle.angle),
      corners: [leadSide[0], tailSide[0], tailSide[1], leadSide[1]],
      peg: {
        x: middle.point.x + Math.cos(normal) * (half + 8),
        y: middle.point.y + Math.sin(normal) * (half + 8),
      },
    });
  }
  return tiles;
}

function smooth(corners: Point[], radius: number): Point[] {
  if (corners.length < 2) return [...corners];
  const out: Point[] = [];
  out.push(corners[0]);
  for (let index = 1; index < corners.length - 1; index++) {
    const prev = corners[index - 1];
    const current = corners[index];
    const next = corners[index + 1];
    const toPrev = unit(sub(prev, current));
    const toNext = unit(sub(next, current));
    const reach = Math.min(radius, dist(prev, current) * 0.46, dist(next, current) * 0.46);
    const entry = add(current, mul(toPrev, reach));
    const exit = add(current, mul(toNext, reach));
    out.push(entry);
    for (let step = 1; step <= 10; step++) {
      out.push(quad(entry, current, exit, step / 10));
    }
  }
  out.push(corners[corners.length - 1]);
  return out;
}

function pointAlong(points: Point[], distance: number): { point: Point; angle: number } {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const span = dist(from, to);
    if (span < 0.001) continue;
    if (remaining <= span || index === points.length - 1) {
      const t = span === 0 ? 0 : Math.min(1, remaining / span);
      return {
        point: {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        },
        angle: Math.atan2(to.y - from.y, to.x - from.x),
      };
    }
    remaining -= span;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? last;
  return { point: last, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
}

function polylineLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) length += dist(points[index - 1], points[index]);
  return length;
}

function side(point: Point, angle: number, half: number): [Point, Point] {
  const normal = angle + Math.PI / 2;
  return [
    { x: point.x + Math.cos(normal) * half, y: point.y + Math.sin(normal) * half },
    { x: point.x - Math.cos(normal) * half, y: point.y - Math.sin(normal) * half },
  ];
}

function readable(radians: number): number {
  let degrees = (radians * 180) / Math.PI;
  if (degrees > 90 || degrees < -90) degrees += 180;
  if (degrees > 180) degrees -= 360;
  return degrees;
}

function quad(a: Point, control: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul(a: Point, scale: number): Point {
  return { x: a.x * scale, y: a.y * scale };
}

function unit(a: Point): Point {
  const length = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / length, y: a.y / length };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
