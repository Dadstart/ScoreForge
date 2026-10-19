import type { Game, Player } from './models';
import { fillRandom } from './secureRandom';

/**
 * Classic Canasta for two, three, or four players.
 *
 * Two decks and four jokers. Four players sit as two partnerships, opposite
 * seats together. Everyone else plays alone. Two players draw two cards from
 * the stock. Three or four draw one. Or take the whole discard pile, then
 * meld and discard. Take the pack only when the top card can go into a meld.
 * A canasta is seven of one rank.
 * The first side to 5,000 wins the game.
 *
 * Wild cards are jokers and twos. A meld needs at least two natural cards,
 * and no more wild cards than natural ones, with at most three wilds.
 * Red threes are laid down for a bonus. Black threes can be melded only on
 * the turn a side goes out. The discard pile is frozen when it holds a wild
 * card, and it is frozen for a side that has not opened.
 */

export const CANASTA_TARGET = 5000;

const SUITS = ['S', 'H', 'D', 'C'] as const;
type Suit = (typeof SUITS)[number];
const RANK_CHARS = 'A23456789TJQK';
const RANK_NAMES = ['', 'Aces', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings'];
const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const CARD_RE = /^(?:[A2-9TJQK][SHDC]|J[RB])#\d+$/;

export type Meld = { rank: number; cards: string[] };

export type CanastaTeam = {
  playerIds: string[];
  melds: Meld[];
  total: number;
  opened: boolean;
};

export type HandLine = { label: string; points: number };

export type HandScore = {
  team: number;
  points: number;
  lines: HandLine[];
};

type Checkpoint = {
  hands: Record<string, string[]>;
  redThrees: Record<string, string[]>;
  teams: { melds: Meld[]; opened: boolean }[];
  melded: Record<string, boolean>;
};

export type CanastaPhase = 'waiting' | 'draw' | 'play' | 'handOver' | 'gameOver';

export type CanastaState = {
  order: string[];
  teams: CanastaTeam[];
  hands: Record<string, string[]>;
  redThrees: Record<string, string[]>;
  stock: string[];
  /** Bottom card first. The last card is the top. */
  discard: string[];
  dealer: number;
  turn: string | null;
  phase: CanastaPhase;
  handNumber: number;
  /** The exact discard that must be melded before this turn can end. */
  needCard: string | null;
  tookPack: boolean;
  openingPoints: number;
  melded: Record<string, boolean>;
  blackThreesLaid: boolean;
  checkpoint: Checkpoint | null;
  lastScores: HandScore[] | null;
  lastAction: string | null;
  wentOut: number | null;
  /** Cards that entered this turn from the stock or the pack. */
  drawn: string[];
  /** Earlier positions, oldest first. Absent on deals saved before undo. */
  history?: CanastaSnap[];
};

type CanastaSnap = {
  teams: { melds: Meld[]; total: number; opened: boolean }[];
  hands: Record<string, string[]>;
  redThrees: Record<string, string[]>;
  stock: string[];
  discard: string[];
  dealer: number;
  turn: string | null;
  phase: CanastaPhase;
  handNumber: number;
  needCard: string | null;
  tookPack: boolean;
  openingPoints: number;
  melded: Record<string, boolean>;
  blackThreesLaid: boolean;
  checkpoint: Checkpoint | null;
  lastScores: HandScore[] | null;
  lastAction: string | null;
  wentOut: number | null;
  drawn: string[];
};

export type CanastaFace = {
  code: string;
  label: string;
  symbol: string;
  red: boolean;
  name: string;
};

type Named = { id: string; name: string };

export type CanastaResult = { state: CanastaState } | { error: string };

export function freshDeck(): string[] {
  const cards: string[] = [];
  for (let copy = 1; copy <= 2; copy += 1) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) cards.push(`${RANK_CHARS[rank - 1]}${suit}#${copy}`);
    }
  }
  cards.push('JR#1', 'JR#2', 'JB#1', 'JB#2');
  return cards;
}

export function cardBase(code: string): string {
  return code.split('#')[0] ?? code;
}

export function cardFace(code: string): CanastaFace | null {
  if (!isCard(code)) return null;
  const base = cardBase(code);
  if (base === 'JR' || base === 'JB') {
    const red = base === 'JR';
    return { code, label: 'Jkr', symbol: '★', red, name: red ? 'red joker' : 'black joker' };
  }
  const rank = RANK_CHARS.indexOf(base[0]) + 1;
  const suit = base[1] as Suit;
  const label = rank === 10 ? '10' : base[0];
  const suitName = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[suit];
  return {
    code,
    label,
    symbol: SUIT_SYMBOLS[suit],
    red: suit === 'H' || suit === 'D',
    name: `${rank === 1 ? 'ace' : label} of ${suitName}`,
  };
}

export function isCard(code: string): boolean {
  return CARD_RE.test(code);
}

export function rankOf(code: string): number {
  const base = cardBase(code);
  if (base === 'JR' || base === 'JB') return 0;
  return RANK_CHARS.indexOf(base[0]) + 1;
}

export function isJoker(code: string): boolean {
  const base = cardBase(code);
  return base === 'JR' || base === 'JB';
}

export function isWild(code: string): boolean {
  return isJoker(code) || rankOf(code) === 2;
}

export function isRedThree(code: string): boolean {
  const base = cardBase(code);
  return rankOf(code) === 3 && (base[1] === 'H' || base[1] === 'D');
}

export function isBlackThree(code: string): boolean {
  const base = cardBase(code);
  return rankOf(code) === 3 && (base[1] === 'S' || base[1] === 'C');
}

export function cardPoints(code: string): number {
  if (isJoker(code)) return 50;
  const rank = rankOf(code);
  if (rank === 1 || rank === 2) return 20;
  if (rank >= 8) return 10;
  return 5;
}

export function openingRequirement(total: number): number {
  if (total < 0) return 15;
  if (total < 1500) return 50;
  if (total < 3000) return 90;
  return 120;
}

export function dealCount(playerCount: number): number {
  if (playerCount <= 2) return 15;
  if (playerCount === 3) return 13;
  return 11;
}

export function compareCards(a: string, b: string): number {
  return sortKey(a) - sortKey(b) || cardBase(a).localeCompare(cardBase(b)) || a.localeCompare(b);
}

export function teamIndex(state: CanastaState, playerId: string): number {
  return state.teams.findIndex((team) => team.playerIds.includes(playerId));
}

export function scoreForPlayer(state: CanastaState, playerId: string): number {
  const team = state.teams[teamIndex(state, playerId)];
  return team?.total ?? 0;
}

export function winnerIds(state: CanastaState): string[] {
  if (state.phase !== 'gameOver') return [];
  let best = -Infinity;
  let winners: string[] = [];
  for (const team of state.teams) {
    if (team.total > best) {
      best = team.total;
      winners = [...team.playerIds];
    } else if (team.total === best) winners = winners.concat(team.playerIds);
  }
  return winners;
}

export function meldLabel(meld: Meld): string {
  const name = RANK_NAMES[meld.rank] ?? 'Cards';
  if (meld.rank === 3) return `${name} · ${meld.cards.length}`;
  if (meld.cards.length >= 7) return meld.cards.some(isWild) ? `${name} · mixed canasta` : `${name} · natural canasta`;
  return `${name} · ${meld.cards.length}`;
}

export function tablePoints(team: CanastaTeam): number {
  return team.melds.reduce((sum, meld) => sum + meldValue(meld) + canastaBonus(meld), 0);
}

export function canTakeDiscard(state: CanastaState, playerId: string): boolean {
  if (state.phase !== 'draw' || state.turn !== playerId) return false;
  const top = topCard(state.discard);
  if (!top || isWild(top) || isBlackThree(top) || isRedThree(top)) return false;
  const team = state.teams[teamIndex(state, playerId)];
  if (!team) return false;
  const hand = state.hands[playerId] ?? [];
  const rank = rankOf(top);
  const pairRequired = state.discard.some(isWild) || !team.opened;
  if (!canMeldTop(hand, team, rank, pairRequired)) return false;
  if (!team.opened && maxOpeningPoints([...hand, top], rank) < openingRequirement(team.total)) return false;
  return true;
}

export function createCanastaState(players: { id: string }[], options?: { deck?: readonly string[] }): CanastaState {
  const ids = players.slice(0, 4).map((player) => player.id);
  if (ids.length < 2) return waitingState();
  return deal(ids, totalsFrom(null, ids), ids.length - 1, 1, options?.deck ? [...options.deck] : shuffle(freshDeck()));
}

export function drawStock(state: CanastaState, playerId: string, players: readonly Named[], target = CANASTA_TARGET): CanastaResult {
  if (!isTurn(state, playerId, 'draw')) return fail('Wait for your turn to draw.');
  if (state.stock.length === 0) {
    if (canTakeDiscard(state, playerId)) return fail('The stock is empty. Take the discard pile.');
    return { state: remember(state, closeHand(state, players, null, false, target)) };
  }
  let next = clone(state);
  const drawn: string[] = [];
  const want = next.order.length <= 2 ? 2 : 1;
  let kept = 0;
  do {
    const card = next.stock[0];
    if (!card) break;
    next.stock = next.stock.slice(1);
    if (isRedThree(card)) {
      next.redThrees = { ...next.redThrees, [playerId]: [...(next.redThrees[playerId] ?? []), card] };
      drawn.push(card);
      continue;
    }
    next.hands = { ...next.hands, [playerId]: sortHand([...(next.hands[playerId] ?? []), card]) };
    drawn.push(card);
    kept += 1;
  } while (kept < want && next.stock.length > 0);
  next = enterPlay(next, false, null);
  next.drawn = drawn;
  const reds = drawn.filter(isRedThree).length;
  const face = drawn.filter((card) => !isRedThree(card)).map((card) => cardFace(card)?.name ?? 'a card');
  const redNote = reds > 0 ? `${reds === 1 ? 'A red three is' : `${reds} red threes are`} laid down. ` : '';
  const drawnNames = face.length === 0 ? 'from the stock' : face.map((name) => `the ${name}`).join(' and ');
  next.lastAction = `${redNote}${nameOf(players, playerId)} draws ${drawnNames}.`;
  return { state: remember(state, next) };
}

export function takeDiscard(state: CanastaState, playerId: string, players: readonly Named[]): CanastaResult {
  if (!isTurn(state, playerId, 'draw')) return fail('Wait for your turn.');
  if (!canTakeDiscard(state, playerId)) return fail(takeReason(state, playerId));
  const top = topCard(state.discard)!;
  const beforeHand = new Set(state.hands[playerId] ?? []);
  const beforeReds = new Set(state.redThrees[playerId] ?? []);
  let next = clone(state);
  const taken = next.discard;
  next.discard = [];
  next.hands = { ...next.hands, [playerId]: sortHand([...(next.hands[playerId] ?? []), ...taken]) };
  next = layRedThrees(next, playerId);
  next = enterPlay(next, true, top);
  const arrived = [
    ...(next.hands[playerId] ?? []).filter((card) => !beforeHand.has(card)),
    ...(next.redThrees[playerId] ?? []).filter((card) => !beforeReds.has(card)),
  ];
  next.drawn = arrived;
  next.lastAction = `${nameOf(players, playerId)} takes the pack on the ${cardFace(top)?.name ?? 'top card'}.`;
  return { state: remember(state, next) };
}

export function meldNew(state: CanastaState, playerId: string, cards: readonly string[], players: readonly Named[], target = CANASTA_TARGET): CanastaResult {
  if (!isTurn(state, playerId, 'play')) return fail('Draw before you meld.');
  const unique = uniqueCards(cards);
  if (unique.length < 3) return fail('A meld needs at least three cards.');
  const hand = state.hands[playerId] ?? [];
  if (!containsAll(hand, unique)) return fail('Those cards are not in your hand.');
  const teamAt = teamIndex(state, playerId);
  const team = state.teams[teamAt];
  if (!team) return fail('You do not have a seat.');
  const black = unique.every(isBlackThree);
  const meld: Meld | null = black ? { rank: 3, cards: [...unique] } : buildMeld(unique);
  if (black) {
    if (unique.length > 4) return fail('Only four black threes are in the deck.');
    if (!hasCanasta(team)) return fail('You need a canasta before black threes can be melded.');
    if (without(hand, unique).length > 0) return fail('Black threes can be melded only on the turn you go out.');
  } else if (!meld) {
    return fail('A meld is one rank, with at least two natural cards and no more wilds than natural cards.');
  }
  if (!meld) return fail('A meld is one rank, with at least two natural cards and no more wilds than natural cards.');
  const remaining = without(hand, unique);
  const openedAfter = team.opened || (!black && team.total != null && state.openingPoints + meldValue(meld) >= openingRequirement(team.total));
  const teamAfter: CanastaTeam = { ...team, opened: openedAfter, melds: [...team.melds, meld] };
  const blocked = goingOutBlock(state, remaining, teamAfter);
  if (blocked) return fail(blocked);
  let next = clone(state);
  next.hands = { ...next.hands, [playerId]: sortHand(without(hand, unique)) };
  next.teams = next.teams.map((entry, index) =>
    index === teamAt ? { ...entry, melds: [...entry.melds, meld] } : entry,
  );
  next.melded = { ...next.melded, [playerId]: true };
  if (black) next.blackThreesLaid = true;
  else next = addOpening(next, teamAt, meldValue(meld));
  next.lastAction = `${nameOf(players, playerId)} melds ${meldLabel(meld)}.`;
  return { state: remember(state, finishIfEmpty(next, playerId, players, target)) };
}

export function addToMeld(
  state: CanastaState,
  playerId: string,
  meldIndex: number,
  cards: readonly string[],
  players: readonly Named[],
  target = CANASTA_TARGET,
): CanastaResult {
  if (!isTurn(state, playerId, 'play')) return fail('Draw before you meld.');
  const unique = uniqueCards(cards);
  if (unique.length === 0) return fail('Choose cards to add.');
  const hand = state.hands[playerId] ?? [];
  if (!containsAll(hand, unique)) return fail('Those cards are not in your hand.');
  const teamAt = teamIndex(state, playerId);
  const team = state.teams[teamAt];
  const meld = team?.melds[meldIndex];
  if (!team || !meld) return fail('That meld is not on your side.');
  if (meld.rank === 3) {
    if (!unique.every(isBlackThree)) return fail('Only a black three can join that meld.');
    if (!hasCanasta(team)) return fail('You need a canasta before black threes can be melded.');
    if (without(hand, unique).length > 0) return fail('Black threes can be melded only on the turn you go out.');
  }
  const combined = [...meld.cards, ...unique];
  if (meld.rank === 3) {
    if (combined.length > 4 || !combined.every(isBlackThree)) return fail('Black threes cannot take a wild card.');
  } else if (!buildMeld(combined) || rankOfNaturals(combined) !== meld.rank) {
    return fail('Those cards do not fit that meld.');
  }
  const remaining = without(hand, unique);
  const added = meld.rank === 3 || team.opened ? 0 : unique.reduce((sum, card) => sum + cardPoints(card), 0);
  const openedAfter = team.opened || added + state.openingPoints >= openingRequirement(team.total);
  const meldsAfter = team.melds.map((item, itemIndex) => (itemIndex === meldIndex ? { ...item, cards: combined } : item));
  const blocked = goingOutBlock(state, remaining, { ...team, opened: openedAfter, melds: meldsAfter });
  if (blocked) return fail(blocked);
  let next = clone(state);
  next.hands = { ...next.hands, [playerId]: sortHand(without(hand, unique)) };
  next.teams = next.teams.map((entry, index) => {
    if (index !== teamAt) return entry;
    const melds = entry.melds.map((item, itemIndex) => (itemIndex === meldIndex ? { ...item, cards: combined } : item));
    return { ...entry, melds };
  });
  next.melded = { ...next.melded, [playerId]: true };
  if (meld.rank === 3) next.blackThreesLaid = true;
  else if (!team.opened) next = addOpening(next, teamAt, unique.reduce((sum, card) => sum + cardPoints(card), 0));
  const grown = next.teams[teamAt]?.melds[meldIndex];
  next.lastAction = `${nameOf(players, playerId)} adds to ${grown ? meldLabel(grown) : 'a meld'}.`;
  return { state: remember(state, finishIfEmpty(next, playerId, players, target)) };
}

export function undoMove(state: CanastaState): CanastaResult {
  const history = state.history ?? [];
  const prior = history[history.length - 1];
  if (!prior) return fail('There is nothing to take back.');
  return {
    state: {
      ...restore(state, prior),
      history: history.slice(0, -1),
      lastAction: 'The last move is taken back.',
    },
  };
}

export function discard(state: CanastaState, playerId: string, card: string, players: readonly Named[], target = CANASTA_TARGET): CanastaResult {
  if (!isTurn(state, playerId, 'play')) return fail('Draw before you discard.');
  const hand = state.hands[playerId] ?? [];
  if (!hand.includes(card)) return fail('That card is not in your hand.');
  if (isRedThree(card)) return fail('A red three is laid down, not discarded.');
  if (state.needCard && hand.includes(state.needCard)) {
    return fail(`Meld the ${cardFace(state.needCard)?.name ?? 'top card'} from the pack first.`);
  }
  const teamAt = teamIndex(state, playerId);
  const team = state.teams[teamAt];
  if (!team) return fail('You do not have a seat.');
  if (!team.opened && state.openingPoints > 0) {
    return fail(`You need ${openingRequirement(team.total)} points to open. This turn has ${state.openingPoints}.`);
  }
  const remaining = without(hand, [card]);
  const goingOut = remaining.length === 0;
  if (state.blackThreesLaid && !goingOut) return fail('Black threes can be melded only on the turn you go out.');
  if (goingOut && !hasCanasta(team)) return fail('You need a canasta before you can go out.');
  const concealed = !(state.checkpoint?.melded[playerId]) && !state.tookPack;
  let next = clone(state);
  next.hands = { ...next.hands, [playerId]: remaining };
  next.discard = [...next.discard, card];
  if (goingOut) {
    next.lastAction = `${nameOf(players, playerId)} discards the ${cardFace(card)?.name ?? 'last card'} and goes out.`;
    return { state: remember(state, closeHand(next, players, teamAt, concealed, target)) };
  }
  const who = nameOf(players, playerId);
  const what = cardFace(card)?.name ?? 'a card';
  const nextId = nextPlayer(next);
  next.turn = nextId;
  next.phase = 'draw';
  next.needCard = null;
  next.tookPack = false;
  next.openingPoints = 0;
  next.blackThreesLaid = false;
  next.checkpoint = null;
  next.drawn = [];
  next.lastAction = `${who} discards the ${what}.`;
  if (next.stock.length === 0 && nextId && !canTakeDiscard(next, nextId)) {
    return { state: remember(state, closeHand(next, players, null, false, target)) };
  }
  return { state: remember(state, next) };
}

export function dealNext(state: CanastaState, players: readonly Named[]): CanastaResult {
  if (state.phase !== 'handOver') return fail('The hand is still going.');
  const ids = state.order;
  const dealer = (state.dealer + 1) % ids.length;
  return { state: remember(state, deal(ids, totalsFrom(state, ids), dealer, state.handNumber + 1, shuffle(freshDeck()))) };
}

export function ensureCanastaState(game: Game): Game {
  if (game.templateId !== 'canasta') return game;
  if (game.canasta && validState(game.canasta, game.players)) return game;
  return { ...game, canasta: repairCanasta(game) };
}

function waitingState(): CanastaState {
  return {
    order: [],
    teams: [],
    hands: {},
    redThrees: {},
    stock: [],
    discard: [],
    dealer: 0,
    turn: null,
    phase: 'waiting',
    handNumber: 0,
    needCard: null,
    tookPack: false,
    openingPoints: 0,
    melded: {},
    blackThreesLaid: false,
    checkpoint: null,
    lastScores: null,
    lastAction: 'Waiting for another player.',
    wentOut: null,
    drawn: [],
    history: [],
  };
}

function deal(ids: string[], totals: Record<string, number>, dealer: number, handNumber: number, deck: string[]): CanastaState {
  const stock = [...deck];
  const hands: Record<string, string[]> = {};
  const redThrees: Record<string, string[]> = {};
  const melded: Record<string, boolean> = {};
  for (const id of ids) {
    hands[id] = [];
    redThrees[id] = [];
    melded[id] = false;
  }
  const count = dealCount(ids.length);
  for (let round = 0; round < count; round += 1) {
    for (const id of ids) {
      const card = stock.shift();
      if (card) hands[id].push(card);
    }
  }
  for (const id of ids) {
    let guard = 0;
    while (hands[id].some(isRedThree) && guard < 30) {
      const index = hands[id].findIndex(isRedThree);
      const [red] = hands[id].splice(index, 1);
      if (red) redThrees[id].push(red);
      const replacement = stock.shift();
      if (replacement) hands[id].push(replacement);
      guard += 1;
    }
    hands[id] = sortHand(hands[id]);
  }
  const discard: string[] = [];
  while (stock.length > 0) {
    const card = stock.shift();
    if (!card) break;
    if (isRedThree(card)) continue;
    discard.push(card);
    if (!isWild(card)) break;
  }
  const teams = makeTeams(ids, totals);
  const turn = ids[(dealer + 1) % ids.length] ?? null;
  return {
    order: ids,
    teams,
    hands,
    redThrees,
    stock,
    discard,
    dealer,
    turn,
    phase: 'draw',
    handNumber,
    needCard: null,
    tookPack: false,
    openingPoints: 0,
    melded,
    blackThreesLaid: false,
    checkpoint: null,
    lastScores: null,
    lastAction: handNumber === 1
      ? `The hand is dealt. ${ids.length === 2 ? 'Draw two cards' : 'Draw'} or take the pack.`
      : 'A new hand is dealt.',
    wentOut: null,
    drawn: [],
    history: [],
  };
}

function makeTeams(ids: string[], totals: Record<string, number>): CanastaTeam[] {
  const groups = ids.length === 4 ? [[ids[0], ids[2]], [ids[1], ids[3]]] : ids.map((id) => [id]);
  return groups.filter((group): group is string[] => group.every((id) => id)).map((playerIds) => ({
    playerIds,
    melds: [],
    total: totals[playerIds[0]] ?? 0,
    opened: false,
  }));
}

function enterPlay(state: CanastaState, tookPack: boolean, needCard: string | null): CanastaState {
  const next: CanastaState = {
    ...state,
    phase: 'play',
    tookPack,
    needCard,
    openingPoints: 0,
    blackThreesLaid: false,
    checkpoint: null,
  };
  next.checkpoint = snapshot(next);
  return next;
}

const HISTORY_LIMIT = 40;

function remember(before: CanastaState, after: CanastaState): CanastaState {
  const history = [...(before.history ?? []), capture(before)].slice(-HISTORY_LIMIT);
  return { ...after, history };
}

function capture(state: CanastaState): CanastaSnap {
  return {
    teams: state.teams.map((team) => ({ melds: clone(team.melds), total: team.total, opened: team.opened })),
    hands: clone(state.hands),
    redThrees: clone(state.redThrees),
    stock: [...state.stock],
    discard: [...state.discard],
    dealer: state.dealer,
    turn: state.turn,
    phase: state.phase,
    handNumber: state.handNumber,
    needCard: state.needCard,
    tookPack: state.tookPack,
    openingPoints: state.openingPoints,
    melded: { ...state.melded },
    blackThreesLaid: state.blackThreesLaid,
    checkpoint: state.checkpoint ? clone(state.checkpoint) : null,
    lastScores: state.lastScores ? clone(state.lastScores) : null,
    lastAction: state.lastAction,
    wentOut: state.wentOut,
    drawn: [...(state.drawn ?? [])],
  };
}

function restore(state: CanastaState, snap: CanastaSnap): CanastaState {
  return {
    ...state,
    teams: state.teams.map((team, index) => ({
      ...team,
      melds: clone(snap.teams[index]?.melds ?? []),
      total: snap.teams[index]?.total ?? team.total,
      opened: snap.teams[index]?.opened ?? team.opened,
    })),
    hands: clone(snap.hands),
    redThrees: clone(snap.redThrees),
    stock: [...snap.stock],
    discard: [...snap.discard],
    dealer: snap.dealer,
    turn: snap.turn,
    phase: snap.phase,
    handNumber: snap.handNumber,
    needCard: snap.needCard,
    tookPack: snap.tookPack,
    openingPoints: snap.openingPoints,
    melded: { ...snap.melded },
    blackThreesLaid: snap.blackThreesLaid,
    checkpoint: snap.checkpoint ? clone(snap.checkpoint) : null,
    lastScores: snap.lastScores ? clone(snap.lastScores) : null,
    lastAction: snap.lastAction,
    wentOut: snap.wentOut,
    drawn: [...snap.drawn],
  };
}

function snapshot(state: CanastaState): Checkpoint {
  return {
    hands: clone(state.hands),
    redThrees: clone(state.redThrees),
    teams: state.teams.map((team) => ({ melds: clone(team.melds), opened: team.opened })),
    melded: { ...state.melded },
  };
}

function layRedThrees(state: CanastaState, playerId: string): CanastaState {
  let next = state;
  let guard = 0;
  while ((next.hands[playerId] ?? []).some(isRedThree) && guard < 20) {
    const hand = next.hands[playerId] ?? [];
    const index = hand.findIndex(isRedThree);
    const red = hand[index];
    if (!red) break;
    const reds = [...(next.redThrees[playerId] ?? []), red];
    const withoutRed = hand.filter((_, cardIndex) => cardIndex !== index);
    let stock = next.stock;
    let filled = withoutRed;
    if (stock.length > 0 && !isRedThree(stock[0])) {
      filled = [...withoutRed, stock[0]];
      stock = stock.slice(1);
    } else if (stock.length > 0) {
      // Leave a red three replacement for the loop.
      filled = [...withoutRed, stock[0]];
      stock = stock.slice(1);
    }
    next = {
      ...next,
      stock,
      hands: { ...next.hands, [playerId]: filled },
      redThrees: { ...next.redThrees, [playerId]: reds },
    };
    guard += 1;
  }
  return { ...next, hands: { ...next.hands, [playerId]: sortHand(next.hands[playerId] ?? []) } };
}

function addOpening(state: CanastaState, teamAt: number, points: number): CanastaState {
  const team = state.teams[teamAt];
  if (!team || team.opened) return state;
  const openingPoints = state.openingPoints + points;
  const opened = openingPoints >= openingRequirement(team.total);
  return {
    ...state,
    openingPoints,
    teams: state.teams.map((entry, index) => (index === teamAt ? { ...entry, opened: opened || entry.opened } : entry)),
  };
}

function goingOutBlock(state: CanastaState, remaining: readonly string[], team: CanastaTeam): string | null {
  if (remaining.length > 0) return null;
  if (state.needCard && remaining.includes(state.needCard)) {
    return `Meld the ${cardFace(state.needCard)?.name ?? 'top card'} from the pack first.`;
  }
  if (!team.opened) return `You need ${openingRequirement(team.total)} points to open before going out.`;
  if (!hasCanasta(team)) return 'You need a canasta before you can go out.';
  return null;
}

function finishIfEmpty(state: CanastaState, playerId: string, players: readonly Named[], target: number): CanastaState {
  const hand = state.hands[playerId] ?? [];
  if (hand.length > 0) return state;
  if (state.needCard && hand.includes(state.needCard)) {
    return { ...state, lastAction: `Meld the ${cardFace(state.needCard)?.name ?? 'top card'} from the pack first.` };
  }
  const teamAt = teamIndex(state, playerId);
  const team = state.teams[teamAt];
  if (!team) return state;
  if (!team.opened) {
    return {
      ...state,
      lastAction: `You need ${openingRequirement(team.total)} points to open before going out.`,
    };
  }
  if (!hasCanasta(team)) return { ...state, lastAction: 'You need a canasta before you can go out.' };
  const concealed = state.checkpoint ? !state.checkpoint.melded[playerId] && !state.tookPack : false;
  return closeHand(
    { ...state, lastAction: `${nameOf(players, playerId)} melds out.` },
    players,
    teamAt,
    concealed,
    target,
  );
}

function closeHand(state: CanastaState, players: readonly Named[], wentOut: number | null, concealed: boolean, target: number): CanastaState {
  const scores = state.teams.map((team, index) => scoreTeam(state, index, wentOut === index, wentOut === index && concealed));
  const teams = state.teams.map((team, index) => ({ ...team, total: team.total + (scores[index]?.points ?? 0) }));
  const leader = leadingTeam(teams);
  const over = leader != null && teams[leader].total >= target && teams.filter((team) => team.total === teams[leader].total).length === 1;
  const names = leader == null ? 'The hand' : teamName(players, teams[leader]);
  return {
    ...state,
    teams,
    phase: over ? 'gameOver' : 'handOver',
    turn: null,
    needCard: null,
    checkpoint: null,
    lastScores: scores,
    wentOut,
    drawn: [],
    lastAction: over
      ? `${names} win${teams[leader].playerIds.length > 1 ? '' : 's'} the game.`
      : wentOut != null
        ? state.lastAction
        : 'The stock is empty and the pack cannot be taken. The hand is over.',
  };
}

function scoreTeam(state: CanastaState, index: number, wentOut: boolean, concealed: boolean): HandScore {
  const team = state.teams[index];
  const lines: HandLine[] = [];
  const melded = team.melds.reduce((sum, meld) => sum + meldValue(meld), 0);
  lines.push({ label: 'Melds', points: melded });
  for (const meld of team.melds) {
    const bonus = canastaBonus(meld);
    if (bonus > 0) lines.push({ label: meld.cards.some(isWild) ? 'Mixed canasta' : 'Natural canasta', points: bonus });
  }
  const reds = team.playerIds.flatMap((id) => state.redThrees[id] ?? []);
  const redBonus = reds.length >= 4 ? 800 : reds.length * 100;
  if (redBonus > 0) lines.push({ label: team.opened ? 'Red threes' : 'Red threes, not opened', points: team.opened ? redBonus : -redBonus });
  if (wentOut) lines.push({ label: 'Going out', points: 100 });
  if (concealed) lines.push({ label: 'Concealed hand', points: 100 });
  const left = team.playerIds.reduce((sum, id) => sum + (state.hands[id] ?? []).reduce((cards, card) => cards + cardPoints(card), 0), 0);
  if (left > 0) lines.push({ label: 'Cards left', points: -left });
  const points = lines.reduce((sum, line) => sum + line.points, 0);
  return { team: index, points, lines };
}

function meldValue(meld: Meld): number {
  return meld.cards.reduce((sum, card) => sum + cardPoints(card), 0);
}

function canastaBonus(meld: Meld): number {
  if (meld.rank === 3 || meld.cards.length < 7) return 0;
  return meld.cards.some(isWild) ? 300 : 500;
}

function hasCanasta(team: CanastaTeam): boolean {
  return team.melds.some((meld) => canastaBonus(meld) > 0);
}

function buildMeld(cards: readonly string[]): Meld | null {
  const list = [...cards];
  if (list.some((card) => isRedThree(card) || isBlackThree(card))) return null;
  const naturals = list.filter((card) => !isWild(card));
  const wilds = list.length - naturals.length;
  if (naturals.length < 2 || wilds > naturals.length || wilds > 3 || list.length < 3) return null;
  const rank = rankOf(naturals[0]);
  if (!naturals.every((card) => rankOf(card) === rank)) return null;
  return { rank, cards: list };
}

function rankOfNaturals(cards: readonly string[]): number | null {
  const natural = cards.find((card) => !isWild(card));
  return natural ? rankOf(natural) : null;
}

function canMeldTop(hand: readonly string[], team: CanastaTeam, rank: number, pairRequired: boolean): boolean {
  const naturals = countRank(hand, rank);
  if (pairRequired) return naturals >= 2;
  if (team.melds.some((meld) => meld.rank === rank)) return true;
  if (naturals >= 2) return true;
  return naturals >= 1 && hand.some(isWild);
}

function maxOpeningPoints(cards: readonly string[], requiredRank: number): number {
  const counts = new Map<number, number>();
  const wilds: number[] = [];
  for (const card of cards) {
    if (isRedThree(card) || isBlackThree(card)) continue;
    if (isWild(card)) {
      wilds.push(cardPoints(card));
      continue;
    }
    const rank = rankOf(card);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  if ((counts.get(requiredRank) ?? 0) < 2) return 0;
  const groups = [...counts]
    .filter(([, count]) => count >= 2)
    .map(([rank, naturals]) => ({ rank, naturals, wilds: 0, points: naturals * valueOfRank(rank) }));
  const required = groups.find((group) => group.rank === requiredRank);
  if (!required) return 0;
  wilds.sort((a, b) => b - a);
  const takeWild = () => (wilds.length > 0 ? wilds.shift() ?? null : null);
  if (required.naturals < 3) {
    const wild = takeWild();
    if (wild == null) return 0;
    required.wilds += 1;
    required.points += wild;
  }
  const formed = groups.filter((group) => group.naturals >= 3 || group.wilds > 0);
  for (const pair of groups.filter((group) => group.rank !== requiredRank && group.naturals < 3)) {
    const wild = takeWild();
    if (wild == null) break;
    pair.wilds += 1;
    pair.points += wild;
    formed.push(pair);
  }
  while (wilds.length > 0) {
    const home = formed.find((group) => Math.min(3, group.naturals) - group.wilds > 0);
    if (!home) break;
    const wild = takeWild();
    if (wild == null) break;
    home.wilds += 1;
    home.points += wild;
  }
  return formed.reduce((sum, group) => sum + group.points, 0);
}

function valueOfRank(rank: number): number {
  if (rank === 1) return 20;
  if (rank >= 8) return 10;
  return 5;
}

function countRank(cards: readonly string[], rank: number): number {
  return cards.filter((card) => !isWild(card) && rankOf(card) === rank).length;
}

function topCard(discard: readonly string[]): string | null {
  return discard.length > 0 ? discard[discard.length - 1] : null;
}

function takeReason(state: CanastaState, playerId: string): string {
  const top = topCard(state.discard);
  if (!top) return 'The discard pile is empty.';
  if (isWild(top)) return 'A wild card is on top. Draw from the stock.';
  if (isBlackThree(top)) return 'A black three blocks the pack. Draw from the stock.';
  if (isRedThree(top)) return 'A red three cannot be taken from the pack.';
  const team = state.teams[teamIndex(state, playerId)];
  if (!team) return 'You do not have a seat.';
  const hand = state.hands[playerId] ?? [];
  const rank = rankOf(top);
  const frozen = state.discard.some(isWild);
  if (!canMeldTop(hand, team, rank, frozen || !team.opened)) {
    if (frozen) return 'The pack is frozen. You need a natural pair to meld the top card.';
    if (!team.opened) return `You need a natural pair to meld the top card, and ${openingRequirement(team.total)} points to open.`;
    return 'You can take the pack only when you can meld the top card.';
  }
  if (!team.opened) return `You need ${openingRequirement(team.total)} points to open. Melding the top card does not reach it.`;
  return 'You can take the pack only when you can meld the top card.';
}

function isTurn(state: CanastaState, playerId: string, phase: 'draw' | 'play'): boolean {
  return state.phase === phase && state.turn === playerId;
}

function nextPlayer(state: CanastaState): string | null {
  if (!state.turn) return null;
  const index = state.order.indexOf(state.turn);
  if (index < 0) return null;
  return state.order[(index + 1) % state.order.length] ?? null;
}

function without(hand: readonly string[], cards: readonly string[]): string[] {
  const left = [...hand];
  for (const card of cards) {
    const index = left.indexOf(card);
    if (index >= 0) left.splice(index, 1);
  }
  return left;
}

function containsAll(hand: readonly string[], cards: readonly string[]): boolean {
  const left = [...hand];
  for (const card of cards) {
    const index = left.indexOf(card);
    if (index < 0) return false;
    left.splice(index, 1);
  }
  return true;
}

function uniqueCards(cards: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const card of cards) {
    if (seen.has(card)) continue;
    seen.add(card);
    unique.push(card);
  }
  return unique;
}

function sortHand(cards: readonly string[]): string[] {
  return [...cards].sort(compareCards);
}

function sortKey(code: string): number {
  if (isJoker(code)) return 100;
  if (isWild(code)) return 90;
  if (isRedThree(code)) return 80;
  if (isBlackThree(code)) return 70;
  const rank = rankOf(code);
  if (rank === 1) return 1;
  return 20 - rank;
}

function leadingTeam(teams: readonly CanastaTeam[]): number | null {
  let best = -Infinity;
  let index: number | null = null;
  teams.forEach((team, teamAt) => {
    if (team.total > best) {
      best = team.total;
      index = teamAt;
    }
  });
  return index;
}

function teamName(players: readonly Named[], team: CanastaTeam): string {
  return team.playerIds.map((id) => nameOf(players, id)).join(' and ');
}

function nameOf(players: readonly Named[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? 'A player';
}

function totalsFrom(state: CanastaState | null, ids: readonly string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of ids) totals[id] = 0;
  for (const team of state?.teams ?? []) {
    for (const id of team.playerIds) if (id in totals) totals[id] = team.total;
  }
  if (ids.length === 4 && state) {
    // Opposite seats share one total. A new pairing keeps each seat's last total.
  }
  return totals;
}

function repairCanasta(game: Game): CanastaState {
  const ids = game.players.slice(0, 4).map((player) => player.id);
  const previous = game.canasta;
  if (ids.length < 2) return waitingState();
  return deal(ids, totalsFrom(previous ?? null, ids), Math.max(0, ids.length - 1), Math.max(1, previous?.handNumber ?? 1), shuffle(freshDeck()));
}

function validState(state: CanastaState, players: Player[]): boolean {
  const ids = players.slice(0, 4).map((player) => player.id);
  if (ids.length < 2) return state.phase === 'waiting';
  if (state.phase === 'waiting') return false;
  if (state.order.length !== ids.length || state.order.some((id) => !ids.includes(id))) return false;
  if (ids.some((id) => !state.order.includes(id))) return false;
  if (!validTeams(state, ids)) return false;
  if (!countsFit(state)) return false;
  if ((state.phase === 'draw' || state.phase === 'play') && (!state.turn || !state.order.includes(state.turn))) return false;
  if ((state.phase === 'handOver' || state.phase === 'gameOver') && state.turn != null) return false;
  return true;
}

function validTeams(state: CanastaState, ids: string[]): boolean {
  const grouped = ids.length === 4 ? [[ids[0], ids[2]], [ids[1], ids[3]]] : ids.map((id) => [id]);
  if (state.teams.length !== grouped.length) return false;
  return grouped.every((group, index) => {
    const team = state.teams[index];
    return team && group.every((id) => id && team.playerIds.includes(id)) && team.playerIds.length === group.length;
  });
}

function countsFit(state: CanastaState): boolean {
  const counts = new Map<string, number>();
  const add = (cards: readonly string[]) => {
    for (const card of cards) {
      if (!isCard(card)) return false;
      counts.set(card, (counts.get(card) ?? 0) + 1);
    }
    return true;
  };
  if (!add(state.stock) || !add(state.discard)) return false;
  for (const id of state.order) {
    if (!add(state.hands[id] ?? []) || !add(state.redThrees[id] ?? [])) return false;
  }
  for (const team of state.teams) {
    for (const meld of team.melds) if (!add(meld.cards)) return false;
  }
  for (const [card, count] of counts) {
    const allowed = cardBase(card).startsWith('J') ? 1 : 1;
    if (count > allowed) return false;
  }
  return true;
}

function fail(error: string): CanastaResult {
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
