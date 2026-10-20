import type { Game, Player } from './models';
import { fillRandom } from './secureRandom';

/**
 * Skip-Beaux is a sequencing card game for one to six players.
 *
 * Build shared piles from 1 to 12. A Beaux card stands in for any number.
 * Empty your stock pile. The first player to do that wins.
 */
export const HAND_SIZE = 5;
export const PILE_SLOTS = 4;

const CARD_RE = /^(?:(?:[1-9]|1[0-2])#(?:[1-9]|1[0-2])|B#(?:[1-9]|1[0-8]))$/;

export type Pile = { cards: string[] };

export type SkipBeauxPhase = 'waiting' | 'play' | 'handOver' | 'gameOver';

export type CardSource =
  | { zone: 'hand'; card: string }
  | { zone: 'stock' }
  | { zone: 'discard'; index: number };

export type SkipBeauxScore = { playerId: string; points: number };

export type SkipBeauxState = {
  order: string[];
  hands: Record<string, string[]>;
  /** Face down, except the last card, which is the face-up top. */
  stocks: Record<string, string[]>;
  /** Four personal piles. The last card is the top. */
  discards: Record<string, Pile[]>;
  /** Four shared piles. An empty pile is waiting for a 1. */
  buildings: Pile[];
  draw: string[];
  /** Finished 1–12 piles, shuffled back in when the draw pile runs out. */
  completed: string[];
  dealer: number;
  turn: string | null;
  phase: SkipBeauxPhase;
  handNumber: number;
  totals: Record<string, number>;
  lastAction: string | null;
  lastScores: SkipBeauxScore[] | null;
  wentOut: string | null;
};

type Named = { id: string; name: string };
export type SkipBeauxResult = { state: SkipBeauxState } | { error: string };

export function stockSize(playerCount: number): number {
  return playerCount >= 5 ? 20 : 30;
}

export function freshDeck(): string[] {
  const cards: string[] = [];
  for (let rank = 1; rank <= 12; rank += 1) {
    for (let copy = 1; copy <= 12; copy += 1) cards.push(`${rank}#${copy}`);
  }
  for (let copy = 1; copy <= 18; copy += 1) cards.push(`B#${copy}`);
  return cards;
}

export function isCard(code: string): boolean {
  return CARD_RE.test(code);
}

export function isBeaux(code: string): boolean {
  return code.startsWith('B#');
}

export function rankOf(code: string): number | null {
  if (isBeaux(code)) return null;
  const rank = Number(code.split('#')[0]);
  return rank >= 1 && rank <= 12 ? rank : null;
}

export function cardLabel(code: string): string {
  if (isBeaux(code)) return 'Wild';
  return String(rankOf(code) ?? '');
}

export function topOf(cards: readonly string[]): string | null {
  return cards.length > 0 ? (cards[cards.length - 1] ?? null) : null;
}

/** The next number a building pile will accept. An empty pile needs a 1. */
export function neededRank(pile: Pile): number | null {
  if (pile.cards.length >= 12) return null;
  return pile.cards.length + 1;
}

export function canBuild(card: string, pile: Pile): boolean {
  const needed = neededRank(pile);
  if (needed == null || !isCard(card)) return false;
  if (isBeaux(card)) return true;
  return rankOf(card) === needed;
}

export function scoreForPlayer(_state: SkipBeauxState, _playerId: string): number {
  return 0;
}

export function winnerIds(state: SkipBeauxState): string[] {
  if (state.phase !== 'gameOver' || !state.wentOut) return [];
  return [state.wentOut];
}

export function createSkipBeauxState(
  players: { id: string }[],
  options?: { deck?: readonly string[]; waiting?: boolean },
): SkipBeauxState {
  const ids = players.slice(0, 6).map((player) => player.id);
  if (ids.length < 1 || options?.waiting) return waitingState();
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  return deal(ids, totals, Math.max(0, ids.length - 1), 1, options?.deck ? [...options.deck] : shuffle(freshDeck()));
}

export function dealGame(players: readonly { id: string }[]): SkipBeauxResult {
  if (players.length < 1) return fail('Add a player before dealing.');
  if (players.length > 6) return fail('Skip-Beaux seats up to 6 players.');
  return { state: createSkipBeauxState([...players]) };
}

export function playBuilding(
  state: SkipBeauxState,
  playerId: string,
  source: CardSource,
  buildingIndex: number,
  players: readonly Named[],
): SkipBeauxResult {
  if (state.phase !== 'play' || state.turn !== playerId) return fail('Wait for your turn.');
  const building = state.buildings[buildingIndex];
  if (!building) return fail('That building pile is not on the table.');
  const peeked = peek(state, playerId, source);
  if (typeof peeked !== 'string') return peeked;
  if (!canBuild(peeked, building)) {
    const needed = neededRank(building);
    if (needed === 1) return fail('Play a 1 or a Wild to start a pile.');
    return fail(`That pile needs a ${needed} or a Wild.`);
  }
  const removed = removeCard(clone(state), playerId, source);
  if ('error' in removed) return removed;
  const next = removed.state;
  const pile = next.buildings[buildingIndex];
  if (!pile) return fail('That building pile is not on the table.');
  pile.cards = [...pile.cards, peeked];
  if (pile.cards.length >= 12) {
    next.completed = [...next.completed, ...pile.cards];
    pile.cards = [];
  }
  const who = nameOf(players, playerId);
  if (source.zone === 'stock' && (next.stocks[playerId] ?? []).length === 0) {
    return { state: closeHand(next, playerId, players) };
  }
  const refilled = (next.hands[playerId] ?? []).length === 0 ? fillHand(next, playerId) : next;
  refilled.lastAction = `${who} plays ${cardLabel(peeked)}.`;
  return { state: refilled };
}

export function discardCard(
  state: SkipBeauxState,
  playerId: string,
  card: string,
  pileIndex: number,
  players: readonly Named[],
): SkipBeauxResult {
  if (state.phase !== 'play' || state.turn !== playerId) return fail('Wait for your turn.');
  if (pileIndex < 0 || pileIndex >= PILE_SLOTS) return fail('Choose one of your four discard piles.');
  const hand = state.hands[playerId] ?? [];
  if (!hand.includes(card)) return fail('Discard a card from your hand.');
  const next = clone(state);
  next.hands = { ...next.hands, [playerId]: hand.filter((item) => item !== card) };
  const piles = next.discards[playerId] ?? emptyPiles(PILE_SLOTS);
  const pile = piles[pileIndex];
  if (!pile) return fail('Choose one of your four discard piles.');
  pile.cards = [...pile.cards, card];
  next.discards = { ...next.discards, [playerId]: piles };
  return { state: passToNext(next, playerId, players, `${nameOf(players, playerId)} discards ${cardLabel(card)}.`) };
}

export function endTurn(state: SkipBeauxState, playerId: string, players: readonly Named[]): SkipBeauxResult {
  if (state.phase !== 'play' || state.turn !== playerId) return fail('Wait for your turn.');
  if ((state.hands[playerId] ?? []).length > 0) return fail('Discard a card from your hand to end the turn.');
  return { state: passToNext(clone(state), playerId, players, `${nameOf(players, playerId)} ends the turn.`) };
}

export function dealNext(state: SkipBeauxState, players: readonly { id: string }[]): SkipBeauxResult {
  if (state.phase !== 'handOver') return fail('The hand is still going.');
  const ids = players.slice(0, 6).map((player) => player.id);
  if (ids.length < 1) return fail('Add a player before dealing.');
  const totals: Record<string, number> = {};
  for (const id of ids) totals[id] = state.totals[id] ?? 0;
  const dealer = (state.dealer + 1) % ids.length;
  return { state: deal(ids, totals, dealer, state.handNumber + 1, shuffle(freshDeck())) };
}

export function ensureSkipBeauxState(game: Game): Game {
  if (game.templateId !== 'skip-beaux') return game;
  if (game.skipBeaux && validState(game.skipBeaux, game.players)) return game;
  return { ...game, skipBeaux: repair(game) };
}

function passToNext(state: SkipBeauxState, playerId: string, players: readonly Named[], action: string): SkipBeauxState {
  const nextId = step(state, playerId);
  const passed = { ...state, turn: nextId, lastAction: action };
  return fillHand(passed, nextId);
}

function closeHand(state: SkipBeauxState, winnerId: string, players: readonly Named[]): SkipBeauxState {
  const who = nameOf(players, winnerId);
  return {
    ...state,
    phase: 'gameOver',
    turn: null,
    wentOut: winnerId,
    lastScores: null,
    lastAction: `${who} empties the stock and wins.`,
  };
}

function deal(
  ids: string[],
  totals: Record<string, number>,
  dealer: number,
  handNumber: number,
  deck: string[],
): SkipBeauxState {
  const size = stockSize(ids.length);
  const hands: Record<string, string[]> = {};
  const stocks: Record<string, string[]> = {};
  const discards: Record<string, Pile[]> = {};
  const scored: Record<string, number> = {};
  let cursor = 0;
  for (const id of ids) {
    stocks[id] = deck.slice(cursor, cursor + size);
    cursor += size;
    hands[id] = [];
    discards[id] = emptyPiles(PILE_SLOTS);
    scored[id] = totals[id] ?? 0;
  }
  const first = ids[(dealer + 1) % ids.length] ?? ids[0] ?? '';
  const state: SkipBeauxState = {
    order: ids,
    hands,
    stocks,
    discards,
    buildings: emptyPiles(PILE_SLOTS),
    draw: deck.slice(cursor),
    completed: [],
    dealer,
    turn: first,
    phase: 'play',
    handNumber,
    totals: scored,
    lastAction: handNumber === 1 ? 'The stock piles are dealt. Build from 1 to 12.' : 'A new hand is dealt.',
    lastScores: null,
    wentOut: null,
  };
  return first ? fillHand(state, first) : state;
}

function fillHand(state: SkipBeauxState, playerId: string): SkipBeauxState {
  let draw = state.draw;
  let completed = state.completed;
  let hand = [...(state.hands[playerId] ?? [])];
  while (hand.length < HAND_SIZE) {
    const pulled = drawOne(draw, completed);
    draw = pulled.draw;
    completed = pulled.completed;
    if (!pulled.card) break;
    hand = [...hand, pulled.card];
  }
  return {
    ...state,
    draw,
    completed,
    hands: { ...state.hands, [playerId]: hand },
  };
}

function drawOne(draw: string[], completed: string[]): { card: string | null; draw: string[]; completed: string[] } {
  let deck = draw;
  let done = completed;
  if (deck.length === 0) {
    if (done.length === 0) return { card: null, draw, completed };
    deck = shuffle(done);
    done = [];
  }
  const card = deck[0] ?? null;
  if (!card) return { card: null, draw: [], completed: done };
  return { card, draw: deck.slice(1), completed: done };
}

function peek(state: SkipBeauxState, playerId: string, source: CardSource): string | SkipBeauxResult {
  if (source.zone === 'hand') {
    if (!(state.hands[playerId] ?? []).includes(source.card)) return fail('That card is not in your hand.');
    return source.card;
  }
  if (source.zone === 'stock') {
    const top = topOf(state.stocks[playerId] ?? []);
    if (!top) return fail('Your stock pile is empty.');
    return top;
  }
  const top = topOf(state.discards[playerId]?.[source.index]?.cards ?? []);
  if (!top) return fail('That discard pile is empty.');
  return top;
}

function removeCard(state: SkipBeauxState, playerId: string, source: CardSource): { state: SkipBeauxState } | SkipBeauxResult {
  if (source.zone === 'hand') {
    const hand = state.hands[playerId] ?? [];
    if (!hand.includes(source.card)) return fail('That card is not in your hand.');
    state.hands = { ...state.hands, [playerId]: hand.filter((item) => item !== source.card) };
    return { state };
  }
  if (source.zone === 'stock') {
    const stock = [...(state.stocks[playerId] ?? [])];
    if (stock.length === 0) return fail('Your stock pile is empty.');
    stock.pop();
    state.stocks = { ...state.stocks, [playerId]: stock };
    return { state };
  }
  const piles = (state.discards[playerId] ?? emptyPiles(PILE_SLOTS)).map((pile) => ({ cards: [...pile.cards] }));
  const pile = piles[source.index];
  if (!pile || pile.cards.length === 0) return fail('That discard pile is empty.');
  pile.cards.pop();
  state.discards = { ...state.discards, [playerId]: piles };
  return { state };
}

function repair(game: Game): SkipBeauxState {
  const ids = game.players.slice(0, 6).map((player) => player.id);
  const previous = game.skipBeaux;
  if (ids.length < 1 || previous?.phase === 'waiting') return waitingState();
  const totals: Record<string, number> = {};
  for (const id of ids) totals[id] = previous?.totals[id] ?? 0;
  return deal(ids, totals, Math.max(0, ids.length - 1), Math.max(1, previous?.handNumber || 1), shuffle(freshDeck()));
}

function validState(state: SkipBeauxState, players: Player[]): boolean {
  if (state.phase === 'waiting') return state.turn == null;
  const ids = players.slice(0, 6).map((player) => player.id);
  if (state.order.length < 1 || state.order.length > 6) return false;
  if (ids.length < state.order.length || state.order.some((id, index) => ids[index] !== id)) return false;
  if (state.buildings.length !== PILE_SLOTS) return false;
  if (state.phase === 'play' && (state.turn == null || !state.order.includes(state.turn))) return false;
  if ((state.phase === 'handOver' || state.phase === 'gameOver') && state.turn != null) return false;
  for (const id of state.order) {
    if ((state.discards[id]?.length ?? 0) !== PILE_SLOTS) return false;
  }
  return countsFit(state);
}

function countsFit(state: SkipBeauxState): boolean {
  const counts = new Map<string, number>();
  const add = (cards: readonly string[]) => {
    for (const card of cards) {
      if (!isCard(card)) return false;
      counts.set(card, (counts.get(card) ?? 0) + 1);
    }
    return true;
  };
  if (!add(state.draw) || !add(state.completed)) return false;
  for (const pile of state.buildings) if (!add(pile.cards)) return false;
  for (const id of state.order) {
    if (!add(state.hands[id] ?? []) || !add(state.stocks[id] ?? [])) return false;
    for (const pile of state.discards[id] ?? []) if (!add(pile.cards)) return false;
  }
  if (counts.size !== 162) return false;
  for (const count of counts.values()) if (count !== 1) return false;
  return true;
}

function waitingState(): SkipBeauxState {
  return {
    order: [],
    hands: {},
    stocks: {},
    discards: {},
    buildings: emptyPiles(PILE_SLOTS),
    draw: [],
    completed: [],
    dealer: 0,
    turn: null,
    phase: 'waiting',
    handNumber: 0,
    totals: {},
    lastAction: 'Waiting to deal.',
    lastScores: null,
    wentOut: null,
  };
}

function emptyPiles(count: number): Pile[] {
  return Array.from({ length: count }, () => ({ cards: [] }));
}

function step(state: SkipBeauxState, from: string): string {
  const count = state.order.length;
  const index = state.order.indexOf(from);
  if (index < 0 || count === 0) return from;
  return state.order[(index + 1) % count] ?? from;
}

function nameOf(players: readonly Named[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? 'A player';
}

function fail(error: string): SkipBeauxResult {
  return { error };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function shuffle(cards: string[]): string[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    const card = next[index];
    next[index] = next[swap] ?? card;
    next[swap] = card;
  }
  return next;
}

function randomInt(maxExclusive: number): number {
  const max = 0x100000000;
  const limit = max - (max % maxExclusive);
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    fillRandom(buffer);
    value = buffer[0] ?? 0;
  } while (value >= limit);
  return value % maxExclusive;
}
