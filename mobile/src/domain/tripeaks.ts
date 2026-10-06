import { cardCode, cardFace, type Suit } from './klondike';
import type { Game } from './models';
import { fillRandom } from './secureRandom';

export { cardFace };

/**
 * TriPeaks solitaire.
 * Twenty-eight cards make three peaks. The bottom row of ten is face up.
 * A card is free when both cards covering it are gone. Play a free card that is
 * one rank higher or lower than the waste. Aces and kings do not meet.
 * Each card in a run scores its place in the run. Drawing resets the run.
 * Clearing a peak adds 15. The peaks are clear when every tableau card is gone.
 */

export type Spot = { row: number; index: number };

export type TriPeaksState = {
  /** Face-down stock. The last card is the top. */
  stock: string[];
  /** Face-up waste. The last card is the card in play. */
  waste: string[];
  /** Row 0 is the three peaks. Row 3 is the face-up row of ten. Null is an empty slot. */
  rows: (string | null)[][];
  moves: number;
  /** Points from the current deal. A run of n cards scores 1 + 2 + … + n, plus 15 for each peak. */
  score: number;
  /** Cards played since the last draw. */
  streak: number;
  won: boolean;
  lastAction: string;
  /** Earlier layouts, newest last. Each entry is one move. */
  undo: string[];
};

const ROW_LENGTHS = [3, 6, 9, 10] as const;
const ROW_COUNT = ROW_LENGTHS.length;
const TABLEAU_CARDS = 28;
const PEAK_BONUS = 15;
const UNDO_LIMIT = 80;
const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

type Snap = {
  stock: string[];
  waste: string[];
  rows: (string | null)[][];
  moves: number;
  score: number;
  streak: number;
  won: boolean;
};

/** Firestore cannot store an array of arrays, so each row is its own list. */
export type StoredTriPeaks = Omit<TriPeaksState, 'rows'> & {
  rows: Record<string, string[]>;
};

export { PEAK_BONUS, TABLEAU_CARDS };

/** The two cards that cover this one. The bottom row is uncovered. */
export function covers(row: number, index: number): Array<[number, number]> {
  if (row === 3) return [];
  if (row === 2) return [
    [3, index],
    [3, index + 1],
  ];
  if (row === 1) {
    const peak = Math.floor(index / 2);
    const offset = index % 2;
    const base = peak * 3 + offset;
    return [
      [2, base],
      [2, base + 1],
    ];
  }
  if (row === 0) return [
    [1, index * 2],
    [1, index * 2 + 1],
  ];
  return [];
}

export function clearedCount(state: TriPeaksState | null | undefined): number {
  if (!state) return 0;
  return TABLEAU_CARDS - cardsIn(state.rows);
}

export function createTriPeaksState(deck?: readonly string[]): TriPeaksState {
  const cards = deck ? [...deck] : shuffle(freshDeck());
  return deal(cards);
}

/** A layout for tests and repair. Faces follow which cards are covered. */
export function layoutTriPeaks(input: {
  stock?: string[];
  waste?: string[];
  rows?: (string | null)[][];
  moves?: number;
  score?: number;
  streak?: number;
  lastAction?: string;
  undo?: string[];
}): TriPeaksState {
  return layoutFrom({
    stock: [...(input.stock ?? [])],
    waste: [...(input.waste ?? [])],
    rows: normalizeRows(input.rows ?? []),
    moves: input.moves ?? 0,
    score: input.score ?? 0,
    streak: input.streak ?? 0,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  });
}

export function packTriPeaks(state: TriPeaksState): StoredTriPeaks {
  return {
    stock: state.stock,
    waste: state.waste,
    rows: Object.fromEntries(state.rows.map((row, index) => [String(index), row.map((card) => card ?? '')])),
    moves: state.moves,
    score: state.score,
    streak: state.streak,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackTriPeaks(value: unknown): TriPeaksState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredTriPeaks>;
  const rows = unpackRows(raw.rows);
  if (!rows) return null;
  if (!Array.isArray(raw.stock) || !Array.isArray(raw.waste) || !Array.isArray(raw.undo)) return null;
  if (raw.stock.some((card) => typeof card !== 'string')) return null;
  if (raw.waste.some((card) => typeof card !== 'string')) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.score !== 'number' || typeof raw.streak !== 'number') return null;
  if (typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') return null;
  const state = layoutFrom({
    stock: [...raw.stock],
    waste: [...raw.waste],
    rows,
    moves: raw.moves,
    score: raw.score,
    streak: raw.streak,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  });
  return isHealthy(state) ? state : null;
}

export function isFree(state: TriPeaksState, spot: Spot): boolean {
  if (state.won) return false;
  if (!inBounds(spot)) return false;
  const card = state.rows[spot.row]?.[spot.index];
  if (!card) return false;
  return openAt(state.rows, spot.row, spot.index);
}

export function cardAt(state: TriPeaksState, spot: Spot): ReturnType<typeof cardFace> {
  if (!inBounds(spot)) return null;
  const code = state.rows[spot.row]?.[spot.index];
  return code ? cardFace(code) : null;
}

export function wasteCard(state: TriPeaksState): ReturnType<typeof cardFace> {
  const top = state.waste[state.waste.length - 1];
  return top ? cardFace(top) : null;
}

/** Free cards one rank away from the waste. */
export function playableSpots(state: TriPeaksState): Spot[] {
  const target = wasteCard(state);
  if (!target || state.won) return [];
  const spots: Spot[] = [];
  for (let row = ROW_COUNT - 1; row >= 0; row--) {
    for (let index = 0; index < ROW_LENGTHS[row]; index++) {
      const spot = { row, index };
      const face = cardAt(state, spot);
      if (!face?.up || !isFree(state, spot)) continue;
      if (Math.abs(face.rank - target.rank) === 1) spots.push(spot);
    }
  }
  return spots;
}

export function play(state: TriPeaksState, spot: Spot): TriPeaksState | null {
  if (!playableSpots(state).some((item) => item.row === spot.row && item.index === spot.index)) return null;
  const face = cardAt(state, spot);
  const card = state.rows[spot.row]?.[spot.index];
  if (!face || !card) return null;
  const rows = cloneRows(state.rows);
  rows[spot.row][spot.index] = null;
  reveal(rows);
  const streak = state.streak + 1;
  const peak = spot.row === 0;
  const score = state.score + streak + (peak ? PEAK_BONUS : 0);
  const won = cardsIn(rows) === 0;
  const action = won
    ? 'The peaks are clear'
    : peak
      ? `Played the ${face.name} and cleared a peak`
      : `Played the ${face.name}`;
  return step(state, {
    stock: [...state.stock],
    waste: [...state.waste, faceUp(card)],
    rows,
    moves: state.moves + 1,
    score,
    streak,
    won,
    lastAction: action,
  });
}

export function drawStock(state: TriPeaksState): TriPeaksState | null {
  if (state.won || state.stock.length === 0) return null;
  const card = faceUp(state.stock[state.stock.length - 1]);
  return step(state, {
    stock: state.stock.slice(0, -1),
    waste: [...state.waste, card],
    rows: cloneRows(state.rows),
    moves: state.moves + 1,
    score: state.score,
    streak: 0,
    won: false,
    lastAction: 'Drew a card',
  });
}

export function undo(state: TriPeaksState): TriPeaksState | null {
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

export function hint(state: TriPeaksState): string | null {
  if (state.won) return null;
  const spot = playableSpots(state)[0];
  if (spot) {
    const face = cardAt(state, spot);
    return face ? `Play the ${face.name}` : 'Play a card';
  }
  if (state.stock.length > 0) return 'Draw from the stock';
  return 'No moves left';
}

export function hasMove(state: TriPeaksState): boolean {
  if (state.won) return false;
  return state.stock.length > 0 || playableSpots(state).length > 0;
}

export function ensureTriPeaksState(game: Game): Game {
  if (game.templateId !== 'tripeaks') return game;
  if (game.tripeaks && isHealthy(game.tripeaks)) return game;
  return { ...game, tripeaks: createTriPeaksState() };
}

function layoutFrom(input: {
  stock: string[];
  waste: string[];
  rows: (string | null)[][];
  moves: number;
  score: number;
  streak: number;
  lastAction: string;
  undo: string[];
}): TriPeaksState {
  const rows = reveal(normalizeRows(input.rows));
  return {
    stock: input.stock.map((card) => keep(card, false)),
    waste: input.waste.map((card) => keep(card, true)),
    rows,
    moves: input.moves,
    score: input.score,
    streak: input.streak,
    won: cardsIn(rows) === 0,
    lastAction: input.lastAction,
    undo: input.undo,
  };
}

function deal(deck: string[]): TriPeaksState {
  const rows: (string | null)[][] = [[], [], [], []];
  let cursor = 0;
  for (const row of [3, 2, 1, 0]) {
    const line: (string | null)[] = [];
    for (let index = 0; index < ROW_LENGTHS[row]; index++) {
      const card = deck[cursor];
      cursor += 1;
      if (!card) line.push(null);
      else line.push(row === 3 ? faceUp(card) : faceDown(card));
    }
    rows[row] = line;
  }
  const rest = deck.slice(cursor);
  const waste = rest[0] ? [faceUp(rest[0])] : [];
  const stock = rest
    .slice(1)
    .reverse()
    .map((card) => faceDown(card));
  reveal(rows);
  const won = cardsIn(rows) === 0;
  return {
    stock,
    waste,
    rows,
    moves: 0,
    score: 0,
    streak: 0,
    won,
    lastAction: 'New deal',
    undo: [],
  };
}

function step(previous: TriPeaksState, next: Snap & { lastAction: string }): TriPeaksState {
  return {
    stock: next.stock,
    waste: next.waste,
    rows: next.rows,
    moves: next.moves,
    score: next.score,
    streak: next.streak,
    won: next.won,
    lastAction: next.lastAction,
    undo: remember(previous),
  };
}

function remember(state: TriPeaksState): string[] {
  return [...state.undo, encode(state)].slice(-UNDO_LIMIT);
}

function encode(state: TriPeaksState): string {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    rows: state.rows,
    moves: state.moves,
    score: state.score,
    streak: state.streak,
    won: state.won,
  } satisfies Snap);
}

function isHealthy(state: TriPeaksState): boolean {
  const parsed = parseState(state);
  return parsed !== null && sameState(parsed, state);
}

function parseState(raw: TriPeaksState): TriPeaksState | null {
  if (!Array.isArray(raw.rows) || raw.rows.length !== ROW_COUNT) return null;
  const rows: (string | null)[][] = [];
  for (let index = 0; index < ROW_COUNT; index++) {
    const row = raw.rows[index];
    if (!Array.isArray(row) || row.length !== ROW_LENGTHS[index]) return null;
    const clean: (string | null)[] = [];
    for (const card of row) {
      if (card == null) {
        clean.push(null);
        continue;
      }
      if (!cardFace(card)) return null;
      clean.push(card);
    }
    rows.push(clean);
  }
  reveal(rows);
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let index = 0; index < rows[row].length; index++) {
      if (rows[row][index] !== raw.rows[row]?.[index]) return null;
    }
  }
  const stock = cleanPile(raw.stock, false);
  const waste = cleanPile(raw.waste, true);
  if (!stock || !waste) return null;
  const seen = new Set<string>();
  for (const code of [...stock, ...waste, ...rows.flat().filter((card): card is string => card != null)]) {
    const face = cardFace(code);
    if (!face) return null;
    const id = `${face.rank}${face.suit}`;
    if (seen.has(id)) return null;
    seen.add(id);
  }
  if (seen.size !== 52) return null;
  if (!Number.isInteger(raw.moves) || raw.moves < 0 || raw.moves > 100000) return null;
  if (!Number.isInteger(raw.score) || raw.score < 0 || raw.score > 100000) return null;
  if (!Number.isInteger(raw.streak) || raw.streak < 0 || raw.streak > TABLEAU_CARDS) return null;
  const won = cardsIn(rows) === 0;
  if (raw.won !== won) return null;
  if (typeof raw.lastAction !== 'string' || raw.lastAction.length > 160) return null;
  if (!Array.isArray(raw.undo) || raw.undo.length > UNDO_LIMIT) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string' || entry.length > 8000)) return null;
  return {
    stock,
    waste,
    rows,
    moves: raw.moves,
    score: raw.score,
    streak: raw.streak,
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
  if (typeof snap.moves !== 'number' || typeof snap.score !== 'number' || typeof snap.streak !== 'number') return null;
  if (typeof snap.won !== 'boolean') return null;
  return {
    stock: [...snap.stock],
    waste: [...snap.waste],
    rows: snap.rows.map((row) => [...row]),
    moves: snap.moves,
    score: snap.score,
    streak: snap.streak,
    won: snap.won,
  };
}

function unpackRows(value: unknown): (string | null)[][] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rows: (string | null)[][] = [];
  for (let index = 0; index < ROW_COUNT; index++) {
    const row = unpackRow(record[String(index)], ROW_LENGTHS[index]);
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
  return Array.from({ length: ROW_COUNT }, (_, row) => {
    const line = rows[row] ?? [];
    return Array.from({ length: ROW_LENGTHS[row] }, (_, index) => line[index] ?? null);
  });
}

function reveal(rows: (string | null)[][]): (string | null)[][] {
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let index = 0; index < rows[row].length; index++) {
      const card = rows[row][index];
      if (!card || !cardFace(card)) continue;
      rows[row][index] = openAt(rows, row, index) ? faceUp(card) : faceDown(card);
    }
  }
  return rows;
}

function openAt(rows: readonly (readonly (string | null)[])[], row: number, index: number): boolean {
  return covers(row, index).every(([coverRow, coverIndex]) => !rows[coverRow]?.[coverIndex]);
}

function inBounds(spot: Spot): boolean {
  return spot.row >= 0 && spot.row < ROW_COUNT && spot.index >= 0 && spot.index < ROW_LENGTHS[spot.row];
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

function sameState(a: TriPeaksState, b: TriPeaksState): boolean {
  return (
    a.moves === b.moves &&
    a.score === b.score &&
    a.streak === b.streak &&
    a.won === b.won &&
    a.lastAction === b.lastAction &&
    sameList(a.stock, b.stock) &&
    sameList(a.waste, b.waste) &&
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

function keep(code: string, up: boolean): string {
  if (!cardFace(code)) return code;
  return up ? faceUp(code) : faceDown(code);
}

function faceUp(code: string): string {
  return `${code[0].toUpperCase()}${code[1].toUpperCase()}`;
}

function faceDown(code: string): string {
  return `${code[0].toUpperCase()}${code[1].toLowerCase()}`;
}
