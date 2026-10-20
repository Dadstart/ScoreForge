import type { Game, Player } from './models';
import { fillRandom } from './secureRandom';

/**
 * Uneaux is a matching-card game for two to eight players.
 *
 * Match the discard by color or symbol, or play a wild. Skip, reverse, and
 * draw cards change the turn. With one card left, say Uneaux before the next
 * player acts. The first player to 500 wins. A tie at the target deals again.
 */

export const UNEAUX_TARGET = 500;

export const UNEAUX_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type UneauxColor = (typeof UNEAUX_COLORS)[number];
export type UneauxPhase = 'waiting' | 'play' | 'color' | 'handOver' | 'gameOver';
export type UneauxDirection = 1 | -1;

const COLOR_CODE: Record<UneauxColor, string> = { red: 'R', yellow: 'Y', green: 'G', blue: 'B' };
const CODE_COLOR: Record<string, UneauxColor> = { R: 'red', Y: 'yellow', G: 'green', B: 'blue' };
const CARD_RE = /^(?:[RYGB](?:[0-9]|[SVD])|[WF])#\d+$/;

export type UneauxScore = { playerId: string; points: number };

export type UneauxState = {
  order: string[];
  hands: Record<string, string[]>;
  stock: string[];
  /** Bottom card first. The last card is the top. */
  discard: string[];
  color: UneauxColor | null;
  direction: UneauxDirection;
  dealer: number;
  turn: string | null;
  phase: UneauxPhase;
  handNumber: number;
  totals: Record<string, number>;
  /** A card just drawn. It may be played, or the turn can be passed. */
  drawn: string | null;
  /** The player who has one card and has not said Uneaux. */
  pendingCall: string | null;
  /** A wild is waiting for a color. An upcard wild leaves the turn with that player. */
  colorFrom: 'upcard' | 'card' | null;
  lastAction: string | null;
  lastScores: UneauxScore[] | null;
  wentOut: string | null;
};

type Named = { id: string; name: string };
export type UneauxResult = { state: UneauxState } | { error: string };

export function freshDeck(): string[] {
  const cards: string[] = [];
  for (const color of UNEAUX_COLORS) {
    const mark = COLOR_CODE[color];
    cards.push(`${mark}0#1`);
    for (let rank = 1; rank <= 9; rank += 1) {
      cards.push(`${mark}${rank}#1`, `${mark}${rank}#2`);
    }
    for (const kind of ['S', 'V', 'D']) {
      cards.push(`${mark}${kind}#1`, `${mark}${kind}#2`);
    }
  }
  for (let copy = 1; copy <= 4; copy += 1) {
    cards.push(`W#${copy}`, `F#${copy}`);
  }
  return cards;
}

export function isCard(code: string): boolean {
  return CARD_RE.test(code);
}

export function colorOf(code: string): UneauxColor | null {
  return CODE_COLOR[code[0] ?? ''] ?? null;
}

export function kindOf(code: string): string {
  if (code.startsWith('W#') || code.startsWith('F#')) return code[0] ?? '';
  return code[1] ?? '';
}

export function isWild(code: string): boolean {
  return kindOf(code) === 'W';
}

export function isWildFour(code: string): boolean {
  return kindOf(code) === 'F';
}

export function cardPoints(code: string): number {
  const kind = kindOf(code);
  if (kind === 'W' || kind === 'F') return 50;
  if (kind === 'S' || kind === 'V' || kind === 'D') return 20;
  const rank = Number(kind);
  return Number.isFinite(rank) ? rank : 0;
}

export function cardLabel(code: string): string {
  const kind = kindOf(code);
  const color = colorOf(code);
  const symbol =
    kind === 'S' ? 'Skip' : kind === 'V' ? 'Reverse' : kind === 'D' ? 'Draw 2' : kind === 'W' ? 'Wild' : kind === 'F' ? 'Draw 4' : kind;
  return color ? `${color} ${symbol}` : symbol;
}

export function compareCards(a: string, b: string): number {
  return sortKey(a) - sortKey(b) || a.localeCompare(b);
}

export function scoreForPlayer(state: UneauxState, playerId: string): number {
  return state.totals[playerId] ?? 0;
}

export function winnerIds(state: UneauxState): string[] {
  if (state.phase !== 'gameOver') return [];
  let best = -Infinity;
  let winners: string[] = [];
  for (const id of state.order) {
    const total = state.totals[id] ?? 0;
    if (total > best) {
      best = total;
      winners = [id];
    } else if (total === best) winners.push(id);
  }
  return winners;
}

export function canPlayCard(state: UneauxState, playerId: string, card: string): boolean {
  if (state.phase !== 'play' || state.turn !== playerId) return false;
  const hand = state.hands[playerId] ?? [];
  if (!hand.includes(card)) return false;
  if (state.drawn && card !== state.drawn) return false;
  return matches(state, card, hand);
}

export function createUneauxState(players: { id: string }[], options?: { deck?: readonly string[] }): UneauxState {
  const ids = players.slice(0, 8).map((player) => player.id);
  if (ids.length < 2) return waitingState();
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  return deal(ids, totals, ids.length - 1, 1, options?.deck ? [...options.deck] : shuffle(freshDeck()));
}

export function playCard(state: UneauxState, playerId: string, card: string, players: readonly Named[], target = UNEAUX_TARGET): UneauxResult {
  if (state.phase === 'color') return fail('Name a color before the next card.');
  if (!isTurn(state, playerId)) return fail('Wait for your turn.');
  const hand = state.hands[playerId] ?? [];
  if (!hand.includes(card)) return fail('That card is not in your hand.');
  if (state.drawn && card !== state.drawn) return fail('Play the card you drew, or pass.');
  if (!matches(state, card, hand)) {
    if (isWildFour(card) && holdsColor(hand, state.color)) {
      return fail('A draw four can be played only when you have no card of the current color.');
    }
    return fail('Play a card that matches the color or the symbol.');
  }
  let next = clone(state);
  next.pendingCall = next.pendingCall === playerId ? next.pendingCall : null;
  next.hands = { ...next.hands, [playerId]: hand.filter((item) => item !== card) };
  next.discard = [...next.discard, card];
  next.drawn = null;
  const remaining = next.hands[playerId] ?? [];
  if (remaining.length === 1) next.pendingCall = playerId;
  if (remaining.length === 0) {
    next.lastAction = `${nameOf(players, playerId)} plays ${cardLabel(card)} and goes out.`;
    return { state: closeHand(next, playerId, players, target) };
  }
  if (isWild(card) || isWildFour(card)) {
    next.phase = 'color';
    next.colorFrom = 'card';
    next.color = null;
    next.lastAction = `${nameOf(players, playerId)} plays ${cardLabel(card)}. Name a color.`;
    return { state: next };
  }
  next.color = colorOf(card);
  next = applySymbol(next, playerId, card);
  next.lastAction = `${nameOf(players, playerId)} plays ${cardLabel(card)}.`;
  return { state: next };
}

export function chooseColor(state: UneauxState, playerId: string, color: UneauxColor, players: readonly Named[]): UneauxResult {
  if (state.phase !== 'color' || state.turn !== playerId) return fail('Wait for your turn to name a color.');
  if (!UNEAUX_COLORS.includes(color)) return fail('Choose red, yellow, green, or blue.');
  let next = clone(state);
  next.color = color;
  next.phase = 'play';
  const from = next.colorFrom;
  next.colorFrom = null;
  const top = topCard(next.discard);
  if (from === 'card' && top && isWildFour(top)) {
    const victim = step(next, playerId, 1);
    next = giveCards(next, victim, 4);
    next.turn = step(next, playerId, 2);
    next.lastAction = `${nameOf(players, playerId)} names ${color}. ${nameOf(players, victim)} draws four.`;
    return { state: next };
  }
  if (from === 'card') {
    next.turn = step(next, playerId, 1);
  }
  next.lastAction = `${nameOf(players, playerId)} names ${color}.`;
  return { state: next };
}

export function drawCard(state: UneauxState, playerId: string, players: readonly Named[]): UneauxResult {
  if (state.phase === 'color') return fail('Name a color first.');
  if (!isTurn(state, playerId)) return fail('Wait for your turn to draw.');
  if (state.drawn) return fail('Play the card you drew, or pass.');
  let next = clone(state);
  if (next.pendingCall && next.pendingCall !== playerId) next.pendingCall = null;
  const card = takeStock(next);
  if (!card) return fail('No cards are left to draw.');
  next.hands = { ...next.hands, [playerId]: [...(next.hands[playerId] ?? []), card] };
  next.drawn = card;
  if ((next.hands[playerId] ?? []).length !== 1) next.pendingCall = next.pendingCall === playerId ? null : next.pendingCall;
  next.lastAction = `${nameOf(players, playerId)} draws a card.`;
  return { state: next };
}

export function passTurn(state: UneauxState, playerId: string, players: readonly Named[]): UneauxResult {
  if (!isTurn(state, playerId)) return fail('Wait for your turn.');
  if (!state.drawn) return fail('Draw a card before you pass.');
  const next = clone(state);
  next.drawn = null;
  next.turn = step(next, playerId, 1);
  next.lastAction = `${nameOf(players, playerId)} passes.`;
  return { state: next };
}

export function callUneaux(state: UneauxState, playerId: string, players: readonly Named[]): UneauxResult {
  if (state.pendingCall !== playerId) return fail('You do not have to say Uneaux.');
  const next = clone(state);
  next.pendingCall = null;
  next.lastAction = `${nameOf(players, playerId)} says Uneaux.`;
  return { state: next };
}

export function catchUneaux(state: UneauxState, playerId: string, players: readonly Named[]): UneauxResult {
  if (!isTurn(state, playerId) || state.phase !== 'play') return fail('Wait for your turn to call them out.');
  const caught = state.pendingCall;
  if (!caught || caught === playerId) return fail('Nobody forgot to say Uneaux.');
  let next = clone(state);
  next = giveCards(next, caught, 2);
  next.pendingCall = null;
  next.lastAction = `${nameOf(players, playerId)} catches ${nameOf(players, caught)}. They draw two.`;
  return { state: next };
}

export function dealNext(state: UneauxState, players: readonly Named[]): UneauxResult {
  if (state.phase !== 'handOver') return fail('The hand is still going.');
  const ids = state.order;
  const dealer = (state.dealer + 1) % ids.length;
  return { state: deal(ids, { ...state.totals }, dealer, state.handNumber + 1, shuffle(freshDeck())) };
}

export function ensureUneauxState(game: Game): Game {
  if (game.templateId !== 'uneaux') return game;
  if (game.uneaux && validState(game.uneaux, game.players)) return game;
  return { ...game, uneaux: repair(game) };
}

function waitingState(): UneauxState {
  return {
    order: [],
    hands: {},
    stock: [],
    discard: [],
    color: null,
    direction: 1,
    dealer: 0,
    turn: null,
    phase: 'waiting',
    handNumber: 0,
    totals: {},
    drawn: null,
    pendingCall: null,
    colorFrom: null,
    lastAction: 'Waiting for another player.',
    lastScores: null,
    wentOut: null,
  };
}

function deal(ids: string[], totals: Record<string, number>, dealer: number, handNumber: number, deck: string[]): UneauxState {
  const stock = [...deck];
  const hands: Record<string, string[]> = {};
  for (const id of ids) hands[id] = [];
  for (let round = 0; round < 7; round += 1) {
    for (const id of ids) {
      const card = stock.shift();
      if (card) hands[id].push(card);
    }
  }
  const discard: string[] = [];
  let guard = 0;
  while (stock.length > 0 && guard < 8) {
    const card = stock.shift();
    if (!card) break;
    if (isWildFour(card)) {
      stock.push(card);
      guard += 1;
      continue;
    }
    discard.push(card);
    break;
  }
  const up = topCard(discard);
  const first = ids[(dealer + 1) % ids.length] ?? ids[0] ?? null;
  const state: UneauxState = {
    order: ids,
    hands,
    stock,
    discard,
    color: up ? colorOf(up) : null,
    direction: 1,
    dealer,
    turn: first,
    phase: 'play',
    handNumber,
    totals,
    drawn: null,
    pendingCall: null,
    colorFrom: null,
    lastAction: handNumber === 1 ? 'The hand is dealt. Match the color or the symbol.' : 'A new hand is dealt.',
    lastScores: null,
    wentOut: null,
  };
  return up && first ? applyOpening(state, up, first) : state;
}

function applyOpening(state: UneauxState, up: string, first: string): UneauxState {
  const kind = kindOf(up);
  if (kind === 'W') {
    return { ...state, phase: 'color', color: null, colorFrom: 'upcard', lastAction: 'A wild is up. Name a color, then play.' };
  }
  if (kind === 'S') {
    return { ...state, turn: step(state, first, 1), lastAction: 'A skip is up. The first player is skipped.' };
  }
  if (kind === 'V') {
    const next = { ...state, direction: -1 as UneauxDirection };
    return { ...next, turn: state.order[state.dealer] ?? first, lastAction: 'A reverse is up. Play goes the other way.' };
  }
  if (kind === 'D') {
    let next = giveCards(state, first, 2);
    next = { ...next, turn: step(state, first, 1), lastAction: 'A draw two is up. The first player draws two and sits out.' };
    return next;
  }
  return state;
}

function applySymbol(state: UneauxState, playerId: string, card: string): UneauxState {
  const kind = kindOf(card);
  if (kind === 'S') return { ...state, turn: step(state, playerId, 2) };
  if (kind === 'V') {
    const direction: UneauxDirection = state.direction === 1 ? -1 : 1;
    const turned = { ...state, direction };
    return { ...turned, turn: state.order.length === 2 ? playerId : step(turned, playerId, 1) };
  }
  if (kind === 'D') {
    const victim = step(state, playerId, 1);
    const given = giveCards(state, victim, 2);
    return { ...given, turn: step(given, playerId, 2) };
  }
  return { ...state, turn: step(state, playerId, 1) };
}

function matches(state: UneauxState, card: string, hand: readonly string[]): boolean {
  if (isWild(card)) return true;
  if (isWildFour(card)) return !holdsColor(hand, state.color);
  const top = topCard(state.discard);
  if (!top) return false;
  if (state.color && colorOf(card) === state.color) return true;
  const kind = kindOf(card);
  return kind !== '' && kind === kindOf(top) && !isWild(top) && !isWildFour(top);
}

function holdsColor(hand: readonly string[], color: UneauxColor | null): boolean {
  if (!color) return false;
  return hand.some((card) => colorOf(card) === color);
}

function giveCards(state: UneauxState, playerId: string, count: number): UneauxState {
  let next = state;
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const card = takeStock(next);
    if (!card) break;
    drawn.push(card);
  }
  if (drawn.length === 0) return next;
  const hand = [...(next.hands[playerId] ?? []), ...drawn];
  next = { ...next, hands: { ...next.hands, [playerId]: hand } };
  if (hand.length !== 1 && next.pendingCall === playerId) next = { ...next, pendingCall: null };
  return next;
}

function takeStock(state: UneauxState): string | null {
  if (state.stock.length === 0) {
    const top = topCard(state.discard);
    const buried = state.discard.slice(0, -1);
    if (!top || buried.length === 0) return null;
    state.stock = shuffle(buried);
    state.discard = [top];
  }
  return state.stock.shift() ?? null;
}

function closeHand(state: UneauxState, winnerId: string, players: readonly Named[], target: number): UneauxState {
  let points = 0;
  for (const id of state.order) {
    if (id === winnerId) continue;
    points += (state.hands[id] ?? []).reduce((sum, card) => sum + cardPoints(card), 0);
  }
  const totals = { ...state.totals, [winnerId]: (state.totals[winnerId] ?? 0) + points };
  const leaders = leading(state.order, totals);
  const over = leaders.length === 1 && (totals[leaders[0] ?? ''] ?? 0) >= target;
  const who = nameOf(players, winnerId);
  return {
    ...state,
    totals,
    phase: over ? 'gameOver' : 'handOver',
    turn: null,
    drawn: null,
    pendingCall: null,
    colorFrom: null,
    wentOut: winnerId,
    lastScores: [{ playerId: winnerId, points }],
    lastAction: over ? `${who} wins the game.` : `${who} goes out and scores ${points}.`,
  };
}

function leading(order: readonly string[], totals: Record<string, number>): string[] {
  let best = -Infinity;
  let winners: string[] = [];
  for (const id of order) {
    const total = totals[id] ?? 0;
    if (total > best) {
      best = total;
      winners = [id];
    } else if (total === best) winners.push(id);
  }
  return winners;
}

function repair(game: Game): UneauxState {
  const ids = game.players.slice(0, 8).map((player) => player.id);
  if (ids.length < 2) return waitingState();
  const previous = game.uneaux;
  const totals: Record<string, number> = {};
  for (const id of ids) totals[id] = previous?.totals[id] ?? 0;
  return deal(ids, totals, Math.max(0, ids.length - 1), Math.max(1, previous?.handNumber ?? 1), shuffle(freshDeck()));
}

function validState(state: UneauxState, players: Player[]): boolean {
  const ids = players.slice(0, 8).map((player) => player.id);
  if (ids.length < 2) return state.phase === 'waiting';
  if (state.phase === 'waiting') return false;
  if (state.order.length !== ids.length || ids.some((id, index) => state.order[index] !== id)) return false;
  if (state.direction !== 1 && state.direction !== -1) return false;
  if ((state.phase === 'play' || state.phase === 'color') && (!state.turn || !state.order.includes(state.turn))) return false;
  if ((state.phase === 'handOver' || state.phase === 'gameOver') && state.turn != null) return false;
  if (state.phase === 'color' && state.colorFrom !== 'upcard' && state.colorFrom !== 'card') return false;
  if (state.phase === 'play' && !state.color) return false;
  if (state.drawn && (!state.turn || !(state.hands[state.turn] ?? []).includes(state.drawn))) return false;
  return countsFit(state);
}

function countsFit(state: UneauxState): boolean {
  const counts = new Map<string, number>();
  const add = (cards: readonly string[]) => {
    for (const card of cards) {
      if (!isCard(card)) return false;
      counts.set(card, (counts.get(card) ?? 0) + 1);
    }
    return true;
  };
  if (!add(state.stock) || !add(state.discard)) return false;
  for (const id of state.order) if (!add(state.hands[id] ?? [])) return false;
  if (counts.size !== 108) return false;
  for (const count of counts.values()) if (count !== 1) return false;
  return true;
}

function isTurn(state: UneauxState, playerId: string): boolean {
  return state.phase === 'play' && state.turn === playerId;
}

function step(state: UneauxState, from: string, hops: number): string {
  const count = state.order.length;
  const index = state.order.indexOf(from);
  if (index < 0 || count === 0) return from;
  const delta = (((state.direction * hops) % count) + count) % count;
  return state.order[(index + delta) % count] ?? from;
}

function topCard(discard: readonly string[]): string | null {
  return discard.length > 0 ? (discard[discard.length - 1] ?? null) : null;
}

function nameOf(players: readonly Named[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? 'A player';
}

function fail(error: string): UneauxResult {
  return { error };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sortKey(code: string): number {
  const kind = kindOf(code);
  const color = colorOf(code);
  const colorRank = color ? UNEAUX_COLORS.indexOf(color) : UNEAUX_COLORS.length;
  const kindRank =
    kind === 'W' ? 20 : kind === 'F' ? 21 : kind === 'S' ? 10 : kind === 'V' ? 11 : kind === 'D' ? 12 : Number(kind) || 0;
  return colorRank * 100 + kindRank;
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
