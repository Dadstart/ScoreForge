import type { Game } from './models';
import { fillRandom } from './secureRandom';
import { cardCode, cardFace, type Suit } from './klondike';

/**
 * FreeCell.
 * Cascades build down in alternating colors. Foundations build up by suit from the ace.
 * One card moves freely. A longer run moves when the free cells and empty columns can hold it.
 * Any card may fill an empty column.
 */

export type Source =
  | { pile: 'cell'; index: number }
  | { pile: 'foundation'; index: number }
  | { pile: 'cascade'; index: number; at: number };

export type Dest =
  | { pile: 'cell'; index: number }
  | { pile: 'foundation'; index: number }
  | { pile: 'cascade'; index: number };

const COLUMNS = 8;
const CELLS = 4;
const FOUNDATIONS = 4;
const UNDO_LIMIT = 80;
const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

export type FreecellState = {
  /** Four holding cells. Null is empty. */
  cells: (string | null)[];
  /** Four foundation piles. The last card is the top. */
  foundations: string[][];
  /** Eight cascade piles. The last card is the top. */
  cascades: string[][];
  moves: number;
  won: boolean;
  lastAction: string;
  undo: string[];
};

type Snap = {
  cells: (string | null)[];
  foundations: string[][];
  cascades: string[][];
  moves: number;
  won: boolean;
};

/** Firestore cannot store an array of arrays, so piles are a map keyed by column. */
export type StoredFreecell = Omit<FreecellState, 'foundations' | 'cascades'> & {
  foundations: Record<string, string[]>;
  cascades: Record<string, string[]>;
};

export function packFreecell(state: FreecellState): StoredFreecell {
  return {
    cells: [...state.cells],
    foundations: packPiles(state.foundations),
    cascades: packPiles(state.cascades),
    moves: state.moves,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackFreecell(value: unknown): FreecellState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredFreecell> & Partial<FreecellState>;
  const foundations = unpackPiles(raw.foundations, FOUNDATIONS);
  const cascades = unpackPiles(raw.cascades, COLUMNS);
  if (!foundations || !cascades || !Array.isArray(raw.cells) || raw.cells.length !== CELLS) return null;
  if (raw.cells.some((card) => card != null && typeof card !== 'string')) return null;
  if (!Array.isArray(raw.undo) || raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') return null;
  const state: FreecellState = {
    cells: raw.cells.map((card) => (card == null ? null : faceUp(card))),
    foundations: foundations.map((pile) => pile.map(faceUp)),
    cascades: cascades.map((pile) => pile.map(faceUp)),
    moves: raw.moves,
    won: false,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  };
  state.won = homeCount(state) === 52;
  return isHealthy(state) ? state : null;
}

export function homeCount(state: FreecellState | null | undefined): number {
  if (!state) return 0;
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

export function createFreecellState(deck?: readonly string[]): FreecellState {
  const cards = deck ? deck.map(faceUp) : shuffle(freshDeck());
  return deal(cards);
}

/** A layout for tests. `won` follows the foundations. */
export function layoutFreecell(input: {
  cells?: (string | null)[];
  foundations?: string[][];
  cascades?: string[][];
  moves?: number;
  lastAction?: string;
  undo?: string[];
}): FreecellState {
  const foundations = pad(input.foundations ?? [], FOUNDATIONS).map((pile) => pile.map(faceUp));
  const cascades = pad(input.cascades ?? [], COLUMNS).map((pile) => pile.map(faceUp));
  const cells = Array.from({ length: CELLS }, (_, index) => {
    const card = input.cells?.[index];
    return card == null ? null : faceUp(card);
  });
  return {
    cells,
    foundations,
    cascades,
    moves: input.moves ?? 0,
    won: foundations.reduce((sum, pile) => sum + pile.length, 0) === 52,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  };
}

export function play(state: FreecellState, source: Source, dest: Dest): FreecellState | null {
  if (state.won || sameSpot(source, dest)) return null;
  const run = runCards(state, source);
  if (!run || !moveFits(state, run, dest)) return null;

  const cells = [...state.cells];
  const foundations = state.foundations.map((pile) => [...pile]);
  const cascades = state.cascades.map((pile) => [...pile]);
  take(cells, foundations, cascades, source, run.length);
  put(cells, foundations, cascades, dest, run);

  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  const moved = cardFace(run[0]);
  const lastAction = won
    ? 'The layout is complete'
    : dest.pile === 'foundation'
      ? `Built the ${moved?.name ?? 'card'}`
      : run.length > 1
        ? `Moved ${run.length} cards`
        : `Moved the ${moved?.name ?? 'card'}`;

  return step(state, { cells, foundations, cascades, moves: state.moves + 1, won, lastAction });
}

/** Move one card onto its foundation. A second tap uses this. */
export function buildFoundation(state: FreecellState, source: Source): FreecellState | null {
  const run = runCards(state, source);
  if (!run || run.length !== 1) return null;
  for (let index = 0; index < FOUNDATIONS; index++) {
    const next = play(state, source, { pile: 'foundation', index });
    if (next) return next;
  }
  return null;
}

export function destinations(state: FreecellState, source: Source): Dest[] {
  const found: Dest[] = [];
  for (let index = 0; index < CELLS; index++) {
    if (play(state, source, { pile: 'cell', index })) found.push({ pile: 'cell', index });
  }
  for (let index = 0; index < FOUNDATIONS; index++) {
    if (play(state, source, { pile: 'foundation', index })) found.push({ pile: 'foundation', index });
  }
  for (let index = 0; index < COLUMNS; index++) {
    if (play(state, source, { pile: 'cascade', index })) found.push({ pile: 'cascade', index });
  }
  return found;
}

export function canFinish(state: FreecellState): boolean {
  return !state.won && nextSafe(state) !== null;
}

/** Send home every card that cannot be needed on a cascade. One undo puts them back. */
export function finish(state: FreecellState): FreecellState | null {
  if (!canFinish(state)) return null;
  let current = state;
  let guard = 0;
  while (guard < 52) {
    guard += 1;
    const move = nextSafe(current);
    if (!move) break;
    const next = play(current, move.source, move.dest);
    if (!next) break;
    current = { ...next, undo: current.undo };
  }
  if (current.moves === state.moves) return null;
  return {
    ...current,
    undo: remember(state),
    lastAction: current.won ? 'The layout is complete' : 'Built what can go home',
  };
}

export function undo(state: FreecellState): FreecellState | null {
  const raw = state.undo[state.undo.length - 1];
  if (!raw) return null;
  const snap = parseSnap(raw);
  if (!snap) return null;
  return { ...snap, undo: state.undo.slice(0, -1), lastAction: 'Undid the last move' };
}

export function hint(state: FreecellState): string | null {
  if (state.won) return null;
  const home = findMove(state, (dest) => dest.pile === 'foundation');
  if (home) return `Build the ${nameOf(home.card)}`;
  const cascade = findMove(state, (dest) => dest.pile === 'cascade');
  if (cascade) return cascade.run > 1 ? `Move ${cascade.run} cards` : `Move the ${nameOf(cascade.card)}`;
  const cell = findMove(state, (dest) => dest.pile === 'cell');
  if (cell) return `Park the ${nameOf(cell.card)}`;
  return 'No moves left';
}

export function hasMove(state: FreecellState): boolean {
  if (state.won) return false;
  return sources(state).some((source) => destinations(state, source).length > 0);
}

export function ensureFreecellState(game: Game): Game {
  if (game.templateId !== 'freecell') return game;
  if (game.freecell && isHealthy(game.freecell)) return game;
  return { ...game, freecell: createFreecellState() };
}

/**
 * Pile under a point in the board's own coordinates.
 * The top row is four free cells, then four foundations. Eight cascades sit below.
 */
export function dropTarget(
  localX: number,
  localY: number,
  cardWidth: number,
  cardHeight: number,
  columnGap: number,
  rowGap: number,
): Dest | null {
  if (cardWidth <= 0 || cardHeight <= 0 || localX < 0 || localY < 0) return null;
  const stride = cardWidth + columnGap;
  const column = Math.floor(localX / stride);
  if (column < 0 || column >= COLUMNS) return null;
  if (localX - column * stride > cardWidth) return null;
  if (localY <= cardHeight) {
    return column < CELLS ? { pile: 'cell', index: column } : { pile: 'foundation', index: column - CELLS };
  }
  if (localY >= cardHeight + rowGap) return { pile: 'cascade', index: column };
  return null;
}

function deal(deck: string[]): FreecellState {
  const cascades: string[][] = Array.from({ length: COLUMNS }, () => []);
  deck.forEach((card, index) => {
    cascades[index % COLUMNS].push(faceUp(card));
  });
  return {
    cells: [null, null, null, null],
    foundations: [[], [], [], []],
    cascades,
    moves: 0,
    won: false,
    lastAction: 'New deal',
    undo: [],
  };
}

function step(previous: FreecellState, next: Snap & { lastAction: string }): FreecellState {
  return {
    cells: next.cells,
    foundations: next.foundations,
    cascades: next.cascades,
    moves: next.moves,
    won: next.won,
    lastAction: next.lastAction,
    undo: remember(previous),
  };
}

function remember(state: FreecellState): string[] {
  return [...state.undo, encode(state)].slice(-UNDO_LIMIT);
}

function encode(state: FreecellState): string {
  return JSON.stringify({
    cells: state.cells,
    foundations: state.foundations,
    cascades: state.cascades,
    moves: state.moves,
    won: state.won,
  });
}

function moveFits(state: FreecellState, run: readonly string[], dest: Dest): boolean {
  if (dest.pile === 'cell') return run.length === 1 && state.cells[dest.index] == null;
  if (dest.pile === 'foundation') return run.length === 1 && fitsFoundation(run[0], state.foundations[dest.index] ?? []);
  const pile = state.cascades[dest.index] ?? [];
  if (!fitsCascade(run[0], pile)) return false;
  return run.length <= maxRun(state, pile.length === 0);
}

/** How many cards the free cells and empty columns can carry, one at a time. */
function maxRun(state: FreecellState, destIsEmpty: boolean): number {
  const free = state.cells.filter((card) => card == null).length;
  let empty = state.cascades.filter((pile) => pile.length === 0).length;
  if (destIsEmpty) empty = Math.max(0, empty - 1);
  return (1 + free) * 2 ** empty;
}

function take(
  cells: (string | null)[],
  foundations: string[][],
  cascades: string[][],
  source: Source,
  count: number,
) {
  if (source.pile === 'cell') cells[source.index] = null;
  else if (source.pile === 'foundation') foundations[source.index].pop();
  else cascades[source.index] = cascades[source.index].slice(0, -count);
}

function put(cells: (string | null)[], foundations: string[][], cascades: string[][], dest: Dest, run: readonly string[]) {
  const cards = run.map(faceUp);
  if (dest.pile === 'cell') cells[dest.index] = cards[0] ?? null;
  else if (dest.pile === 'foundation' && cards[0]) foundations[dest.index].push(cards[0]);
  else cascades[dest.index].push(...cards);
}

function runCards(state: FreecellState, source: Source): string[] | null {
  if (source.pile === 'cell') {
    const card = state.cells[source.index];
    return card ? [card] : null;
  }
  if (source.pile === 'foundation') {
    const pile = state.foundations[source.index];
    const top = pile?.[pile.length - 1];
    return top ? [top] : null;
  }
  const pile = state.cascades[source.index];
  if (!pile || source.at < 0 || source.at >= pile.length) return null;
  const run = pile.slice(source.at);
  return legalRun(run) ? run : null;
}

function legalRun(run: readonly string[]): boolean {
  if (run.length === 0) return false;
  let previous = cardFace(run[0]);
  if (!previous) return false;
  for (let index = 1; index < run.length; index++) {
    const face = cardFace(run[index]);
    if (!face || face.red === previous.red || face.rank !== previous.rank - 1) return false;
    previous = face;
  }
  return true;
}

function fitsFoundation(code: string, pile: readonly string[]): boolean {
  const face = cardFace(code);
  if (!face) return false;
  if (pile.length === 0) return face.rank === 1;
  const top = cardFace(pile[pile.length - 1]);
  return Boolean(top && top.suit === face.suit && face.rank === top.rank + 1);
}

function fitsCascade(code: string, pile: readonly string[]): boolean {
  const face = cardFace(code);
  if (!face) return false;
  if (pile.length === 0) return true;
  const top = cardFace(pile[pile.length - 1]);
  return Boolean(top && top.red !== face.red && face.rank === top.rank - 1);
}

function sameSpot(source: Source, dest: Dest): boolean {
  if (source.pile !== dest.pile) return false;
  return source.index === dest.index;
}

function nextSafe(state: FreecellState): { source: Source; dest: Dest } | null {
  for (const source of sources(state)) {
    const run = runCards(state, source);
    if (!run || run.length !== 1 || !safeHome(run[0], state.foundations)) continue;
    for (let index = 0; index < FOUNDATIONS; index++) {
      const dest: Dest = { pile: 'foundation', index };
      if (play(state, source, dest)) return { source, dest };
    }
  }
  return null;
}

/** An ace or two can always go home. A higher card can once both lower opposite-color cards are up. */
function safeHome(code: string, foundations: readonly string[][]): boolean {
  const face = cardFace(code);
  if (!face) return false;
  if (face.rank <= 2) return true;
  const opposite: Suit[] = face.red ? ['S', 'C'] : ['H', 'D'];
  return opposite.every((suit) => suitRank(foundations, suit) >= face.rank - 1);
}

function suitRank(foundations: readonly string[][], suit: Suit): number {
  for (const pile of foundations) {
    const top = cardFace(pile[pile.length - 1] ?? '');
    if (top?.suit === suit) return top.rank;
  }
  return 0;
}

function sources(state: FreecellState): Source[] {
  const found: Source[] = [];
  state.cells.forEach((card, index) => {
    if (card) found.push({ pile: 'cell', index });
  });
  state.foundations.forEach((pile, index) => {
    if (pile.length > 0) found.push({ pile: 'foundation', index });
  });
  state.cascades.forEach((pile, index) => {
    for (let at = 0; at < pile.length; at++) {
      if (legalRun(pile.slice(at))) found.push({ pile: 'cascade', index, at });
    }
  });
  return found;
}

function findMove(
  state: FreecellState,
  want: (dest: Dest) => boolean,
): { card: string; run: number } | null {
  for (const source of sources(state)) {
    if (source.pile === 'foundation') continue;
    const run = runCards(state, source);
    if (!run) continue;
    if (destinations(state, source).some(want)) return { card: run[0], run: run.length };
  }
  return null;
}

function nameOf(code: string): string {
  return cardFace(code)?.name ?? 'card';
}

function isHealthy(state: FreecellState): boolean {
  if (state.cells.length !== CELLS || state.foundations.length !== FOUNDATIONS || state.cascades.length !== COLUMNS) {
    return false;
  }
  const cards = [
    ...state.cells.filter((card): card is string => card != null),
    ...state.foundations.flat(),
    ...state.cascades.flat(),
  ];
  if (cards.length !== 52 || cards.some((card) => !cardFace(card))) return false;
  const seen = new Set(cards.map((card) => card.toUpperCase()));
  return seen.size === 52 && state.won === (homeCount(state) === 52);
}

function parseSnap(raw: string): Snap | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Snap>;
    if (!parsed || !Array.isArray(parsed.cells) || parsed.cells.length !== CELLS) return null;
    if (!Array.isArray(parsed.foundations) || parsed.foundations.length !== FOUNDATIONS) return null;
    if (!Array.isArray(parsed.cascades) || parsed.cascades.length !== COLUMNS) return null;
    const state = layoutFreecell({
      cells: parsed.cells,
      foundations: parsed.foundations,
      cascades: parsed.cascades,
      moves: typeof parsed.moves === 'number' ? parsed.moves : 0,
    });
    const cards = [
      ...state.cells.filter((card): card is string => card != null),
      ...state.foundations.flat(),
      ...state.cascades.flat(),
    ];
    return cards.every((card) => cardFace(card)) ? state : null;
  } catch {
    return null;
  }
}

function packPiles(piles: string[][]): Record<string, string[]> {
  return Object.fromEntries(piles.map((pile, index) => [String(index), [...pile]]));
}

function unpackPiles(value: unknown, count: number): string[][] | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const piles: string[][] = [];
  for (let index = 0; index < count; index++) {
    const pile = record[String(index)];
    if (!Array.isArray(pile) || pile.some((card) => typeof card !== 'string')) return null;
    piles.push([...(pile as string[])]);
  }
  return piles;
}

function pad(piles: string[][], count: number): string[][] {
  return Array.from({ length: count }, (_, index) => [...(piles[index] ?? [])]);
}

function freshDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, true));
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
