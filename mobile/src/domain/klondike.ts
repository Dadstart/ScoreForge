import type { Game } from './models';

/**
 * Klondike solitaire.
 * Tableau builds down in alternating colors. Foundations build up by suit from the ace.
 * The stock deals one or three cards. An empty column takes a king.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type DrawCount = 1 | 3;

export type Source =
  | { pile: 'waste' }
  | { pile: 'foundation'; index: number }
  | { pile: 'tableau'; index: number; at: number };

export type Dest = { pile: 'foundation'; index: number } | { pile: 'tableau'; index: number };

/**
 * Pile under a point in the board's own coordinates.
 * The top row is stock, waste, a gap, then four foundations. The row below is seven columns.
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
  if (column < 0 || column > 6) return null;
  if (localX - column * stride > cardWidth) return null;
  if (localY <= cardHeight) {
    if (column < 3) return null;
    return { pile: 'foundation', index: column - 3 };
  }
  if (localY >= cardHeight + rowGap) return { pile: 'tableau', index: column };
  return null;
}

export type KlondikeState = {
  drawCount: DrawCount;
  /** Face-down stock. The last card is the top. */
  stock: string[];
  /** Face-up waste. The last card is the top. */
  waste: string[];
  /** Four foundation piles. The last card is the top. */
  foundations: string[][];
  /** Seven tableau piles. The last card is the top. */
  tableau: string[][];
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
  foundations: string[][];
  tableau: string[][];
  moves: number;
  won: boolean;
};

/** Two characters. The suit's case is the face: `AS` is up, `As` is down. Rank digits have no case. */
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
export type StoredKlondike = Omit<KlondikeState, 'foundations' | 'tableau'> & {
  foundations: Record<string, string[]>;
  tableau: Record<string, string[]>;
};

export function packKlondike(state: KlondikeState): StoredKlondike {
  return {
    drawCount: state.drawCount,
    stock: state.stock,
    waste: state.waste,
    foundations: packPiles(state.foundations),
    tableau: packPiles(state.tableau),
    moves: state.moves,
    won: state.won,
    lastAction: state.lastAction,
    undo: state.undo,
  };
}

export function unpackKlondike(value: unknown): KlondikeState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StoredKlondike> & Partial<KlondikeState>;
  if (raw.drawCount !== 1 && raw.drawCount !== 3) return null;
  const foundations = unpackPiles(raw.foundations, 4);
  const tableau = unpackPiles(raw.tableau, 7);
  if (!foundations || !tableau) return null;
  if (!Array.isArray(raw.stock) || !Array.isArray(raw.waste) || !Array.isArray(raw.undo)) return null;
  if (raw.stock.some((card) => typeof card !== 'string')) return null;
  if (raw.waste.some((card) => typeof card !== 'string')) return null;
  if (raw.undo.some((entry) => typeof entry !== 'string')) return null;
  if (typeof raw.moves !== 'number' || typeof raw.won !== 'boolean' || typeof raw.lastAction !== 'string') return null;
  return {
    drawCount: raw.drawCount,
    stock: [...raw.stock],
    waste: [...raw.waste],
    foundations,
    tableau,
    moves: raw.moves,
    won: raw.won,
    lastAction: raw.lastAction,
    undo: [...raw.undo],
  };
}

export function foundationCount(state: KlondikeState | null | undefined): number {
  if (!state) return 0;
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

export function createKlondikeState(drawCount: DrawCount = 1, deck?: readonly string[]): KlondikeState {
  const cards = deck ? deck.map((code) => faceDown(code)) : shuffle(freshDeck());
  return deal(drawCount === 3 ? 3 : 1, cards);
}

/** A layout for tests and repair. `won` follows the foundations. */
export function layoutKlondike(input: {
  drawCount?: DrawCount;
  stock?: string[];
  waste?: string[];
  foundations?: string[][];
  tableau?: string[][];
  moves?: number;
  lastAction?: string;
  undo?: string[];
}): KlondikeState {
  const foundations = pad(input.foundations ?? [], 4);
  const tableau = pad(input.tableau ?? [], 7);
  const count = foundations.reduce((sum, pile) => sum + pile.length, 0);
  return {
    drawCount: input.drawCount === 3 ? 3 : 1,
    stock: [...(input.stock ?? [])],
    waste: [...(input.waste ?? [])],
    foundations,
    tableau,
    moves: input.moves ?? 0,
    won: count === 52,
    lastAction: input.lastAction ?? '',
    undo: [...(input.undo ?? [])],
  };
}

export function drawStock(state: KlondikeState): KlondikeState | null {
  if (state.won) return null;
  if (state.stock.length > 0) {
    const count = Math.min(state.drawCount, state.stock.length);
    const stock = state.stock.slice(0, -count);
    const drawn = state.stock.slice(-count).reverse().map(faceUp);
    const waste = [...state.waste, ...drawn];
    return step(state, {
      stock,
      waste,
      foundations: state.foundations,
      tableau: state.tableau,
      moves: state.moves + 1,
      won: false,
      lastAction: count === 1 ? 'Drew a card' : `Drew ${count}`,
    });
  }
  if (state.waste.length === 0) return null;
  const stock = [...state.waste].reverse().map(faceDown);
  return step(state, {
    stock,
    waste: [],
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves + 1,
    won: false,
    lastAction: 'Turned the waste over',
  });
}

export function play(state: KlondikeState, source: Source, dest: Dest): KlondikeState | null {
  if (state.won) return null;
  if (samePile(source, dest)) return null;
  const run = runCards(state, source);
  if (!run) return null;
  if (dest.pile === 'foundation') {
    if (run.length !== 1) return null;
    if (!fitsFoundation(run[0], state.foundations[dest.index] ?? [])) return null;
  } else if (!fitsTableau(run[0], state.tableau[dest.index] ?? [])) {
    return null;
  }

  const stock = [...state.stock];
  const waste = [...state.waste];
  const foundations = state.foundations.map((pile) => [...pile]);
  const tableau = state.tableau.map((pile) => [...pile]);

  if (source.pile === 'waste') waste.pop();
  else if (source.pile === 'foundation') foundations[source.index].pop();
  else tableau[source.index] = tableau[source.index].slice(0, source.at);

  if (dest.pile === 'foundation') foundations[dest.index].push(faceUp(run[0]));
  else tableau[dest.index].push(...run.map(faceUp));

  if (source.pile === 'tableau') {
    const pile = tableau[source.index];
    const top = pile[pile.length - 1];
    if (top && !isUp(top)) pile[pile.length - 1] = faceUp(top);
  }

  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  const moved = cardFace(run[0]);
  const lastAction = won
    ? 'The layout is complete'
    : dest.pile === 'foundation'
      ? `Built the ${moved?.name ?? 'card'}`
      : run.length > 1
        ? `Moved ${run.length} cards`
        : `Moved the ${moved?.name ?? 'card'}`;

  return step(state, {
    stock,
    waste,
    foundations,
    tableau,
    moves: state.moves + 1,
    won,
    lastAction,
  });
}

/** Move one top card onto its foundation. A second tap uses this. */
export function buildFoundation(state: KlondikeState, source: Source): KlondikeState | null {
  const run = runCards(state, source);
  if (!run || run.length !== 1) return null;
  for (let index = 0; index < 4; index++) {
    const next = play(state, source, { pile: 'foundation', index });
    if (next) return next;
  }
  return null;
}

export function destinations(state: KlondikeState, source: Source): Dest[] {
  const found: Dest[] = [];
  for (let index = 0; index < 4; index++) {
    if (play(state, source, { pile: 'foundation', index })) found.push({ pile: 'foundation', index });
  }
  for (let index = 0; index < 7; index++) {
    if (play(state, source, { pile: 'tableau', index })) found.push({ pile: 'tableau', index });
  }
  return found;
}

export function canFinish(state: KlondikeState): boolean {
  if (state.won || state.stock.length > 0) return false;
  if (state.tableau.some((pile) => pile.some((card) => !isUp(card)))) return false;
  return nextFoundation(state) !== null;
}

/** Move every available card onto the foundations. One undo puts them back. */
export function finish(state: KlondikeState): KlondikeState | null {
  if (!canFinish(state)) return null;
  let current = state;
  let guard = 0;
  while (guard < 52) {
    guard += 1;
    const move = nextFoundation(current);
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

export function undo(state: KlondikeState): KlondikeState | null {
  const raw = state.undo[state.undo.length - 1];
  if (!raw) return null;
  const snap = parseSnap(raw);
  if (!snap) return null;
  return {
    drawCount: state.drawCount,
    ...snap,
    undo: state.undo.slice(0, -1),
    lastAction: 'Undid the last move',
  };
}

export function hint(state: KlondikeState): string | null {
  if (state.won) return null;
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    const source: Source = { pile: 'waste' };
    if (destinations(state, source).some((dest) => dest.pile === 'foundation')) {
      return `Build the ${cardFace(wasteTop)?.name ?? 'waste card'}`;
    }
  }
  for (let index = 0; index < 7; index++) {
    const pile = state.tableau[index] ?? [];
    const top = pile[pile.length - 1];
    if (!top) continue;
    const source: Source = { pile: 'tableau', index, at: pile.length - 1 };
    if (destinations(state, source).some((dest) => dest.pile === 'foundation')) {
      return `Build the ${cardFace(top)?.name ?? 'card'}`;
    }
  }
  if (wasteTop) {
    const source: Source = { pile: 'waste' };
    if (destinations(state, source).some((dest) => dest.pile === 'tableau')) {
      return `Play the ${cardFace(wasteTop)?.name ?? 'waste card'}`;
    }
  }
  for (let index = 0; index < 7; index++) {
    const pile = state.tableau[index] ?? [];
    for (let at = 0; at < pile.length; at++) {
      if (at === 0 && pile.length > 0 && cardFace(pile[0])?.rank === 13) continue;
      const source: Source = { pile: 'tableau', index, at };
      const elsewhere = destinations(state, source).find(
        (dest) => dest.pile === 'tableau' && dest.index !== index,
      );
      if (elsewhere) {
        const face = cardFace(pile[at]);
        return face ? `Move the ${face.name}` : 'Move a column';
      }
    }
  }
  if (state.stock.length > 0) return 'Draw from the stock';
  if (state.waste.length > 0) return 'Turn the waste over';
  return 'No moves left';
}

export function hasMove(state: KlondikeState): boolean {
  if (state.won) return false;
  if (state.stock.length > 0 || state.waste.length > 0) return true;
  for (let index = 0; index < 7; index++) {
    const pile = state.tableau[index] ?? [];
    for (let at = 0; at < pile.length; at++) {
      if (destinations(state, { pile: 'tableau', index, at }).length > 0) return true;
    }
  }
  return false;
}

export function ensureKlondikeState(game: Game): Game {
  if (game.templateId !== 'klondike') return game;
  if (game.klondike && isHealthy(game.klondike)) return game;
  const drawCount = game.klondike?.drawCount === 3 ? 3 : 1;
  return { ...game, klondike: repairKlondike(game.klondike, drawCount) };
}

function repairKlondike(raw: KlondikeState | null | undefined, drawCount: DrawCount): KlondikeState {
  const parsed = raw ? parseState(raw) : null;
  return parsed ?? createKlondikeState(drawCount);
}

function isHealthy(state: KlondikeState): boolean {
  const parsed = parseState(state);
  return parsed !== null && sameState(parsed, state);
}

function deal(drawCount: DrawCount, deck: string[]): KlondikeState {
  const tableau: string[][] = Array.from({ length: 7 }, () => []);
  let cursor = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = row; col < 7; col++) {
      const card = deck[cursor];
      cursor += 1;
      if (!card) continue;
      tableau[col].push(col === row ? faceUp(card) : faceDown(card));
    }
  }
  const stock = deck
    .slice(cursor)
    .reverse()
    .map((card) => faceDown(card));
  return {
    drawCount,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    won: false,
    lastAction: 'New deal',
    undo: [],
  };
}

function step(previous: KlondikeState, next: Snap & { lastAction: string }): KlondikeState {
  return {
    drawCount: previous.drawCount,
    stock: next.stock,
    waste: next.waste,
    foundations: next.foundations,
    tableau: next.tableau,
    moves: next.moves,
    won: next.won,
    lastAction: next.lastAction,
    undo: remember(previous),
  };
}

function remember(state: KlondikeState): string[] {
  return [...state.undo, encode(state)].slice(-UNDO_LIMIT);
}

function encode(state: KlondikeState): string {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves,
    won: state.won,
  });
}

function nextFoundation(state: KlondikeState): { source: Source; dest: Dest } | null {
  const waste = state.waste[state.waste.length - 1];
  if (waste) {
    const source: Source = { pile: 'waste' };
    for (let index = 0; index < 4; index++) {
      const dest: Dest = { pile: 'foundation', index };
      if (fitsFoundation(waste, state.foundations[index] ?? [])) return { source, dest };
    }
  }
  for (let column = 0; column < 7; column++) {
    const pile = state.tableau[column] ?? [];
    const top = pile[pile.length - 1];
    if (!top || !isUp(top)) continue;
    const source: Source = { pile: 'tableau', index: column, at: pile.length - 1 };
    for (let index = 0; index < 4; index++) {
      if (fitsFoundation(top, state.foundations[index] ?? [])) {
        return { source, dest: { pile: 'foundation', index } };
      }
    }
  }
  return null;
}

function runCards(state: KlondikeState, source: Source): string[] | null {
  if (source.pile === 'waste') {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : null;
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
  if (pile.length === 0) return face.rank === 13;
  const top = cardFace(pile[pile.length - 1]);
  return Boolean(top && top.up && top.red !== face.red && face.rank === top.rank - 1);
}

function samePile(source: Source, dest: Dest): boolean {
  if (source.pile === 'waste' || source.pile !== dest.pile) return false;
  return source.index === dest.index;
}

function parseState(raw: KlondikeState): KlondikeState | null {
  if (raw.drawCount !== 1 && raw.drawCount !== 3) return null;
  if (!Array.isArray(raw.foundations) || raw.foundations.length !== 4) return null;
  if (!Array.isArray(raw.tableau) || raw.tableau.length !== 7) return null;
  const stock = cleanPile(raw.stock, false);
  const waste = cleanPile(raw.waste, true);
  if (!stock || !waste) return null;
  const foundations: string[][] = [];
  for (const pile of raw.foundations) {
    const clean = cleanPile(pile, true);
    if (!clean || !validFoundation(clean)) return null;
    foundations.push(clean);
  }
  const tableau: string[][] = [];
  for (const pile of raw.tableau) {
    const clean = cleanTableau(pile);
    if (!clean) return null;
    tableau.push(clean);
  }
  const seen = new Set<string>();
  for (const code of [...stock, ...waste, ...foundations.flat(), ...tableau.flat()]) {
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
    drawCount: raw.drawCount,
    stock,
    waste,
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
  if (!Array.isArray(snap.stock) || !Array.isArray(snap.waste)) return null;
  if (!Array.isArray(snap.foundations) || snap.foundations.length !== 4) return null;
  if (!Array.isArray(snap.tableau) || snap.tableau.length !== 7) return null;
  const stock = cleanPile(snap.stock, false);
  const waste = cleanPile(snap.waste, true);
  if (!stock || !waste) return null;
  const foundations: string[][] = [];
  for (const pile of snap.foundations) {
    const clean = cleanPile(pile as string[], true);
    if (!clean) return null;
    foundations.push(clean);
  }
  const tableau: string[][] = [];
  for (const pile of snap.tableau) {
    const clean = cleanTableau(pile as string[]);
    if (!clean) return null;
    tableau.push(clean);
  }
  if (!Number.isInteger(snap.moves) || snap.moves == null || snap.moves < 0) return null;
  const won = foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  return { stock, waste, foundations, tableau, moves: snap.moves, won };
}

function cleanPile(pile: unknown, up: boolean): string[] | null {
  if (!Array.isArray(pile)) return null;
  const next: string[] = [];
  for (const item of pile) {
    if (typeof item !== 'string' || !CARD_RE.test(item)) return null;
    next.push(up ? faceUp(item) : faceDown(item));
  }
  return next;
}

function cleanTableau(pile: unknown): string[] | null {
  if (!Array.isArray(pile)) return null;
  const faces: CardFace[] = [];
  for (const item of pile) {
    if (typeof item !== 'string') return null;
    const face = cardFace(item);
    if (!face) return null;
    faces.push(face);
  }
  const upAt = faces.findIndex((face) => face.up);
  if (faces.length > 0 && upAt < 0) return null;
  if (upAt >= 0 && faces.slice(upAt).some((face) => !face.up)) return null;
  const run = faces.slice(Math.max(upAt, 0));
  if (run.length > 0 && !legalRun(run.map((face) => face.code))) return null;
  return faces.map((face, index) => (upAt >= 0 && index >= upAt ? faceUp(face.code) : faceDown(face.code)));
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

function sameState(a: KlondikeState, b: KlondikeState): boolean {
  return (
    a.drawCount === b.drawCount &&
    a.moves === b.moves &&
    a.won === b.won &&
    a.lastAction === b.lastAction &&
    sameList(a.stock, b.stock) &&
    sameList(a.waste, b.waste) &&
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
    crypto.getRandomValues(buf);
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
