import type { Game } from './models';
import { cardCode, cardFace, type CardFace, type Suit } from './klondike';
import { fillRandom } from './secureRandom';

/**
 * Spider solitaire.
 * Two decks, ten columns. A sequence moves only when it is the same suit and
 * descending. It may land on any suit of the next higher rank, or an empty column.
 * A king-to-ace run of one suit leaves the table. Eight of those wins.
 * Deal the stock only when every column has a card.
 */

export type { CardFace, Suit };
export { cardCode, cardFace };

export type SuitCount = 1 | 2 | 4;

export type SpiderSource = { column: number; at: number };

export type SpiderState = {
  suits: SuitCount;
  /** Face-down stock. The last card is the top. Deals come off in tens. */
  stock: string[];
  /** Ten columns. The last card is the top. Face-down cards sit under face-up cards. */
  tableau: string[][];
  /** Finished suits, each king through ace. */
  completed: string[][];
  moves: number;
  won: boolean;
  lastAction: string;
  /** Earlier layouts, newest last. Each entry is one move. */
  undo: string[];
};

const COLUMNS = 10;
const SUIT_RUN = 13;
const DECK_SIZE = 104;
const UNDO_LIMIT = 80;
const SUIT_NAMES: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

type Snap = {
  stock: string[];
  tableau: string[][];
  completed: string[][];
  moves: number;
  won: boolean;
};

/** Firestore cannot store an array of arrays, so each column is its own list. */
export type StoredSpider = Omit<SpiderState, 'tableau' | 'completed'> & {
  tableau: Record<string, string[]>;
  completed: Record<string, string[]>;
};

export function packSpider(state: SpiderState): StoredSpider {
  return {
    suits: state.suits,
    stock: state.stock,
    tableau: packPiles(state.tableau),
    completed: packPiles(state.completed),
    moves: state.moves,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackSpider(value: unknown): SpiderState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredSpider>;
  if (raw.suits !== 1 && raw.suits !== 2 && raw.suits !== 4) return null;
  const tableau = unpackPiles(raw.tableau, COLUMNS);
  const completed = unpackCompleted(raw.completed);
  if (!tableau || !completed) return null;
  if (!Array.isArray(raw.stock) || !Array.isArray(raw.undo)) return null;
  if (raw.stock.some((card) => typeof card !== 'string')) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') {
    return null;
  }
  return {
    suits: raw.suits,
    stock: [...raw.stock],
    tableau,
    completed,
    moves: raw.moves,
    won: raw.won,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  };
}

export function completedCount(state: SpiderState | null | undefined): number {
  return state?.completed.length ?? 0;
}

export function createSpiderState(suits: SuitCount = 1, deck?: readonly string[]): SpiderState {
  const cards = deck ? [...deck] : shuffle(freshDeck(suits));
  return deal(suits === 2 || suits === 4 ? suits : 1, cards);
}

/** A layout for tests and repair. `won` follows the finished suits. */
export function layoutSpider(input: {
  suits?: SuitCount;
  stock?: string[];
  tableau?: string[][];
  completed?: string[][];
  moves?: number;
  lastAction?: string;
  undo?: string[];
}): SpiderState {
  const completed = (input.completed ?? []).map((pile) => [...pile]);
  return {
    suits: input.suits === 2 || input.suits === 4 ? input.suits : 1,
    stock: [...(input.stock ?? [])],
    tableau: pad(input.tableau ?? [], COLUMNS),
    completed,
    moves: input.moves ?? 0,
    won: completed.length === 8,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  };
}

/** Column under a point in the tableau row. Gaps between columns are misses. */
export function dropTarget(localX: number, localY: number, cardWidth: number, gap: number): number | null {
  if (cardWidth <= 0 || localX < 0 || localY < 0) return null;
  const stride = cardWidth + gap;
  const column = Math.floor(localX / stride);
  if (column < 0 || column >= COLUMNS) return null;
  if (localX - column * stride > cardWidth) return null;
  return column;
}

/** Face-up same-suit run from this card through the top of the column. */
export function runFrom(state: SpiderState, column: number, at: number): string[] | null {
  const pile = state.tableau[column];
  if (!pile || at < 0 || at >= pile.length) return null;
  const run = pile.slice(at);
  let previous: CardFace | null = null;
  for (const code of run) {
    const face = cardFace(code);
    if (!face || !face.up) return null;
    if (previous && (face.suit !== previous.suit || face.rank !== previous.rank - 1)) return null;
    previous = face;
  }
  return run.length > 0 ? run : null;
}

export function play(state: SpiderState, source: SpiderSource, dest: number): SpiderState | null {
  if (state.won || source.column === dest || dest < 0 || dest >= COLUMNS) return null;
  const run = runFrom(state, source.column, source.at);
  if (!run || !fits(run, state.tableau[dest] ?? [])) return null;

  const tableau = state.tableau.map((column) => [...column]);
  tableau[source.column] = tableau[source.column].slice(0, source.at);
  flipTop(tableau[source.column]);
  tableau[dest].push(...run.map(faceUp));
  const settled = settle(tableau);
  const completed = [...state.completed, ...settled.added];
  const won = completed.length === 8;
  const moved = cardFace(run[0]);
  return step(state, {
    stock: [...state.stock],
    tableau: settled.tableau,
    completed,
    moves: state.moves + 1,
    won,
    lastAction: actionAfterMove(won, settled.added, run.length, moved),
  });
}

export function canDeal(state: SpiderState): boolean {
  return !state.won && state.stock.length >= COLUMNS && state.tableau.every((column) => column.length > 0);
}

export function dealStock(state: SpiderState): SpiderState | null {
  if (!canDeal(state)) return null;
  const drawn = state.stock.slice(-COLUMNS).reverse().map(faceUp);
  const tableau = state.tableau.map((column, index) => [...column, drawn[index]]);
  const settled = settle(tableau);
  const completed = [...state.completed, ...settled.added];
  const won = completed.length === 8;
  const added = settled.added.length;
  return step(state, {
    stock: state.stock.slice(0, -COLUMNS),
    tableau: settled.tableau,
    completed,
    moves: state.moves + 1,
    won,
    lastAction: won ? 'The layout is complete' : added === 1 ? 'Dealt a row and completed a suit' : added > 1 ? `Dealt a row and completed ${added} suits` : 'Dealt a row',
  });
}

export function undo(state: SpiderState): SpiderState | null {
  const raw = state.undo[state.undo.length - 1];
  if (!raw) return null;
  const snap = parseSnap(raw);
  if (!snap) return null;
  return {
    suits: state.suits,
    ...snap,
    undo: state.undo.slice(0, -1),
    lastAction: 'Undid the last move',
  };
}

export function destinations(state: SpiderState, source: SpiderSource): number[] {
  const found: number[] = [];
  for (let column = 0; column < COLUMNS; column++) {
    if (play(state, source, column)) found.push(column);
  }
  return found;
}

export function hint(state: SpiderState): string | null {
  if (state.won) return null;
  const moves = allMoves(state);
  const chosen =
    moves.find((move) => uncovers(state, move) && buildsInSuit(state, move)) ??
    moves.find((move) => uncovers(state, move)) ??
    moves.find((move) => buildsInSuit(state, move)) ??
    moves[0];
  if (chosen) {
    const face = cardFace(state.tableau[chosen.column]?.[chosen.at] ?? '');
    return face ? `Move the ${face.name}` : 'Move a sequence';
  }
  if (canDeal(state)) return 'Deal a row';
  if (state.stock.length >= COLUMNS && state.tableau.some((column) => column.length === 0)) {
    return 'Fill the empty column before dealing';
  }
  return 'No moves left';
}

export function hasMove(state: SpiderState): boolean {
  if (state.won) return false;
  if (canDeal(state)) return true;
  return allMoves(state).length > 0;
}

export function ensureSpiderState(game: Game): Game {
  if (game.templateId !== 'spider') return game;
  if (game.spider && isHealthy(game.spider)) return game;
  const suits = game.spider?.suits === 2 || game.spider?.suits === 4 ? game.spider.suits : 1;
  return { ...game, spider: createSpiderState(suits) };
}

function deal(suits: SuitCount, deck: string[]): SpiderState {
  const tableau: string[][] = Array.from({ length: COLUMNS }, () => []);
  let cursor = 0;
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      if (row === 5 && column >= 4) continue;
      const card = deck[cursor];
      cursor += 1;
      if (!card) continue;
      const top = (column < 4 && row === 5) || (column >= 4 && row === 4);
      tableau[column].push(top ? faceUp(card) : faceDown(card));
    }
  }
  return {
    suits,
    stock: deck.slice(cursor).reverse().map(faceDown),
    tableau,
    completed: [],
    moves: 0,
    won: false,
    lastAction: 'New deal',
    undo: [],
  };
}

function settle(tableau: string[][]): { tableau: string[][]; added: string[][] } {
  const next = tableau.map((column) => [...column]);
  const added: string[][] = [];
  let guard = 0;
  while (guard < 8) {
    guard += 1;
    let removed = false;
    for (let column = 0; column < COLUMNS; column++) {
      const run = completeRun(next[column]);
      if (!run) continue;
      next[column] = next[column].slice(0, -SUIT_RUN);
      flipTop(next[column]);
      added.push(run);
      removed = true;
    }
    if (!removed) break;
  }
  return { tableau: next, added };
}

function completeRun(column: readonly string[]): string[] | null {
  if (column.length < SUIT_RUN) return null;
  const run = column.slice(-SUIT_RUN);
  let suit: Suit | null = null;
  for (let index = 0; index < SUIT_RUN; index++) {
    const face = cardFace(run[index] ?? '');
    if (!face || !face.up || face.rank !== SUIT_RUN - index) return null;
    if (suit && face.suit !== suit) return null;
    suit = face.suit;
  }
  return run.map(faceUp);
}

function fits(run: readonly string[], pile: readonly string[]): boolean {
  if (pile.length === 0) return true;
  const moving = cardFace(run[0] ?? '');
  const top = cardFace(pile[pile.length - 1] ?? '');
  return Boolean(moving && top && top.up && moving.rank === top.rank - 1);
}

function flipTop(column: string[]): void {
  const top = column[column.length - 1];
  if (top && !isUp(top)) column[column.length - 1] = faceUp(top);
}

function actionAfterMove(won: boolean, added: string[][], length: number, moved: CardFace | null): string {
  if (won) return 'The layout is complete';
  if (added.length === 1) {
    const suit = cardFace(added[0]?.[0] ?? '')?.suit;
    return suit ? `Completed the ${SUIT_NAMES[suit]}` : 'Completed a suit';
  }
  if (added.length > 1) return `Completed ${added.length} suits`;
  return length > 1 ? `Moved ${length} cards` : `Moved the ${moved?.name ?? 'card'}`;
}

function allMoves(state: SpiderState): SpiderSource[] {
  const moves: SpiderSource[] = [];
  for (let column = 0; column < COLUMNS; column++) {
    const pile = state.tableau[column] ?? [];
    for (let at = 0; at < pile.length; at++) {
      if (!runFrom(state, column, at)) continue;
      if (destinations(state, { column, at }).length > 0) moves.push({ column, at });
    }
  }
  return moves;
}

function uncovers(state: SpiderState, source: SpiderSource): boolean {
  const below = state.tableau[source.column]?.[source.at - 1];
  return Boolean(below && !isUp(below));
}

function buildsInSuit(state: SpiderState, source: SpiderSource): boolean {
  const moving = cardFace(state.tableau[source.column]?.[source.at] ?? '');
  if (!moving) return false;
  return destinations(state, source).some((column) => {
    const top = cardFace(state.tableau[column]?.at(-1) ?? '');
    return Boolean(top && top.suit === moving.suit);
  });
}

function step(previous: SpiderState, next: Snap & { lastAction: string }): SpiderState {
  return {
    suits: previous.suits,
    stock: next.stock,
    tableau: next.tableau,
    completed: next.completed,
    moves: next.moves,
    won: next.won,
    lastAction: next.lastAction,
    undo: remember(previous),
  };
}

function remember(state: SpiderState): string[] {
  return [...state.undo, encode(state)].slice(-UNDO_LIMIT);
}

function encode(state: SpiderState): string {
  return JSON.stringify({
    stock: state.stock,
    tableau: state.tableau,
    completed: state.completed,
    moves: state.moves,
    won: state.won,
  });
}

function isHealthy(state: SpiderState): boolean {
  const parsed = parseState(state);
  return parsed !== null && sameState(parsed, state);
}

function parseState(raw: SpiderState): SpiderState | null {
  if (raw.suits !== 1 && raw.suits !== 2 && raw.suits !== 4) return null;
  if (!Array.isArray(raw.tableau) || raw.tableau.length !== COLUMNS) return null;
  const tableau: string[][] = [];
  for (const pile of raw.tableau) {
    const clean = cleanColumn(pile);
    if (!clean) return null;
    tableau.push(clean);
  }
  if (!Array.isArray(raw.completed) || raw.completed.length > 8) return null;
  const completed: string[][] = [];
  for (const pile of raw.completed) {
    const run = Array.isArray(pile) ? completeRun(pile) : null;
    if (!run || pile.length !== SUIT_RUN) return null;
    completed.push(run);
  }
  const stock = cleanPile(raw.stock, false);
  if (!stock) return null;
  if (!countsMatch(raw.suits, [...stock, ...tableau.flat(), ...completed.flat()])) return null;
  if (!Number.isInteger(raw.moves) || raw.moves < 0 || raw.moves > 100000) return null;
  const won = completed.length === 8;
  if (raw.won !== won) return null;
  if (typeof raw.lastAction !== 'string' || raw.lastAction.length > 160) return null;
  if (!Array.isArray(raw.undo) || raw.undo.length > UNDO_LIMIT) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string' || entry.length > 8000)) return null;
  return {
    suits: raw.suits,
    stock,
    tableau,
    completed,
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
  if (!Array.isArray(snap.stock) || !Array.isArray(snap.tableau) || !Array.isArray(snap.completed)) return null;
  if (typeof snap.moves !== 'number' || typeof snap.won !== 'boolean') return null;
  return {
    stock: [...snap.stock],
    tableau: snap.tableau.map((column) => [...column]),
    completed: snap.completed.map((pile) => [...pile]),
    moves: snap.moves,
    won: snap.won,
  };
}

function countsMatch(suits: SuitCount, cards: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const code of cards) {
    const face = cardFace(code);
    if (!face) return false;
    const id = `${face.rank}${face.suit}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if ([...counts.values()].reduce((sum, count) => sum + count, 0) !== DECK_SIZE) return false;
  const used = suitsFor(suits);
  const copies = 8 / used.length;
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    for (let rank = 1; rank <= 13; rank++) {
      const expected = used.includes(suit) ? copies : 0;
      if ((counts.get(`${rank}${suit}`) ?? 0) !== expected) return false;
    }
  }
  return true;
}

function suitsFor(suits: SuitCount): Suit[] {
  if (suits === 1) return ['S'];
  if (suits === 2) return ['S', 'H'];
  return ['S', 'H', 'D', 'C'];
}

function cleanColumn(pile: unknown): string[] | null {
  if (!Array.isArray(pile)) return null;
  const faces: CardFace[] = [];
  for (const item of pile) {
    if (typeof item !== 'string') return null;
    const face = cardFace(item);
    if (!face) return null;
    faces.push(face);
  }
  const upAt = faces.findIndex((face) => face.up);
  if (upAt >= 0 && faces.slice(0, upAt).some((face) => face.up)) return null;
  if (upAt >= 0 && faces.slice(upAt).some((face) => !face.up)) return null;
  if (faces.length > 0 && upAt < 0) return null;
  return faces.map((face, index) => (upAt >= 0 && index >= upAt ? faceUp(face.code) : faceDown(face.code)));
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

function sameState(a: SpiderState, b: SpiderState): boolean {
  return (
    a.suits === b.suits &&
    a.moves === b.moves &&
    a.won === b.won &&
    a.lastAction === b.lastAction &&
    sameList(a.stock, b.stock) &&
    sameList(a.undo, b.undo) &&
    a.tableau.every((column, index) => sameList(column, b.tableau[index] ?? [])) &&
    a.completed.every((pile, index) => sameList(pile, b.completed[index] ?? [])) &&
    a.completed.length === b.completed.length
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function packPiles(piles: string[][]): Record<string, string[]> {
  return Object.fromEntries(piles.map((pile, index) => [String(index), [...pile]]));
}

function unpackPiles(value: unknown, count: number): string[][] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const piles: string[][] = [];
  for (let index = 0; index < count; index++) {
    const pile = record[String(index)];
    if (!Array.isArray(pile) || pile.some((card) => typeof card !== 'string')) return null;
    piles.push([...(pile as string[])]);
  }
  return piles;
}

function unpackCompleted(value: unknown): string[][] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const piles: string[][] = [];
  for (let index = 0; index < 8; index++) {
    const pile = record[String(index)];
    if (pile == null) break;
    if (!Array.isArray(pile) || pile.some((card) => typeof card !== 'string')) return null;
    piles.push([...(pile as string[])]);
  }
  return piles;
}

function pad(piles: string[][], count: number): string[][] {
  return Array.from({ length: count }, (_, index) => [...(piles[index] ?? [])]);
}

function freshDeck(suits: SuitCount): string[] {
  const used = suitsFor(suits);
  const copies = 8 / used.length;
  const cards: string[] = [];
  for (let copy = 0; copy < copies; copy++) {
    for (const suit of used) {
      for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, false));
    }
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

function isUp(code: string): boolean {
  return code[1] === code[1]?.toUpperCase();
}
