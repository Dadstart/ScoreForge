/** U.S. board in play order. Index 0 is Go. */

export const INCOME_TAX = 200;
export const LUXURY_TAX = 100;

export type BoardSpace = {
  index: number;
  name: string;
  short: string;
  /** Set when landing here should select a rent property. */
  propertyId?: string;
  /** Set when landing here should fill the cash amount. */
  tax?: number;
};

const space = (
  index: number,
  name: string,
  short: string,
  extra?: { propertyId?: string; tax?: number },
): BoardSpace => ({ index, name, short, ...extra });

export const boardSpaces: BoardSpace[] = [
  space(0, 'Go', 'GO'),
  space(1, 'Mediterranean Avenue', 'Med', { propertyId: 'mediterranean' }),
  space(2, 'Community Chest', 'Chest'),
  space(3, 'Baltic Avenue', 'Baltic', { propertyId: 'baltic' }),
  space(4, 'Income Tax', 'Tax', { tax: INCOME_TAX }),
  space(5, 'Reading Railroad', 'Reading', { propertyId: 'reading' }),
  space(6, 'Oriental Avenue', 'Orient', { propertyId: 'oriental' }),
  space(7, 'Chance', 'Chance'),
  space(8, 'Vermont Avenue', 'Verm', { propertyId: 'vermont' }),
  space(9, 'Connecticut Avenue', 'Conn', { propertyId: 'connecticut' }),
  space(10, 'Jail', 'Jail'),
  space(11, 'St. Charles Place', 'St. Ch', { propertyId: 'st-charles' }),
  space(12, 'Electric Company', 'Electric', { propertyId: 'electric' }),
  space(13, 'States Avenue', 'States', { propertyId: 'states' }),
  space(14, 'Virginia Avenue', 'Virginia', { propertyId: 'virginia' }),
  space(15, 'Pennsylvania Railroad', 'Penn RR', { propertyId: 'pennsylvania-rr' }),
  space(16, 'St. James Place', 'St. Ja', { propertyId: 'st-james' }),
  space(17, 'Community Chest', 'Chest'),
  space(18, 'Tennessee Avenue', 'Tenn', { propertyId: 'tennessee' }),
  space(19, 'New York Avenue', 'New York', { propertyId: 'new-york' }),
  space(20, 'Free Parking', 'Free'),
  space(21, 'Kentucky Avenue', 'Kent', { propertyId: 'kentucky' }),
  space(22, 'Chance', 'Chance'),
  space(23, 'Indiana Avenue', 'Indiana', { propertyId: 'indiana' }),
  space(24, 'Illinois Avenue', 'Illinois', { propertyId: 'illinois' }),
  space(25, 'B. & O. Railroad', 'B & O', { propertyId: 'bo' }),
  space(26, 'Atlantic Avenue', 'Atlantic', { propertyId: 'atlantic' }),
  space(27, 'Ventnor Avenue', 'Ventnor', { propertyId: 'ventnor' }),
  space(28, 'Water Works', 'Water', { propertyId: 'water' }),
  space(29, 'Marvin Gardens', 'Marvin', { propertyId: 'marvin-gardens' }),
  space(30, 'Go to Jail', 'To Jail'),
  space(31, 'Pacific Avenue', 'Pacific', { propertyId: 'pacific' }),
  space(32, 'North Carolina Avenue', 'N. Car', { propertyId: 'north-carolina' }),
  space(33, 'Community Chest', 'Chest'),
  space(34, 'Pennsylvania Avenue', 'Penn Av', { propertyId: 'pennsylvania-ave' }),
  space(35, 'Short Line', 'Short', { propertyId: 'short-line' }),
  space(36, 'Chance', 'Chance'),
  space(37, 'Park Place', 'Park Pl', { propertyId: 'park-place' }),
  space(38, 'Luxury Tax', 'Luxury', { tax: LUXURY_TAX }),
  space(39, 'Boardwalk', 'Boardwalk', { propertyId: 'boardwalk' }),
];

export function getBoardSpace(index: number): BoardSpace | undefined {
  return boardSpaces[index];
}

/** Grid cell for a space. Go is the bottom-right corner; play runs clockwise on screen. */
export function spaceToCell(index: number): { row: number; col: number } {
  const i = ((index % 40) + 40) % 40;
  if (i <= 10) return { row: 10, col: 10 - i };
  if (i <= 20) return { row: 20 - i, col: 0 };
  if (i <= 30) return { row: 0, col: i - 20 };
  return { row: i - 30, col: 10 };
}

/** How far each property runs in from the edge. Larger than a square cell, so the spaces are long rectangles. */
export const TRACK_DEPTH = 0.16;

export function axisSpan(index: number): { start: number; size: number } {
  if (index <= 0) return { start: 0, size: TRACK_DEPTH };
  if (index >= 10) return { start: 1 - TRACK_DEPTH, size: TRACK_DEPTH };
  const size = (1 - 2 * TRACK_DEPTH) / 9;
  return { start: TRACK_DEPTH + (index - 1) * size, size };
}

export function cellBox(row: number, col: number) {
  const x = axisSpan(col);
  const y = axisSpan(row);
  return { x: x.start, y: y.start, w: x.size, h: y.size };
}

export type TokenSpot = { x: number; y: number; piece: number };

/**
 * Pack every token on one square into that square without their boxes touching.
 * Side spaces keep a strip on the outer edge for the color bar.
 */
export function layoutSharedTokens(
  width: number,
  height: number,
  row: number,
  col: number,
  count: number,
): TokenSpot[] {
  const n = Math.max(1, Math.floor(count));
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const corner = (row === 0 || row === 10) && (col === 0 || col === 10);
  let x0 = edge;
  let y0 = edge;
  let x1 = Math.max(x0 + 1, width - edge);
  let y1 = Math.max(y0 + 1, height - edge);
  if (!corner) {
    const inward = row === 0 || row === 10 ? height : width;
    const reserve = Math.round(inward * 0.38);
    if (row === 10) y1 = Math.max(y0 + 1, y1 - reserve);
    else if (row === 0) y0 = Math.min(y1 - 1, y0 + reserve);
    else if (col === 0) x0 = Math.min(x1 - 1, x0 + reserve);
    else x1 = Math.max(x0 + 1, x1 - reserve);
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  let gap = n === 1 ? 0 : Math.max(2, Math.round(Math.min(bw, bh) * 0.08));

  const pack = (spacing: number) => {
    let cols = 1;
    let piece = 0;
    for (let nextCols = 1; nextCols <= n; nextCols += 1) {
      const rows = Math.ceil(n / nextCols);
      const fitted = Math.min(
        (bw - spacing * (nextCols - 1)) / nextCols,
        (bh - spacing * (rows - 1)) / rows,
      );
      if (fitted > piece) {
        piece = fitted;
        cols = nextCols;
      }
    }
    return { cols, piece, rows: Math.ceil(n / cols) };
  };

  let packed = pack(gap);
  while (packed.piece < 8 && gap > 1) {
    gap -= 1;
    const tighter = pack(gap);
    if (tighter.piece <= packed.piece) {
      gap += 1;
      break;
    }
    packed = tighter;
  }
  const { cols, rows } = packed;
  const piece = Math.min(packed.piece, (bw - gap * (cols - 1)) / cols, (bh - gap * (rows - 1)) / rows);
  const usedW = cols * piece + (cols - 1) * gap;
  const usedH = rows * piece + (rows - 1) * gap;
  const originX = x0 + Math.max(0, (bw - usedW) / 2);
  const originY = y0 + Math.max(0, (bh - usedH) / 2);

  return Array.from({ length: n }, (_, index) => {
    const line = Math.floor(index / cols);
    const column = index % cols;
    const inRow = line === rows - 1 ? n - line * cols : cols;
    const rowWidth = inRow * piece + (inRow - 1) * gap;
    const rowX = originX + (usedW - rowWidth) / 2;
    return {
      x: rowX + column * (piece + gap),
      y: originY + line * (piece + gap),
      piece,
    };
  });
}

export type JailBox = { x: number; y: number; width: number; height: number };

/** The In Jail square, measured inside a corner cell whose side is `cell` pixels. */
export function jailCell(cell: number): JailBox {
  const inset = Math.max(4, Math.round(cell * 0.04));
  const width = Math.round(cell * 0.54);
  const height = Math.round(cell * 0.52);
  return { x: cell - inset - width, y: inset, width, height };
}

function shiftSpots(spots: TokenSpot[], dx: number, dy: number): TokenSpot[] {
  return spots.map((spot) => ({ x: spot.x + dx, y: spot.y + dy, piece: spot.piece }));
}

/** Tokens sent to jail sit in the bars, under the In Jail label. */
export function layoutJailedTokens(cell: number, count: number): TokenSpot[] {
  const box = jailCell(cell);
  const pad = Math.max(2, Math.round(Math.min(box.width, box.height) * 0.06));
  const title = Math.round(box.height * 0.36);
  const width = Math.max(8, box.width - pad * 2);
  const height = Math.max(8, box.height - title - pad);
  return shiftSpots(layoutSharedTokens(width, height, 10, 0, count), box.x + pad, box.y + title);
}

/** Just Visiting stays on the track under the jail, not in the cell. */
export function layoutVisitingTokens(cell: number, count: number): TokenSpot[] {
  const box = jailCell(cell);
  const gap = Math.max(2, Math.round(cell * 0.04));
  const y = box.y + box.height + gap;
  const height = Math.max(8, cell - y - gap);
  const width = Math.max(8, cell - gap * 2);
  return shiftSpots(layoutSharedTokens(width, height, 10, 0, count), gap, y);
}

export type OwnerMark = {
  x: number;
  y: number;
  size: number;
  rotate: '0deg' | '90deg' | '-90deg' | '180deg';
  /** Mirror left-right. Used on the side spaces, where rotation alone faces the emoji the wrong way. */
  flipX: boolean;
};

/**
 * Owner emoji just inside the board, above the property card.
 * Rotation points the emoji's feet at that side of the board.
 * Left and right marks are also flipped horizontally.
 */
export function ownerMarkPlacement(row: number, col: number, width: number, height: number): OwnerMark {
  const along = row === 0 || row === 10 ? width : height;
  const depth = row === 0 || row === 10 ? height : width;
  const size = Math.max(12, Math.min(along - 2, Math.round(along * 0.62)));
  const gap = Math.max(2, Math.round(depth * 0.03));
  if (row === 10) return { x: (width - size) / 2, y: -(size + gap), size, rotate: '0deg', flipX: false };
  if (row === 0) return { x: (width - size) / 2, y: height + gap, size, rotate: '180deg', flipX: false };
  if (col === 0) return { x: width + gap, y: (height - size) / 2, size, rotate: '-90deg', flipX: true };
  return { x: -(size + gap), y: (height - size) / 2, size, rotate: '90deg', flipX: true };
}

export function fractionToIndex(fraction: number): number {
  if (fraction <= TRACK_DEPTH) return 0;
  if (fraction >= 1 - TRACK_DEPTH) return 10;
  const inner = (fraction - TRACK_DEPTH) / (1 - 2 * TRACK_DEPTH);
  return Math.min(9, Math.max(1, Math.floor(inner * 9) + 1));
}

/** Space under a grid cell, or null for the middle of the board. */
export function cellToSpace(row: number, col: number): number | null {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || col < 0 || row > 10 || col > 10) return null;
  const onEdge = row === 0 || row === 10 || col === 0 || col === 10;
  if (!onEdge) return null;
  if (row === 10) return 10 - col;
  if (col === 0) return 20 - row;
  if (row === 0) return 20 + col;
  return 30 + row;
}

export function tokenSpace(spaces: Record<string, number> | undefined, playerId: string): number {
  const index = spaces?.[playerId];
  return typeof index === 'number' && index >= 0 && index < 40 ? Math.trunc(index) : 0;
}

function wrapSpace(index: number) {
  return ((Math.trunc(index) % 40) + 40) % 40;
}

/** Spaces visited walking clockwise, including both ends. */
export function forwardSpaces(from: number, to: number): number[] {
  const start = wrapSpace(from);
  const end = wrapSpace(to);
  const steps = (end - start + 40) % 40;
  const spaces = [start];
  for (let i = 1; i <= steps; i += 1) spaces.push((start + i) % 40);
  return spaces;
}

/** Spaces visited walking back toward Go, including both ends. */
export function backwardSpaces(from: number, to: number): number[] {
  const start = wrapSpace(from);
  const end = wrapSpace(to);
  const steps = (start - end + 40) % 40;
  const spaces = [start];
  for (let i = 1; i <= steps; i += 1) spaces.push((start - i + 40) % 40);
  return spaces;
}

/**
 * Path for a move whose direction was not recorded.
 * Short trips follow the track. A long jump, such as being sent to jail, slides straight across.
 */
/** MONOPOLY word size. `corner` is the board's corner cell, `board * TRACK_DEPTH`. */
export function centerTitleFont(corner: number): number {
  return Math.min(96, Math.max(18, Math.round(corner * 0.62)));
}

/** Fraunces 700 "MONOPOLY" at letter-spacing 1, measured on the board. */
const TITLE_EM = 5.8;
const TITLE_LINE = 1.25;
export const DECK_TILT = 34;
const DECK_ASPECT = 0.68;
const STACK_X = 9;
const STACK_Y = 12;

export type Box = { left: number; right: number; top: number; bottom: number };

/** The gold word and the rule under it, in center-square coordinates. */
export function centerTitleBounds(board: number): Box & { felt: number } {
  const felt = board * (1 - 2 * TRACK_DEPTH);
  const font = centerTitleFont(board * TRACK_DEPTH);
  const textW = font * TITLE_EM + 8;
  const textH = font * TITLE_LINE;
  const blockH = textH + 8;
  const blockTop = (felt - blockH) / 2;
  return {
    felt,
    left: (felt - textW) / 2,
    right: (felt + textW) / 2,
    top: blockTop,
    bottom: blockTop + blockH,
  };
}

function deckExtents(width: number, height: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ox of [0, STACK_X]) {
    for (const oy of [0, STACK_Y]) {
      for (const px of [0, width]) {
        for (const py of [0, height]) {
          const x = px + ox - width / 2;
          const y = py + oy - height / 2;
          const rx = x * cos - y * sin;
          const ry = x * sin + y * cos;
          if (rx < minX) minX = rx;
          if (rx > maxX) maxX = rx;
          if (ry < minY) minY = ry;
          if (ry > maxY) maxY = ry;
        }
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Axis-aligned bounds of a tilted deck, including the stacked layers. */
export function deckVisualBox(left: number, top: number, width: number, height: number, degrees: number): Box {
  const ext = deckExtents(width, height, degrees);
  const cx = left + width / 2;
  const cy = top + height / 2;
  return {
    left: cx + ext.minX,
    right: cx + ext.maxX,
    top: cy + ext.minY,
    bottom: cy + ext.maxY,
  };
}

export type DeckPileLayout = {
  width: number;
  height: number;
  chestLeft: number;
  chanceLeft: number;
  chestTop: number;
  chanceTop: number;
};

function placeDeck(
  width: number,
  height: number,
  degrees: number,
  laneLeft: number,
  laneRight: number,
  bandTop: number,
  bandBottom: number,
) {
  const ext = deckExtents(width, height, degrees);
  const visualW = ext.maxX - ext.minX;
  const visualH = ext.maxY - ext.minY;
  if (visualW > laneRight - laneLeft + 0.01) return null;
  if (visualH > bandBottom - bandTop + 0.01) return null;
  const visualLeft = laneLeft + (laneRight - laneLeft - visualW) / 2;
  const visualTop = bandTop + (bandBottom - bandTop - visualH) / 2;
  const centerX = visualLeft - ext.minX;
  const centerY = visualTop - ext.minY;
  return { left: centerX - width / 2, top: centerY - height / 2 };
}

/**
 * Community Chest and Chance sit under the title, inside the green,
 * clear of the word at every board size.
 */
export function deckPileLayout(board: number): DeckPileLayout {
  const empty = { width: 0, height: 0, chestLeft: 0, chanceLeft: 0, chestTop: 0, chanceTop: 0 };
  if (board <= 0) return empty;
  const title = centerTitleBounds(board);
  const felt = title.felt;
  const font = centerTitleFont(board * TRACK_DEPTH);
  const pad = Math.max(6, font * 0.08);
  const inset = Math.max(10, felt * 0.072 + 4);
  const bandTop = title.bottom + pad;
  const bandBottom = felt - inset;
  const bandLeft = inset;
  const bandRight = felt - inset;
  const gutter = Math.max(16, felt * 0.03);
  if (bandBottom <= bandTop || bandRight <= bandLeft + gutter) return empty;
  const mid = (bandLeft + bandRight) / 2;
  const leftLane = [bandLeft, mid - gutter / 2] as const;
  const rightLane = [mid + gutter / 2, bandRight] as const;

  const fits = (width: number) => {
    const height = width / DECK_ASPECT;
    const chest = placeDeck(width, height, -DECK_TILT, leftLane[0], leftLane[1], bandTop, bandBottom);
    const chance = placeDeck(width, height, DECK_TILT, rightLane[0], rightLane[1], bandTop, bandBottom);
    if (!chest || !chance) return null;
    return {
      width,
      height,
      chestLeft: chest.left,
      chanceLeft: chance.left,
      chestTop: chest.top,
      chanceTop: chance.top,
    };
  };

  let lo = 0;
  let hi = Math.min(200, felt * 0.22);
  let best = fits(1) ?? empty;
  for (let i = 0; i < 28; i += 1) {
    const width = (lo + hi) / 2;
    const placed = fits(width);
    if (placed) {
      best = placed;
      lo = width;
    } else {
      hi = width;
    }
  }
  return best;
}

export function tokenSpacesBetween(from: number, to: number): number[] {
  const start = wrapSpace(from);
  const end = wrapSpace(to);
  if (start === end) return [start];
  const forward = (end - start + 40) % 40;
  const back = (start - end + 40) % 40;
  if (forward <= 12) return forwardSpaces(start, end);
  if (back <= 12) return backwardSpaces(start, end);
  return [start, end];
}
