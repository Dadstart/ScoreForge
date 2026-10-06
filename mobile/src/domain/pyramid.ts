import type { Game } from './models';
import { fillRandom } from './secureRandom';

/**
 * Pyramid solitaire.
 * Twenty-eight cards sit in seven rows. A card is free when nothing covers it.
 * Remove a king alone, or two free cards that add to 13. Draw one card from the stock.
 * The pyramid is clear when every row card is gone. The stock may still hold cards.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';

export type Spot = { pile: 'pyramid'; row: number; index: number } | { pile: 'waste' };

export type PyramidState = {
  /** Face-down stock. The last card is the top. */
  stock: string[];
  /** Face-up waste. The last card is the top. */
  waste: string[];
  /** Cards taken off the pyramid or the waste. They stay in the deal so it can be checked. */
  removed: string[];
  /** Seven rows. Row r has r + 1 slots. Null is a card already removed. */
  rows: (string | null)[][];
  moves: number;
  won: boolean;
  lastAction: string;
  /** Earlier layouts, newest last. Each entry is one move. */
  undo: string[];
};

const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANK_CHARS = 'A23456789TJQK';
const RANK_NAMES = ['', 'ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
const SUIT_NAMES: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};
const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const UNDO_LIMIT = 80;
const ROW_COUNT = 7;
const PYRAMID_CARDS = 28;
const CARD_RE = /^[A2-9TJQK][SHDC]$/i;

export type CardFace = {
  code: string;
  rank: number;
  rankLabel: string;
  suit: Suit;
  symbol: string;
  name: string;
  red: boolean;
  up: boolean;
};

type Snap = {
  stock: string[];
  waste: string[];
  removed: string[];
  rows: (string | null)[][];
  moves: number;
  won: boolean;
};

/** Two characters. The suit's case is the face: `AS` is up, `As` is down. */
export function cardCode(rank: number, suit: Suit, up: boolean): string {
  const rankLabel = RANK_CHARS[rank - 1];
  return up ? `${rankLabel}${suit}` : `${rankLabel}${suit.toLowerCase()}`;
}

export function cardFace(code: string): CardFace | null {
  if (!CARD_RE.test(code)) return null;
  const rank = RANK_CHARS.indexOf(code[0].toUpperCase()) + 1;
  const suit = code[1].toUpperCase() as Suit;
  const up = code[1] === code[1].toUpperCase();
  return {
    code,
    rank,
    rankLabel: rank === 10 ? '10' : RANK_CHARS[rank - 1],
    suit,
    symbol: SUIT_SYMBOLS[suit],
    name: `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`,
    red: suit === 'H' || suit === 'D',
    up,
  };
}

/** Firestore cannot store an array of arrays, so each row is its own list. */
export type StoredPyramid = Omit<PyramidState, 'rows'> & {
  rows: Record<string, string[]>;
};

export function packPyramid(state: PyramidState): StoredPyramid {
  return {
    stock: state.stock,
    waste: state.waste,
    removed: state.removed,
    rows: Object.fromEntries(state.rows.map((row, index) => [String(index), row.map((card) => card ?? '')])),
    moves: state.moves,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackPyramid(value: unknown): PyramidState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredPyramid> & { rows?: unknown };
  const rows = unpackRows(raw.rows);
  if (!rows) return null;
  const removed = Array.isArray(raw.removed) ? raw.removed : [];
  if (!Array.isArray(raw.stock) || !Array.isArray(raw.waste) || !Array.isArray(raw.undo)) return null;
  if (raw.stock.some((card) => typeof card !== 'string')) return null;
  if (raw.waste.some((card) => typeof card !== 'string')) return null;
  if (removed.some((card) => typeof card !== 'string')) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') return null;
  return layoutFrom({
    stock: [...raw.stock],
    waste: [...raw.waste],
    removed: [...removed],
    rows,
    moves: raw.moves,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
    won: raw.won,
  });
}

export function clearedCount(state: PyramidState | null | undefined): number {
  if (!state) return 0;
  return PYRAMID_CARDS - cardsIn(state.rows);
}

export function createPyramidState(deck?: readonly string[]): PyramidState {
  const cards = deck ? deck.map((code) => faceDown(code)) : shuffle(freshDeck());
  return deal(cards);
}

/** A layout for tests and repair. `won` follows the pyramid. */
export function layoutPyramid(input: {
  stock?: string[];
  waste?: string[];
  removed?: string[];
  rows?: (string | null)[][];
  moves?: number;
  lastAction?: string;
  undo?: string[];
}): PyramidState {
  return layoutFrom({
    stock: [...(input.stock ?? [])],
    waste: [...(input.waste ?? [])],
    removed: [...(input.removed ?? [])],
    rows: normalizeRows(input.rows ?? []),
    moves: input.moves ?? 0,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  });
}

export function sameSpot(a: Spot, b: Spot): boolean {
  if (a.pile !== b.pile) return false;
  if (a.pile === 'waste') return true;
  return b.pile === 'pyramid' && a.row === b.row && a.index === b.index;
}

export function isFree(state: PyramidState, spot: Spot): boolean {
  if (state.won) return false;
  if (spot.pile === 'waste') return state.waste.length > 0;
  if (spot.row < 0 || spot.row >= ROW_COUNT) return false;
  const row = state.rows[spot.row];
  if (!row || spot.index < 0 || spot.index >= row.length || !row[spot.index]) return false;
  if (spot.row === ROW_COUNT - 1) return true;
  const below = state.rows[spot.row + 1] ?? [];
  return !below[spot.index] && !below[spot.index + 1];
}

export function cardAt(state: PyramidState, spot: Spot): CardFace | null {
  if (spot.pile === 'waste') {
    const top = state.waste[state.waste.length - 1];
    return top ? cardFace(top) : null;
  }
  const code = state.rows[spot.row]?.[spot.index];
  return code ? cardFace(code) : null;
}

/** Free cards that pair with this one. A king pairs with itself. */
export function matches(state: PyramidState, spot: Spot): Spot[] {
  if (!isFree(state, spot)) return [];
  const face = cardAt(state, spot);
  if (!face) return [];
  if (face.rank === 13) return [spot];
  return freeSpots(state).filter((other) => {
    if (sameSpot(other, spot)) return false;
    const partner = cardAt(state, other);
    return partner != null && partner.rank + face.rank === 13;
  });
}

export function play(state: PyramidState, a: Spot, b?: Spot | null): PyramidState | null {
  if (state.won || !isFree(state, a)) return null;
  const left = cardAt(state, a);
  if (!left) return null;
  if (!b || sameSpot(a, b)) {
    if (left.rank !== 13) return null;
    return clear(state, [a], `Removed the ${left.name}`);
  }
  if (!isFree(state, b)) return null;
  const right = cardAt(state, b);
  if (!right || left.rank + right.rank !== 13) return null;
  return clear(state, [a, b], `Removed the ${left.name} and the ${right.name}`);
}

export function drawStock(state: PyramidState): PyramidState | null {
  if (state.won) return null;
  if (state.stock.length > 0) {
    const card = faceUp(state.stock[state.stock.length - 1]);
    return step(state, {
      stock: state.stock.slice(0, -1),
      waste: [...state.waste, card],
      removed: [...state.removed],
      rows: cloneRows(state.rows),
      moves: state.moves + 1,
      won: false,
      lastAction: 'Drew a card',
    });
  }
  if (state.waste.length < 2) return null;
  const flipped = [...state.waste].reverse();
  const drawn = flipped[flipped.length - 1];
  return step(state, {
    stock: flipped.slice(0, -1).map(faceDown),
    waste: [faceUp(drawn)],
    removed: [...state.removed],
    rows: cloneRows(state.rows),
    moves: state.moves + 1,
    won: false,
    lastAction: 'Turned the stock',
  });
}

export function undo(state: PyramidState): PyramidState | null {
  const raw = state.undo[state.undo.length - 1];
  if (!raw) return null;
  const snap = parseSnap(raw);
  if (!snap) return null;
  return {
    ...snap,
    undo: state.undo.slice(0, -1),
    lastAction: 'Undid the last move',
  };
}

export function hint(state: PyramidState): string | null {
  if (state.won) return null;
  const king = freeSpots(state).find((spot) => cardAt(state, spot)?.rank === 13);
  if (king) {
    const face = cardAt(state, king);
    return face ? `Remove the ${face.name}` : 'Remove a king';
  }
  const pair = firstPair(state);
  if (pair) {
    const left = cardAt(state, pair[0]);
    const right = cardAt(state, pair[1]);
    if (left && right) return `Pair the ${left.name} with the ${right.name}`;
  }
  if (state.stock.length > 0) return 'Draw from the stock';
  if (state.waste.length > 1) return 'Turn the stock over';
  return 'No moves left';
}

export function hasMove(state: PyramidState): boolean {
  if (state.won) return false;
  if (state.stock.length > 0 || state.waste.length > 1) return true;
  if (freeSpots(state).some((spot) => cardAt(state, spot)?.rank === 13)) return true;
  return firstPair(state) !== null;
}

export function ensurePyramidState(game: Game): Game {
  if (game.templateId !== 'pyramid') return game;
  if (game.pyramid && isHealthy(game.pyramid)) return game;
  return { ...game, pyramid: createPyramidState() };
}

function layoutFrom(input: {
  stock: string[];
  waste: string[];
  removed: string[];
  rows: (string | null)[][];
  moves: number;
  lastAction: string;
  undo: string[];
  won?: boolean;
}): PyramidState {
  const rows = normalizeRows(input.rows);
  const won = cardsIn(rows) === 0;
  return {
    stock: input.stock,
    waste: input.waste,
    removed: input.removed,
    rows,
    moves: input.moves,
    won: input.won ?? won,
    lastAction: input.lastAction,
    undo: input.undo,
  };
}

function deal(deck: string[]): PyramidState {
  const rows: (string | null)[][] = [];
  let cursor = 0;
  for (let row = 0; row < ROW_COUNT; row++) {
    const line: (string | null)[] = [];
    for (let index = 0; index <= row; index++) {
      const card = deck[cursor];
      cursor += 1;
      line.push(card ? faceUp(card) : null);
    }
    rows.push(line);
  }
  const stock = deck
    .slice(cursor)
    .reverse()
    .map((card) => faceDown(card));
  return {
    stock,
    waste: [],
    removed: [],
    rows,
    moves: 0,
    won: false,
    lastAction: 'New deal',
    undo: [],
  };
}

function clear(state: PyramidState, spots: Spot[], action: string): PyramidState {
  const rows = cloneRows(state.rows);
  const waste = [...state.waste];
  const removed = [...state.removed];
  for (const spot of spots) {
    const card = spot.pile === 'waste' ? waste[waste.length - 1] : rows[spot.row]?.[spot.index];
    if (card) removed.push(faceUp(card));
    if (spot.pile === 'waste') waste.pop();
    else rows[spot.row][spot.index] = null;
  }
  const won = cardsIn(rows) === 0;
  return step(state, {
    stock: [...state.stock],
    waste,
    removed,
    rows,
    moves: state.moves + 1,
    won,
    lastAction: won ? 'The pyramid is clear' : action,
  });
}

function step(previous: PyramidState, next: Snap & { lastAction: string }): PyramidState {
  return {
    stock: next.stock,
    waste: next.waste,
    removed: next.removed,
    rows: next.rows,
    moves: next.moves,
    won: next.won,
    lastAction: next.lastAction,
    undo: remember(previous),
  };
}

function remember(state: PyramidState): string[] {
  return [...state.undo, encode(state)].slice(-UNDO_LIMIT);
}

function encode(state: PyramidState): string {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    removed: state.removed,
    rows: state.rows,
    moves: state.moves,
    won: state.won,
  });
}

function freeSpots(state: PyramidState): Spot[] {
  const spots: Spot[] = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    const line = state.rows[row] ?? [];
    for (let index = 0; index < line.length; index++) {
      const spot: Spot = { pile: 'pyramid', row, index };
      if (isFree(state, spot)) spots.push(spot);
    }
  }
  if (state.waste.length > 0) spots.push({ pile: 'waste' });
  return spots;
}

function firstPair(state: PyramidState): [Spot, Spot] | null {
  const spots = freeSpots(state);
  for (let left = 0; left < spots.length; left++) {
    const a = cardAt(state, spots[left]);
    if (!a || a.rank === 13) continue;
    for (let right = left + 1; right < spots.length; right++) {
      const b = cardAt(state, spots[right]);
      if (b && a.rank + b.rank === 13) return [spots[left], spots[right]];
    }
  }
  return null;
}

function isHealthy(state: PyramidState): boolean {
  const parsed = parseState(state);
  return parsed !== null && sameState(parsed, state);
}

function parseState(raw: PyramidState): PyramidState | null {
  if (!Array.isArray(raw.rows) || raw.rows.length !== ROW_COUNT) return null;
  const rows: (string | null)[][] = [];
  for (let index = 0; index < ROW_COUNT; index++) {
    const row = raw.rows[index];
    if (!Array.isArray(row) || row.length !== index + 1) return null;
    const clean: (string | null)[] = [];
    for (const card of row) {
      if (card == null) {
        clean.push(null);
        continue;
      }
      const face = cardFace(card);
      if (!face || !face.up) return null;
      clean.push(faceUp(card));
    }
    rows.push(clean);
  }
  const stock = cleanPile(raw.stock, false);
  const waste = cleanPile(raw.waste, true);
  const removed = cleanPile(raw.removed, true);
  if (!stock || !waste || !removed) return null;
  const seen = new Set<string>();
  for (const code of [...stock, ...waste, ...removed, ...rows.flat().filter((card): card is string => card != null)]) {
    const face = cardFace(code);
    if (!face) return null;
    const id = `${face.rank}${face.suit}`;
    if (seen.has(id)) return null;
    seen.add(id);
  }
  if (seen.size !== 52) return null;
  if (!Number.isInteger(raw.moves) || raw.moves < 0 || raw.moves > 100000) return null;
  const won = cardsIn(rows) === 0;
  if (raw.won !== won) return null;
  if (typeof raw.lastAction !== 'string' || raw.lastAction.length > 160) return null;
  if (!Array.isArray(raw.undo) || raw.undo.length > UNDO_LIMIT) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string' || entry.length > 8000)) return null;
  return {
    stock,
    waste,
    removed,
    rows,
    moves: raw.moves,
    won,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  };
}

function parseSnap(raw: string): Snap | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const snap = value as Partial<Snap>;
  if (!Array.isArray(snap.stock) || !Array.isArray(snap.waste) || !Array.isArray(snap.rows)) return null;
  if (snap.removed != null && !Array.isArray(snap.removed)) return null;
  if (typeof snap.moves !== 'number' || typeof snap.won !== 'boolean') return null;
  return {
    stock: [...snap.stock],
    waste: [...snap.waste],
    removed: Array.isArray(snap.removed) ? [...snap.removed] : [],
    rows: snap.rows.map((row) => [...row]),
    moves: snap.moves,
    won: snap.won,
  };
}

function unpackRows(value: unknown): (string | null)[][] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rows: (string | null)[][] = [];
  for (let index = 0; index < ROW_COUNT; index++) {
    const row = unpackRow(record[String(index)], index + 1);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function unpackRow(value: unknown, length: number): (string | null)[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const row: (string | null)[] = [];
  for (const item of value) {
    if (item == null || item === '') row.push(null);
    else if (typeof item === 'string') row.push(item);
    else return null;
  }
  return row;
}

function normalizeRows(rows: (string | null)[][]): (string | null)[][] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const row = rows[index] ?? [];
    return Array.from({ length: index + 1 }, (_, slot) => row[slot] ?? null);
  });
}

function cardsIn(rows: readonly (readonly (string | null)[])[]): number {
  let count = 0;
  for (const row of rows) {
    for (const card of row) if (card) count += 1;
  }
  return count;
}

function cloneRows(rows: readonly (readonly (string | null)[])[]): (string | null)[][] {
  return rows.map((row) => [...row]);
}

function cleanPile(pile: unknown, up: boolean): string[] | null {
  if (!Array.isArray(pile)) return null;
  const cards: string[] = [];
  for (const item of pile) {
    if (typeof item !== 'string') return null;
    const face = cardFace(item);
    if (!face || face.up !== up) return null;
    cards.push(up ? faceUp(item) : faceDown(item));
  }
  return cards;
}

function sameState(a: PyramidState, b: PyramidState): boolean {
  return (
    a.moves === b.moves &&
    a.won === b.won &&
    a.lastAction === b.lastAction &&
    sameList(a.stock, b.stock) &&
    sameList(a.waste, b.waste) &&
    sameList(a.removed, b.removed) &&
    sameList(a.undo, b.undo) &&
    a.rows.every((row, index) => sameSlots(row, b.rows[index] ?? []))
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function sameSlots(a: readonly (string | null)[], b: readonly (string | null)[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function freshDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, false));
  }
  return cards;
}

function shuffle(cards: string[]): string[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    const card = next[index];
    next[index] = next[swap];
    next[swap] = card;
  }
  return next;
}

function randomInt(maxExclusive: number): number {
  const max = 0x100000000;
  const limit = max - (max % maxExclusive);
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    fillRandom(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function faceUp(code: string): string {
  return `${code[0].toUpperCase()}${code[1].toUpperCase()}`;
}

function faceDown(code: string): string {
  return `${code[0].toUpperCase()}${code[1].toLowerCase()}`;
}
