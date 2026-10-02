import type { Game } from './models';

/**
 * Freecell solitaire.
 * Eight cascades are dealt face up. Four free cells hold one card each.
 * Cascades build down in alternating colors. Foundations build up by suit from the ace.
 * A built run moves in one step when the empty free cells and columns can hold it.
 * Deal numbers 1 through 32000 use the Microsoft FreeCell shuffle.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';

export type Source =
  | { pile: 'cell'; index: number }
  | { pile: 'foundation'; index: number }
  | { pile: 'tableau'; index: number; at: number };

export type Dest =
  | { pile: 'cell'; index: number }
  | { pile: 'foundation'; index: number }
  | { pile: 'tableau'; index: number };

const CASCADE_COUNT = 8;
const CELL_COUNT = 4;
const FOUNDATION_COUNT = 4;

/**
 * Pile under a point in the board's own coordinates.
 * The top row is four free cells, then four foundations. The row below is eight columns.
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
  if (column < 0 || column > CASCADE_COUNT - 1) return null;
  if (localX - column * stride > cardWidth) return null;
  if (localY <= cardHeight) {
    if (column < CELL_COUNT) return { pile: 'cell', index: column };
    return { pile: 'foundation', index: column - CELL_COUNT };
  }
  if (localY >= cardHeight + rowGap) return { pile: 'tableau', index: column };
  return null;
}

export const FREECELL_DEAL_MAX = 32000;

export type FreecellState = {
  /** Microsoft FreeCell deal, from 1 through 32000. */
  deal: number;
  /** Four free cells. An empty string is an open cell. */
  cells: string[];
  /** Four foundation piles. The last card is the top. */
  foundations: string[][];
  /** Eight cascade piles. The last card is the top. All cards are face up. */
  tableau: string[][];
  moves: number;
  won: boolean;
  lastAction: string;
  /** Earlier layouts, newest last. Each entry is one move. */
  undo: string[];
};

const MS_SUITS: readonly Suit[] = ['C', 'D', 'H', 'S'];
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
  cells: string[];
  foundations: string[][];
  tableau: string[][];
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

/** Firestore cannot store an array of arrays, so piles are a map keyed by column. */
export type StoredFreecell = Omit<FreecellState, 'foundations' | 'tableau'> & {
  foundations: Record<string, string[]>;
  tableau: Record<string, string[]>;
};

export function packFreecell(state: FreecellState): StoredFreecell {
  return {
    deal: state.deal,
    cells: [...state.cells],
    foundations: packPiles(state.foundations),
    tableau: packPiles(state.tableau),
    moves: state.moves,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackFreecell(value: unknown): FreecellState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredFreecell> & Partial<FreecellState>;
  if (!validDeal(raw.deal)) return null;
  const foundations = unpackPiles(raw.foundations, FOUNDATION_COUNT);
  const tableau = unpackPiles(raw.tableau, CASCADE_COUNT);
  if (!foundations || !tableau) return null;
  if (!Array.isArray(raw.cells) || raw.cells.length !== CELL_COUNT) return null;
  if (raw.cells.some((card) => typeof card !== 'string')) return null;
  if (!Array.isArray(raw.undo) || raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') {
    return null;
  }
  return {
    deal: raw.deal,
    cells: [...raw.cells],
    foundations,
    tableau,
    moves: raw.moves,
    won: raw.won,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  };
}

export function foundationCount(state: FreecellState | null | undefined): number {
  if (!state) return 0;
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

export function validDeal(deal: unknown): deal is number {
  return typeof deal === 'number' && Number.isInteger(deal) && deal >= 1 && deal <= FREECELL_DEAL_MAX;
}

/** A numbered Microsoft deal, or a random one when `deal` is omitted. */
export function createFreecellState(deal?: number): FreecellState {
  return dealLayout(validDeal(deal) ? deal : randomDeal());
}

/** A layout for tests and repair. Cards are stored face up. `won` follows the foundations. */
export function layoutFreecell(input: {
  deal?: number;
  cells?: string[];
  foundations?: string[][];
  tableau?: string[][];
  moves?: number;
  lastAction?: string;
  undo?: string[];
}): FreecellState {
  const foundations = pad(input.foundations ?? [], FOUNDATION_COUNT).map((pile) => pile.map(faceUp));
  const tableau = pad(input.tableau ?? [], CASCADE_COUNT).map((pile) => pile.map(faceUp));
  const count = foundations.reduce((sum, pile) => sum + pile.length, 0);
  return {
    deal: validDeal(input.deal) ? input.deal : 1,
    cells: padCells(input.cells).map((cell) => (cell ? faceUp(cell) : '')),
    foundations,
    tableau,
    moves: input.moves ?? 0,
    won: count === 52,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  };
}

export function play(state: FreecellState, source: Source, dest: Dest): FreecellState | null {
  if (state.won) return null;
  if (source.pile === dest.pile && source.index === dest.index) return null;
  const run = runCards(state, source);
  if (!run) return null;

  if (dest.pile === 'cell') {
    if (run.length !== 1 || state.cells[dest.index]) return null;
  } else if (dest.pile === 'foundation') {
    if (run.length !== 1 || !fitsFoundation(run[0], state.foundations[dest.index] ?? [])) return null;
  } else {
    const target = state.tableau[dest.index] ?? [];
    if (!fitsTableau(run[0], target) || run.length > moveLimit(state, target.length === 0)) return null;
  }

  const cells = [...state.cells];
  const foundations = state.foundations.map((pile) => [...pile]);
  const tableau = state.tableau.map((pile) => [...pile]);

  if (source.pile === 'cell') cells[source.index] = '';
  else if (source.pile === 'foundation') foundations[source.index].pop();
  else tableau[source.index] = tableau[source.index].slice(0, source.at);

  if (dest.pile === 'cell') cells[dest.index] = faceUp(run[0]);
  else if (dest.pile === 'foundation') foundations[dest.index].push(faceUp(run[0]));
  else tableau[dest.index].push(...run.map(faceUp));

  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  const moved = cardFace(run[0]);
  const lastAction = won
    ? 'The layout is complete'
    : dest.pile === 'foundation'
      ? `Built the ${moved?.name ?? 'card'}`
      : dest.pile === 'cell'
        ? `Parked the ${moved?.name ?? 'card'}`
        : run.length > 1
          ? `Moved ${run.length} cards`
          : `Moved the ${moved?.name ?? 'card'}`;

  return step(state, { cells, foundations, tableau, moves: state.moves + 1, won, lastAction });
}

/** Move one top card onto its foundation. A second tap uses this. */
export function buildFoundation(state: FreecellState, source: Source): FreecellState | null {
  const run = runCards(state, source);
  if (!run || run.length !== 1) return null;
  for (let index = 0; index < FOUNDATION_COUNT; index++) {
    const next = play(state, source, { pile: 'foundation', index });
    if (next) return next;
  }
  return null;
}

export function destinations(state: FreecellState, source: Source): Dest[] {
  const found: Dest[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (play(state, source, { pile: 'cell', index })) found.push({ pile: 'cell', index });
  }
  for (let index = 0; index < FOUNDATION_COUNT; index++) {
    if (play(state, source, { pile: 'foundation', index })) found.push({ pile: 'foundation', index });
  }
  for (let index = 0; index < CASCADE_COUNT; index++) {
    if (play(state, source, { pile: 'tableau', index })) found.push({ pile: 'tableau', index });
  }
  return found;
}

export function canFinish(state: FreecellState): boolean {
  if (state.won || nextSafe(state) === null) return false;
  let current = state;
  let guard = 0;
  while (guard < 52) {
    guard += 1;
    const move = nextSafe(current);
    if (!move) return false;
    const next = play(current, move.source, move.dest);
    if (!next) return false;
    if (next.won) return true;
    current = next;
  }
  return false;
}

/** Move every card that can safely go home. One undo puts them back. */
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
    lastAction: current.won ? 'The layout is complete' : 'Built what can go up',
  };
}

export function undo(state: FreecellState): FreecellState | null {
  const raw = state.undo[state.undo.length - 1];
  if (!raw) return null;
  const snap = parseSnap(raw);
  if (!snap) return null;
  return {
    deal: state.deal,
    ...snap,
    undo: state.undo.slice(0, -1),
    lastAction: 'Undid the last move',
  };
}

export function hint(state: FreecellState): string | null {
  if (state.won) return null;
  for (const source of singleSources(state)) {
    const card = cardAt(state, source);
    if (!card || !safeHome(card, state.foundations)) continue;
    if (destinations(state, source).some((dest) => dest.pile === 'foundation')) {
      return `Build the ${cardFace(card)?.name ?? 'card'}`;
    }
  }
  for (let index = 0; index < CASCADE_COUNT; index++) {
    const pile = state.tableau[index] ?? [];
    for (let at = 1; at < pile.length; at++) {
      const source: Source = { pile: 'tableau', index, at };
      const onto = destinations(state, source).find(
        (dest) => dest.pile === 'tableau' && (state.tableau[dest.index]?.length ?? 0) > 0,
      );
      if (onto) return `Move the ${cardFace(pile[at])?.name ?? 'card'}`;
    }
  }
  for (let index = 0; index < CELL_COUNT; index++) {
    const card = state.cells[index];
    if (!card) continue;
    if (destinations(state, { pile: 'cell', index }).some((dest) => dest.pile === 'tableau')) {
      return `Play the ${cardFace(card)?.name ?? 'card'}`;
    }
  }
  for (let index = 0; index < CASCADE_COUNT; index++) {
    const pile = state.tableau[index] ?? [];
    if (pile.length < 2) continue;
    const source: Source = { pile: 'tableau', index, at: pile.length - 1 };
    if (destinations(state, source).some((dest) => dest.pile === 'cell')) {
      return `Park the ${cardFace(pile[pile.length - 1])?.name ?? 'card'}`;
    }
  }
  if (hasMove(state)) return 'A move is open';
  return 'No moves left';
}

export function hasMove(state: FreecellState): boolean {
  if (state.won) return false;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (state.cells[index] && destinations(state, { pile: 'cell', index }).length > 0) return true;
    const top = state.foundations[index]?.at(-1);
    if (top && destinations(state, { pile: 'foundation', index }).length > 0) return true;
  }
  for (let index = 0; index < CASCADE_COUNT; index++) {
    const pile = state.tableau[index] ?? [];
    for (let at = 0; at < pile.length; at++) {
      if (destinations(state, { pile: 'tableau', index, at }).length > 0) return true;
    }
  }
  return false;
}

export function ensureFreecellState(game: Game): Game {
  if (game.templateId !== 'freecell') return game;
  if (game.freecell && isHealthy(game.freecell)) return game;
  return { ...game, freecell: repairFreecell(game.freecell) };
}

function repairFreecell(raw: FreecellState | null | undefined): FreecellState {
  const parsed = raw ? parseState(raw) : null;
  if (parsed) return parsed;
  return createFreecellState(raw && validDeal(raw.deal) ? raw.deal : undefined);
}

function isHealthy(state: FreecellState): boolean {
  const parsed = parseState(state);
  return parsed !== null && sameState(parsed, state);
}

function dealLayout(deal: number): FreecellState {
  const dealt = microsoftCards(deal);
  const tableau: string[][] = Array.from({ length: CASCADE_COUNT }, () => []);
  for (let index = 0; index < dealt.length; index++) tableau[index % CASCADE_COUNT].push(dealt[index]);
  return {
    deal,
    cells: ['', '', '', ''],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    won: false,
    lastAction: 'New deal',
    undo: [],
  };
}

/**
 * Microsoft C runtime shuffle. Card 0 is the ace of clubs, then diamonds, hearts, and spades,
 * and the ranks run ace through king. Cards are dealt left to right, bottom to top.
 */
function microsoftCards(deal: number): string[] {
  const deck = Array.from({ length: 52 }, (_, index) => index);
  let state = deal;
  const dealt: string[] = [];
  for (let remaining = 52; remaining > 0; remaining--) {
    state = (state * 214013 + 2531011) % 0x80000000;
    const roll = Math.floor(state / 65536) & 0x7fff;
    const index = roll % remaining;
    const card = deck[index];
    deck[index] = deck[remaining - 1];
    const suit = MS_SUITS[card % 4];
    const rank = Math.floor(card / 4) + 1;
    dealt.push(cardCode(rank, suit, true));
  }
  return dealt;
}

function step(previous: FreecellState, next: Snap & { lastAction: string }): FreecellState {
  return {
    deal: previous.deal,
    cells: next.cells,
    foundations: next.foundations,
    tableau: next.tableau,
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
    tableau: state.tableau,
    moves: state.moves,
    won: state.won,
  });
}

/** (1 + empty free cells) × 2^(empty columns). The destination column is not spare space. */
function moveLimit(state: FreecellState, intoEmpty: boolean): number {
  const free = state.cells.filter((cell) => cell === '').length;
  let empty = state.tableau.filter((pile) => pile.length === 0).length;
  if (intoEmpty) empty = Math.max(0, empty - 1);
  return (1 + free) * 2 ** empty;
}

function nextSafe(state: FreecellState): { source: Source; dest: Dest } | null {
  for (const source of singleSources(state)) {
    const card = cardAt(state, source);
    if (!card || !safeHome(card, state.foundations)) continue;
    for (let index = 0; index < FOUNDATION_COUNT; index++) {
      if (fitsFoundation(card, state.foundations[index] ?? [])) {
        return { source, dest: { pile: 'foundation', index } };
      }
    }
  }
  return null;
}

/**
 * Safe to build once both opposite-color cards one rank lower are already home.
 * Nothing left can need this card as a landing place.
 */
function safeHome(code: string, foundations: string[][]): boolean {
  const face = cardFace(code);
  if (!face || !foundations.some((pile) => fitsFoundation(code, pile))) return false;
  if (face.rank === 1) return true;
  const opposite: Suit[] = face.red ? ['S', 'C'] : ['H', 'D'];
  return opposite.every((suit) => suitRank(foundations, suit) >= face.rank - 1);
}

function suitRank(foundations: string[][], suit: Suit): number {
  for (const pile of foundations) {
    const face = pile[0] ? cardFace(pile[0]) : null;
    if (face?.suit === suit) return pile.length;
  }
  return 0;
}

function singleSources(state: FreecellState): Source[] {
  const sources: Source[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (state.cells[index]) sources.push({ pile: 'cell', index });
  }
  for (let index = 0; index < CASCADE_COUNT; index++) {
    const pile = state.tableau[index] ?? [];
    if (pile.length > 0) sources.push({ pile: 'tableau', index, at: pile.length - 1 });
  }
  return sources;
}

function cardAt(state: FreecellState, source: Source): string {
  if (source.pile === 'cell') return state.cells[source.index] ?? '';
  if (source.pile === 'foundation') return state.foundations[source.index]?.at(-1) ?? '';
  return state.tableau[source.index]?.[source.at] ?? '';
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
  const pile = state.tableau[source.index];
  if (!pile || source.at < 0 || source.at >= pile.length) return null;
  const run = pile.slice(source.at);
  return legalRun(run) ? run : null;
}

function legalRun(run: string[]): boolean {
  if (run.length === 0) return false;
  let previous: CardFace | null = null;
  for (const code of run) {
    const face = cardFace(code);
    if (!face || !face.up) return false;
    if (previous && (face.red === previous.red || face.rank !== previous.rank - 1)) return false;
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

function fitsTableau(code: string, pile: readonly string[]): boolean {
  const face = cardFace(code);
  if (!face) return false;
  if (pile.length === 0) return true;
  const top = cardFace(pile[pile.length - 1]);
  return Boolean(top && top.red !== face.red && face.rank === top.rank - 1);
}

function parseState(raw: FreecellState): FreecellState | null {
  if (!validDeal(raw.deal)) return null;
  if (!Array.isArray(raw.cells) || raw.cells.length !== CELL_COUNT) return null;
  if (!Array.isArray(raw.foundations) || raw.foundations.length !== FOUNDATION_COUNT) return null;
  if (!Array.isArray(raw.tableau) || raw.tableau.length !== CASCADE_COUNT) return null;
  const cells: string[] = [];
  for (const item of raw.cells) {
    if (item === '') {
      cells.push('');
      continue;
    }
    if (typeof item !== 'string' || !CARD_RE.test(item)) return null;
    cells.push(faceUp(item));
  }
  const foundations: string[][] = [];
  for (const pile of raw.foundations) {
    const clean = cleanPile(pile);
    if (!clean || !validFoundation(clean)) return null;
    foundations.push(clean);
  }
  const tableau: string[][] = [];
  for (const pile of raw.tableau) {
    const clean = cleanPile(pile);
    if (!clean) return null;
    tableau.push(clean);
  }
  const seen = new Set<string>();
  for (const code of [...cells, ...foundations.flat(), ...tableau.flat()]) {
    if (!code) continue;
    const face = cardFace(code);
    if (!face) return null;
    const id = `${face.rank}${face.suit}`;
    if (seen.has(id)) return null;
    seen.add(id);
  }
  if (seen.size !== 52) return null;
  if (!Number.isInteger(raw.moves) || raw.moves < 0 || raw.moves > 100000) return null;
  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  if (raw.won !== won) return null;
  if (typeof raw.lastAction !== 'string' || raw.lastAction.length > 120) return null;
  if (!Array.isArray(raw.undo) || raw.undo.length > UNDO_LIMIT) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string' || entry.length > 8000)) return null;
  return {
    deal: raw.deal,
    cells,
    foundations,
    tableau,
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
  if (!Array.isArray(snap.cells) || snap.cells.length !== CELL_COUNT) return null;
  if (!Array.isArray(snap.foundations) || snap.foundations.length !== FOUNDATION_COUNT) return null;
  if (!Array.isArray(snap.tableau) || snap.tableau.length !== CASCADE_COUNT) return null;
  const cells: string[] = [];
  for (const item of snap.cells) {
    if (item === '') {
      cells.push('');
      continue;
    }
    if (typeof item !== 'string' || !CARD_RE.test(item)) return null;
    cells.push(faceUp(item));
  }
  const foundations: string[][] = [];
  for (const pile of snap.foundations) {
    const clean = cleanPile(pile as string[]);
    if (!clean) return null;
    foundations.push(clean);
  }
  const tableau: string[][] = [];
  for (const pile of snap.tableau) {
    const clean = cleanPile(pile as string[]);
    if (!clean) return null;
    tableau.push(clean);
  }
  if (!Number.isInteger(snap.moves) || snap.moves == null || snap.moves < 0) return null;
  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  return { cells, foundations, tableau, moves: snap.moves, won };
}

function cleanPile(pile: unknown): string[] | null {
  if (!Array.isArray(pile)) return null;
  const next: string[] = [];
  for (const item of pile) {
    if (typeof item !== 'string' || !CARD_RE.test(item)) return null;
    next.push(faceUp(item));
  }
  return next;
}

function validFoundation(pile: string[]): boolean {
  let expected = 1;
  let suit: Suit | null = null;
  for (const code of pile) {
    const face = cardFace(code);
    if (!face || face.rank !== expected) return false;
    if (suit && face.suit !== suit) return false;
    suit = face.suit;
    expected += 1;
  }
  return true;
}

function sameState(a: FreecellState, b: FreecellState): boolean {
  return (
    a.deal === b.deal &&
    a.moves === b.moves &&
    a.won === b.won &&
    a.lastAction === b.lastAction &&
    sameList(a.cells, b.cells) &&
    sameList(a.undo, b.undo) &&
    a.foundations.every((pile, index) => sameList(pile, b.foundations[index] ?? [])) &&
    a.tableau.every((pile, index) => sameList(pile, b.tableau[index] ?? []))
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function packPiles(piles: string[][]): Record<string, string[]> {
  return Object.fromEntries(piles.map((pile, index) => [String(index), [...pile]]));
}

function unpackPiles(value: unknown, count: number): string[][] | null {
  if (Array.isArray(value)) {
    if (value.length !== count || value.some((pile) => !Array.isArray(pile))) return null;
    return value.map((pile) => [...(pile as string[])]);
  }
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

function padCells(cells: string[] | undefined): string[] {
  return Array.from({ length: CELL_COUNT }, (_, index) => cells?.[index] ?? '');
}

function randomDeal(): number {
  return randomInt(FREECELL_DEAL_MAX) + 1;
}

function randomInt(maxExclusive: number): number {
  const max = 0x100000000;
  const limit = max - (max % maxExclusive);
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function faceUp(code: string): string {
  return `${code[0].toUpperCase()}${code[1].toUpperCase()}`;
}
