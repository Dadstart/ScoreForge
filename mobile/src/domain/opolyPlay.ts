import { boardStep, GO_PAYOUT, type DiceRoll, rollOpolyDice } from './opolyDice';
import { CHANCE_CARD_IDS, CHEST_CARD_IDS, type CardDeck } from './opolyCards';
import { backwardSpaces, forwardSpaces, getBoardSpace } from './opolyBoard';
import {
  BANK_PARTY_ID,
  cashFromDelta,
  formatMoney,
  getProperty,
  playerLabel,
  properties,
  transferEvents,
  type BoardProperty,
} from './opoly';
import type { ScoreEvent } from './models';
import { fillRandom } from './secureRandom';

export type BuyPending = { kind: 'buy'; propertyId: string };
export type CardPending = { kind: 'card'; deck: CardDeck; id: string; space: number };
export type PayPending = { kind: 'pay'; amount: number; payeeId: string; space: number; label: string };
export type PlayPending = BuyPending | CardPending | PayPending;

export type OpolyUndo = {
  turn: string;
  doubles: number;
  jail: Record<string, number>;
  owned: Record<string, string>;
  houses: Record<string, number>;
  mortgaged: string[];
  chance: string[];
  chest: string[];
  chanceFree: Record<string, number>;
  chestFree: Record<string, number>;
  pending: PlayPending | null;
  tokens: Record<string, number>;
  events: number;
  prior: OpolyUndo | null;
};

export type OpolyPlay = {
  turn: string;
  doubles: number;
  /** Failed doubles rolls already spent in jail. Absent means the player is not in jail. */
  jail: Record<string, number>;
  owned: Record<string, string>;
  /** 0–4 houses, or 5 for a hotel. */
  houses: Record<string, number>;
  mortgaged: string[];
  chance: string[];
  chest: string[];
  chanceFree: Record<string, number>;
  chestFree: Record<string, number>;
  pending: PlayPending | null;
  undo: OpolyUndo | null;
};

export type PlayPlayer = { id: string; name: string; token?: string | null };

export type TokenRoute = { playerId: string; spaces: number[] };

export type DrawnCard = { deck: CardDeck; id: string; space: number };

export type PlayOutcome = {
  play: OpolyPlay;
  tokens: Record<string, number>;
  events: ScoreEvent[];
  note: string;
  /** Spaces the moving token visits, including where it started. Absent when nobody moves. */
  route?: TokenRoute | null;
  /** Cards turned face up during this action, in the order they were drawn. */
  drawn?: DrawnCard[];
};

const HOUSE_COST: Record<string, number> = {
  Brown: 50,
  'Light blue': 50,
  Pink: 100,
  Orange: 100,
  Red: 150,
  Yellow: 150,
  Green: 200,
  'Dark blue': 200,
};

const RAILROAD_RENT = [0, 25, 50, 100, 200];
const RAILROAD_SPACES = [5, 15, 25, 35];
const UTILITY_SPACES = [12, 28];

const CHANCE_IDS: string[] = [...CHANCE_CARD_IDS];
const CHEST_IDS: string[] = [...CHEST_CARD_IDS];

function streetsIn(group: string): BoardProperty[] {
  return properties.filter((property) => property.kind === 'street' && property.group === group);
}

function houseCost(property: BoardProperty): number {
  return HOUSE_COST[property.group] ?? 0;
}

export function mortgageValue(propertyId: string): number {
  const property = getProperty(propertyId);
  return property ? Math.floor(property.price / 2) : 0;
}

export function unmortgageCost(propertyId: string): number {
  const mortgage = mortgageValue(propertyId);
  return mortgage + Math.ceil(mortgage * 0.1);
}

export function buildingCost(propertyId: string): number {
  const property = getProperty(propertyId);
  return property ? houseCost(property) : 0;
}

function countOf(map: Record<string, number>, id: string): number {
  return map[id] ?? 0;
}

function levelOf(play: OpolyPlay, propertyId: string): number {
  return play.houses[propertyId] ?? 0;
}

export function ownsOpoly(play: OpolyPlay, playerId: string, group: string): boolean {
  const streets = streetsIn(group);
  return (
    streets.length > 1 &&
    streets.every((street) => play.owned[street.id] === playerId && !play.mortgaged.includes(street.id))
  );
}

export function canBuild(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || property.kind !== 'street') return false;
  const owner = play.owned[propertyId];
  if (!owner || !ownsOpoly(play, owner, property.group)) return false;
  const level = levelOf(play, propertyId);
  if (level >= 5) return false;
  const lowest = Math.min(...streetsIn(property.group).map((street) => levelOf(play, street.id)));
  return level === lowest;
}

export function canSellBuilding(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || property.kind !== 'street') return false;
  const level = levelOf(play, propertyId);
  if (level <= 0) return false;
  const highest = Math.max(...streetsIn(property.group).map((street) => levelOf(play, street.id)));
  return level === highest;
}

export function canMortgage(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || !play.owned[propertyId] || play.mortgaged.includes(propertyId)) return false;
  if (property.kind !== 'street') return true;
  return streetsIn(property.group).every((street) => levelOf(play, street.id) === 0);
}

function shuffle(ids: string[], sample: () => number): string[] {
  const next = [...ids];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(sample() * (index + 1)));
    const held = next[index];
    next[index] = next[swap] ?? held;
    next[swap] = held;
  }
  return next;
}

function blankPlay(turn: string): OpolyPlay {
  return {
    turn,
    doubles: 0,
    jail: {},
    owned: {},
    houses: {},
    mortgaged: [],
    chance: [...CHANCE_IDS],
    chest: [...CHEST_IDS],
    chanceFree: {},
    chestFree: {},
    pending: null,
    undo: null,
  };
}

function shuffleSample(): number {
  const buffer = new Uint32Array(1);
  fillRandom(buffer);
  return (buffer[0] ?? 0) / 0x1_0000_0000;
}

export function createOpolyPlay(playerIds: string[], sample: () => number = shuffleSample): OpolyPlay {
  const play = blankPlay(playerIds[0] ?? '');
  play.chance = shuffle(CHANCE_IDS, sample);
  play.chest = shuffle(CHEST_IDS, sample);
  return play;
}

function copyMap(source: Record<string, number> | undefined): Record<string, number> {
  const next: Record<string, number> = {};
  if (!source) return next;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

function knownDeck(ids: unknown, allowed: string[], heldFree: boolean): string[] {
  const seen = new Set<string>();
  const deck: string[] = [];
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (typeof id !== 'string' || !allowed.includes(id) || seen.has(id)) continue;
      if (id === 'jail-free' && heldFree) continue;
      seen.add(id);
      deck.push(id);
    }
  }
  for (const id of allowed) {
    if (seen.has(id)) continue;
    if (id === 'jail-free' && heldFree) continue;
    deck.push(id);
  }
  return deck;
}

/** Drop records that no longer match the table, and keep a usable deck. */
export function normalizeOpolyPlay(value: unknown, playerIds: string[]): OpolyPlay | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<OpolyPlay>;
  const ids = new Set(playerIds);
  const turn = typeof raw.turn === 'string' && ids.has(raw.turn) ? raw.turn : playerIds[0] ?? '';
  const play = blankPlay(turn);
  play.doubles = raw.doubles === 1 || raw.doubles === 2 ? raw.doubles : 0;
  if (raw.jail && typeof raw.jail === 'object') {
    for (const [id, turns] of Object.entries(raw.jail)) {
      if (ids.has(id) && typeof turns === 'number' && turns >= 0 && turns < 3) play.jail[id] = Math.trunc(turns);
    }
  }
  if (raw.owned && typeof raw.owned === 'object') {
    for (const [propertyId, owner] of Object.entries(raw.owned)) {
      if (getProperty(propertyId) && typeof owner === 'string' && ids.has(owner)) play.owned[propertyId] = owner;
    }
  }
  if (raw.houses && typeof raw.houses === 'object') {
    for (const [propertyId, level] of Object.entries(raw.houses)) {
      const property = getProperty(propertyId);
      if (!property || property.kind !== 'street' || play.owned[propertyId] == null) continue;
      if (typeof level === 'number' && level >= 1 && level <= 5) play.houses[propertyId] = Math.trunc(level);
    }
  }
  if (Array.isArray(raw.mortgaged)) {
    play.mortgaged = raw.mortgaged.filter(
      (id): id is string => typeof id === 'string' && play.owned[id] != null && levelOf(play, id) === 0,
    );
  }
  play.chanceFree = copyMap(raw.chanceFree);
  play.chestFree = copyMap(raw.chestFree);
  for (const id of Object.keys(play.chanceFree)) if (!ids.has(id)) delete play.chanceFree[id];
  for (const id of Object.keys(play.chestFree)) if (!ids.has(id)) delete play.chestFree[id];
  const chanceHeld = Object.values(play.chanceFree).reduce((sum, count) => sum + count, 0);
  const chestHeld = Object.values(play.chestFree).reduce((sum, count) => sum + count, 0);
  play.chance = knownDeck(raw.chance, CHANCE_IDS, chanceHeld > 0);
  play.chest = knownDeck(raw.chest, CHEST_IDS, chestHeld > 0);
  const pending = raw.pending;
  if (
    pending &&
    pending.kind === 'card' &&
    (pending.deck === 'chance' || pending.deck === 'chest') &&
    typeof pending.id === 'string' &&
    typeof pending.space === 'number'
  ) {
    play.pending = { kind: 'card', deck: pending.deck, id: pending.id, space: Math.trunc(pending.space) };
  } else if (
    pending &&
    pending.kind === 'buy' &&
    getProperty(pending.propertyId) &&
    play.owned[pending.propertyId] == null
  ) {
    play.pending = { kind: 'buy', propertyId: pending.propertyId };
  } else if (
    pending &&
    pending.kind === 'pay' &&
    typeof pending.amount === 'number' &&
    pending.amount > 0 &&
    typeof pending.payeeId === 'string' &&
    (pending.payeeId === BANK_PARTY_ID || ids.has(pending.payeeId)) &&
    typeof pending.space === 'number' &&
    pending.space >= 0 &&
    pending.space < 40 &&
    typeof pending.label === 'string'
  ) {
    play.pending = {
      kind: 'pay',
      amount: Math.trunc(pending.amount),
      payeeId: pending.payeeId,
      space: Math.trunc(pending.space),
      label: pending.label,
    };
  }
  play.undo = raw.undo && typeof raw.undo === 'object' ? linkedUndo(raw.undo, MAX_UNDO_LINKS) : null;
  return play;
}

export function unpackOpoly(value: unknown, playerIds: string[]): OpolyPlay | null {
  return normalizeOpolyPlay(value, playerIds);
}

/** Property from the latest token move, including a buy decision still open on that square. */
export function landedPropertyId(play: OpolyPlay, tokens: Record<string, number>): string | null {
  if (play.pending?.kind === 'buy' && getProperty(play.pending.propertyId)) return play.pending.propertyId;
  let spaces = tokens;
  let undo = play.undo;
  const seen = new Set<OpolyUndo>();
  while (undo && !seen.has(undo)) {
    seen.add(undo);
    const prior = undo.tokens ?? {};
    const ids = new Set([...Object.keys(spaces), ...Object.keys(prior)]);
    let moved: string | null = null;
    for (const id of ids) {
      if ((spaces[id] ?? 0) !== (prior[id] ?? 0)) {
        moved = id;
        break;
      }
    }
    if (moved) return getBoardSpace(spaces[moved] ?? 0)?.propertyId ?? null;
    spaces = prior;
    undo = undo.prior ?? null;
  }
  return null;
}

function playerName(players: PlayPlayer[], id: string): string {
  const player = players.find((entry) => entry.id === id);
  if (!player) return 'Player';
  return playerLabel(player.name, player.token);
}

/** The next player who still has cash, or null when everyone else is bankrupt. */
function nextSolvent(players: PlayPlayer[], current: string, events: ScoreEvent[]): string | null {
  const index = players.findIndex((player) => player.id === current);
  if (index < 0 || players.length === 0) return null;
  for (let step = 1; step < players.length; step += 1) {
    const candidate = players[(index + step) % players.length];
    if (candidate && cashOf(events, candidate.id) > 0) return candidate.id;
  }
  return null;
}

/** Hand the turn to the next player with cash, and say who was skipped. */
function passTurn(players: PlayPlayer[], current: string, events: ScoreEvent[]): { turn: string; notes: string[] } {
  const next = nextSolvent(players, current, events) ?? current;
  const notes: string[] = [];
  if (cashOf(events, current) <= 0) notes.push(`${playerName(players, current)} is bankrupt.`);
  const index = players.findIndex((player) => player.id === current);
  if (index < 0) return { turn: next, notes };
  for (let step = 1; step < players.length; step += 1) {
    const candidate = players[(index + step) % players.length];
    if (!candidate || candidate.id === next || candidate.id === current) break;
    if (cashOf(events, candidate.id) <= 0) notes.push(`${playerName(players, candidate.id)} is bankrupt.`);
  }
  return { turn: next, notes };
}

type Ctx = {
  play: OpolyPlay;
  tokens: Record<string, number>;
  players: PlayPlayer[];
  events: ScoreEvent[];
  notes: string[];
  dice: number;
  rentScale: number;
  utilityDice: number | null;
  sample: () => number;
  depth: number;
  route: TokenRoute | null;
  drawn: DrawnCard[];
  priorEvents: ScoreEvent[];
};

function credit(ctx: Ctx, playerId: string, amount: number) {
  if (amount > 0) ctx.events.push(...transferEvents(BANK_PARTY_ID, playerId, amount));
}

function charge(ctx: Ctx, fromId: string, toId: string, amount: number) {
  if (amount > 0) ctx.events.push(...transferEvents(fromId, toId, amount));
}

function activeCount(play: OpolyPlay, owner: string, kind: BoardProperty['kind']): number {
  return properties.filter(
    (property) => property.kind === kind && play.owned[property.id] === owner && !play.mortgaged.includes(property.id),
  ).length;
}

export function rentDue(play: OpolyPlay, propertyId: string, dice: number, scale = 1, utilityDice: number | null = null): number {
  const property = getProperty(propertyId);
  const owner = play.owned[propertyId];
  if (!property || !owner || play.mortgaged.includes(propertyId)) return 0;
  if (property.kind === 'street' && property.rents) {
    const level = levelOf(play, propertyId);
    const base = property.rents[level] ?? property.rents[0];
    const doubled = level === 0 && ownsOpoly(play, owner, property.group);
    return base * (doubled ? 2 : 1);
  }
  if (property.kind === 'railroad') {
    const count = Math.min(4, activeCount(play, owner, 'railroad'));
    return (RAILROAD_RENT[count] ?? 25) * scale;
  }
  const utilities = activeCount(play, owner, 'utility');
  const rolled = utilityDice ?? dice;
  const multiplier = utilityDice != null || utilities >= 2 ? 10 : 4;
  return Math.max(0, rolled) * multiplier;
}

function extendRoute(ctx: Ctx, playerId: string, spaces: number[]) {
  if (spaces.length === 0) return;
  if (!ctx.route || ctx.route.playerId !== playerId) {
    ctx.route = { playerId, spaces: [...spaces] };
    return;
  }
  const previous = ctx.route.spaces;
  const last = previous[previous.length - 1];
  const start = spaces[0] === last ? 1 : 0;
  if (start >= spaces.length) return;
  ctx.route = { playerId, spaces: [...previous, ...spaces.slice(start)] };
}

function sendToJail(ctx: Ctx, playerId: string) {
  const from = ctx.tokens[playerId] ?? 0;
  if (from !== 10) extendRoute(ctx, playerId, [from, 10]);
  ctx.tokens[playerId] = 10;
  ctx.play.jail[playerId] = 0;
  ctx.play.doubles = 0;
  ctx.play.pending = null;
  ctx.notes.push(`${playerName(ctx.players, playerId)} goes to jail.`);
}

function nearest(from: number, targets: number[]): number {
  let best = targets[0] ?? from;
  let distance = 40;
  for (const target of targets) {
    const steps = (target - from + 40) % 40;
    if (steps > 0 && steps < distance) {
      best = target;
      distance = steps;
    }
  }
  return best;
}

function advance(from: number, target: number) {
  const start = ((from % 40) + 40) % 40;
  const dest = ((target % 40) + 40) % 40;
  return { index: dest, passedGo: start !== dest && dest < start };
}

function handOff(ctx: Ctx, playerId: string) {
  const passed = passTurn(ctx.players, playerId, [...ctx.priorEvents, ...ctx.events]);
  for (const note of passed.notes) ctx.notes.push(note);
  ctx.play.doubles = 0;
  ctx.play.turn = passed.turn;
}

function finish(ctx: Ctx, playerId: string) {
  if (ctx.play.pending) return;
  const events = [...ctx.priorEvents, ...ctx.events];
  if (ctx.play.jail[playerId] == null && ctx.play.doubles > 0 && cashOf(events, playerId) > 0) {
    ctx.notes.push('Roll again.');
    return;
  }
  handOff(ctx, playerId);
}

function resolveProperty(ctx: Ctx, playerId: string, propertyId: string) {
  const property = getProperty(propertyId);
  if (!property) return;
  const owner = ctx.play.owned[propertyId];
  const name = playerName(ctx.players, playerId);
  if (!owner) {
    ctx.play.pending = { kind: 'buy', propertyId };
    ctx.notes.push(`${name} can buy ${property.name} for ${formatMoney(property.price)}.`);
    return;
  }
  if (owner === playerId) {
    ctx.notes.push(`${name} landed on ${property.name}.`);
    return;
  }
  if (ctx.play.mortgaged.includes(propertyId)) {
    ctx.notes.push(`${property.name} is mortgaged.`);
    return;
  }
  const amount = rentDue(ctx.play, propertyId, ctx.dice, ctx.rentScale, ctx.utilityDice);
  ctx.rentScale = 1;
  ctx.utilityDice = null;
  if (amount <= 0) return;
  const ownerName = playerName(ctx.players, owner);
  ctx.play.pending = {
    kind: 'pay',
    amount,
    payeeId: owner,
    space: ctx.tokens[playerId] ?? 0,
    label: property.name,
  };
  ctx.notes.push(`${name} owes ${ownerName} ${formatMoney(amount)} for ${property.name}.`);
}

function resolveSpace(
  ctx: Ctx,
  playerId: string,
  from: number,
  step: { index: number; passedGo: boolean },
  direction: 'forward' | 'back' = 'forward',
) {
  if (ctx.depth > 4) return;
  ctx.depth += 1;
  if (step.passedGo) {
    credit(ctx, playerId, GO_PAYOUT);
    ctx.notes.push(`Collected ${formatMoney(GO_PAYOUT)} for passing GO.`);
  }
  const current = ctx.tokens[playerId] ?? from;
  const path = direction === 'back' ? backwardSpaces(current, step.index) : forwardSpaces(current, step.index);
  extendRoute(ctx, playerId, path);
  ctx.tokens[playerId] = step.index;
  const space = getBoardSpace(step.index);
  if (!space) return;
  if (space.index === 30) {
    sendToJail(ctx, playerId);
    return;
  }
  if (space.propertyId) {
    resolveProperty(ctx, playerId, space.propertyId);
    return;
  }
  if (space.tax) {
    ctx.play.pending = {
      kind: 'pay',
      amount: space.tax,
      payeeId: BANK_PARTY_ID,
      space: space.index,
      label: space.name,
    };
    ctx.notes.push(`${playerName(ctx.players, playerId)} owes ${formatMoney(space.tax)} for ${space.name}.`);
    return;
  }
  if (space.name === 'Chance') {
    drawCard(ctx, playerId, 'chance', step.index);
    return;
  }
  if (space.name === 'Chest') {
    drawCard(ctx, playerId, 'chest', step.index);
    return;
  }
  ctx.notes.push(`${playerName(ctx.players, playerId)} landed on ${space.name}.`);
}

function improvements(play: OpolyPlay, playerId: string) {
  let houses = 0;
  let hotels = 0;
  for (const property of properties) {
    if (property.kind !== 'street' || play.owned[property.id] !== playerId) continue;
    const level = levelOf(play, property.id);
    if (level >= 5) hotels += 1;
    else houses += level;
  }
  return { houses, hotels };
}

function drawCard(ctx: Ctx, playerId: string, deck: 'chance' | 'chest', from: number) {
  const pile = deck === 'chance' ? ctx.play.chance : ctx.play.chest;
  const id = pile[0];
  if (!id) return;
  const keep = id === 'jail-free';
  const rest = pile.slice(1);
  const next = keep ? rest : [...rest, id];
  if (deck === 'chance') ctx.play.chance = next;
  else ctx.play.chest = next;
  ctx.drawn.push({ deck, id, space: from });
  const label = deck === 'chance' ? 'Chance' : 'Chest';
  ctx.play.pending = { kind: 'card', deck, id, space: from };
  ctx.notes.push(`${label} card. Accept it to play.`);
}

function applyCard(ctx: Ctx, playerId: string, deck: 'chance' | 'chest', id: string, from: number) {
  const name = playerName(ctx.players, playerId);
  const label = deck === 'chance' ? 'Chance' : 'Chest';
  if (id === 'jail-free') {
    if (deck === 'chance') ctx.play.chanceFree[playerId] = countOf(ctx.play.chanceFree, playerId) + 1;
    else ctx.play.chestFree[playerId] = countOf(ctx.play.chestFree, playerId) + 1;
    ctx.notes.push(`${label}: Get Out of Jail Free. ${name} keeps the card.`);
    return;
  }
  if (id === 'go-jail') {
    ctx.notes.push(`${label}: Go to jail.`);
    sendToJail(ctx, playerId);
    return;
  }
  if (id === 'go') {
    ctx.notes.push(`${label}: Advance to GO.`);
    resolveSpace(ctx, playerId, from, advance(from, 0));
    return;
  }
  if (id === 'boardwalk') {
    ctx.notes.push(`${label}: Advance to V.`);
    resolveSpace(ctx, playerId, from, advance(from, 39));
    return;
  }
  if (id === 'illinois') {
    ctx.notes.push(`${label}: Advance to N.`);
    resolveSpace(ctx, playerId, from, advance(from, 24));
    return;
  }
  if (id === 'st-charles') {
    ctx.notes.push(`${label}: Advance to F.`);
    resolveSpace(ctx, playerId, from, advance(from, 11));
    return;
  }
  if (id === 'reading') {
    ctx.notes.push(`${label}: Take a ride on 🚂 W.`);
    resolveSpace(ctx, playerId, from, advance(from, 5));
    return;
  }
  if (id === 'railroad-a' || id === 'railroad-b') {
    ctx.rentScale = 2;
    ctx.notes.push(`${label}: Advance to the nearest railroad. Rent is doubled if it is owned.`);
    resolveSpace(ctx, playerId, from, advance(from, nearest(from, RAILROAD_SPACES)));
    return;
  }
  if (id === 'utility') {
    const target = nearest(from, UTILITY_SPACES);
    const propertyId = getBoardSpace(target)?.propertyId;
    const owner = propertyId ? ctx.play.owned[propertyId] : undefined;
    if (owner && owner !== playerId) {
      const rolled = rollOpolyDice(ctx.sample);
      ctx.utilityDice = rolled.total;
      ctx.notes.push(`${label}: Advance to the nearest utility and throw ${rolled.faces[0]} and ${rolled.faces[1]}.`);
    } else {
      ctx.notes.push(`${label}: Advance to the nearest utility.`);
    }
    resolveSpace(ctx, playerId, from, advance(from, target));
    return;
  }
  if (id === 'back-3') {
    ctx.notes.push(`${label}: Go back 3 spaces.`);
    const index = (from - 3 + 40) % 40;
    resolveSpace(ctx, playerId, from, { index, passedGo: false }, 'back');
    return;
  }
  if (id === 'repairs') {
    const built = improvements(ctx.play, playerId);
    const house = deck === 'chance' ? 25 : 40;
    const hotel = deck === 'chance' ? 100 : 115;
    const amount = built.houses * house + built.hotels * hotel;
    charge(ctx, playerId, BANK_PARTY_ID, amount);
    ctx.notes.push(
      `${label}: Make repairs. ${name} pays ${formatMoney(amount)} for ${built.houses} houses and ${built.hotels} hotels.`,
    );
    return;
  }
  if (id === 'chairman') {
    const others = ctx.players.filter((player) => player.id !== playerId);
    for (const other of others) charge(ctx, playerId, other.id, 50);
    ctx.notes.push(`${label}: ${name} pays each player ${formatMoney(50)}.`);
    return;
  }
  if (id === 'birthday') {
    for (const other of ctx.players) {
      if (other.id !== playerId) charge(ctx, other.id, playerId, 10);
    }
    ctx.notes.push(`${label}: It is ${name}'s birthday. Each player pays ${formatMoney(10)}.`);
    return;
  }
  const payouts: Record<string, number> = {
    'bank-50': 50,
    loan: 150,
    'bank-error': 200,
    stock: 50,
    holiday: 100,
    refund: 20,
    life: 100,
    consultancy: 25,
    beauty: 10,
    inherit: 100,
  };
  const fines: Record<string, number> = {
    'poor-tax': 15,
    doctor: 50,
    hospital: 100,
    school: 50,
  };
  if (payouts[id] != null) {
    credit(ctx, playerId, payouts[id]);
    ctx.notes.push(`${label}: ${name} collects ${formatMoney(payouts[id])}.`);
    return;
  }
  if (fines[id] != null) {
    charge(ctx, playerId, BANK_PARTY_ID, fines[id]);
    ctx.notes.push(`${label}: ${name} pays ${formatMoney(fines[id])}.`);
  }
}

function stamped(events: ScoreEvent[]): ScoreEvent[] {
  const stamp = new Date().toISOString();
  return events.map((event) => ({ ...event, timestamp: stamp }));
}

/**
 * Firestore rejects a map nested more than 20 levels deep. Each undo keeps the
 * previous one, so a long game has to drop the oldest links.
 */
const MAX_UNDO_LINKS = 8;

function linkedUndo(undo: OpolyUndo | null | undefined, remaining: number): OpolyUndo | null {
  if (!undo || remaining <= 0) return null;
  const prior = linkedUndo(undo.prior, remaining - 1);
  if ((undo.prior ?? null) === prior) return undo;
  return { ...undo, prior };
}

function packUndo(play: OpolyPlay, tokens: Record<string, number>, events: number): OpolyUndo {
  return {
    turn: play.turn,
    doubles: play.doubles,
    jail: { ...play.jail },
    owned: { ...play.owned },
    houses: { ...play.houses },
    mortgaged: [...play.mortgaged],
    chance: [...play.chance],
    chest: [...play.chest],
    chanceFree: { ...play.chanceFree },
    chestFree: { ...play.chestFree },
    pending: play.pending ? { ...play.pending } : null,
    tokens: { ...tokens },
    events,
    prior: linkedUndo(play.undo, MAX_UNDO_LINKS - 1),
  };
}

function commit(before: OpolyPlay, tokensBefore: Record<string, number>, ctx: Ctx): PlayOutcome {
  return {
    play: { ...ctx.play, undo: packUndo(before, tokensBefore, ctx.events.length) },
    tokens: ctx.tokens,
    events: stamped(ctx.events),
    note: ctx.notes.join(' '),
    route: ctx.route,
    drawn: ctx.drawn,
  };
}

export function resolveRoll(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  roll: DiceRoll,
  ledger: ScoreEvent[] = [],
  sample: () => number = Math.random,
): PlayOutcome {
  const before = play;
  const ctx: Ctx = {
    play: {
      ...play,
      jail: { ...play.jail },
      owned: { ...play.owned },
      houses: { ...play.houses },
      mortgaged: [...play.mortgaged],
      chance: [...play.chance],
      chest: [...play.chest],
      chanceFree: { ...play.chanceFree },
      chestFree: { ...play.chestFree },
    },
    tokens: { ...tokens },
    players,
    events: [],
    notes: [],
    dice: roll.total,
    rentScale: 1,
    utilityDice: null,
    sample,
    depth: 0,
    route: null,
    drawn: [],
    priorEvents: ledger,
  };
  const playerId = play.turn;
  const name = playerName(players, playerId);
  const faces = `Rolled ${roll.faces[0]} and ${roll.faces[1]}${roll.doubles ? ', doubles' : ''}.`;
  ctx.notes.push(faces);
  if (play.pending || players.every((player) => player.id !== playerId)) {
    return { play, tokens, events: [], note: 'Finish the current decision first.' };
  }
  if (cashOf(ledger, playerId) <= 0) {
    const skipped = skipBankruptTurn(play, tokens, players, ledger);
    if (skipped) return skipped;
    return { play, tokens, events: [], note: `${name} is bankrupt.` };
  }
  const from = tokens[playerId] ?? 0;
  if (play.jail[playerId] != null) {
    if (roll.doubles) {
      delete ctx.play.jail[playerId];
      ctx.play.doubles = 0;
      ctx.notes.push(`${name} rolls out of jail.`);
      resolveSpace(ctx, playerId, from, boardStep(from, roll.total));
      finish(ctx, playerId);
    } else {
      const spent = (play.jail[playerId] ?? 0) + 1;
      if (spent >= 3) {
        delete ctx.play.jail[playerId];
        ctx.play.doubles = 0;
        charge(ctx, playerId, BANK_PARTY_ID, 50);
        ctx.notes.push(`${name} pays ${formatMoney(50)} and must leave jail.`);
        resolveSpace(ctx, playerId, from, boardStep(from, roll.total));
        finish(ctx, playerId);
      } else {
        ctx.play.jail[playerId] = spent;
        ctx.notes.push(`${name} stays in jail.`);
        handOff(ctx, playerId);
      }
    }
    return commit(before, tokens, ctx);
  }
  if (roll.doubles && play.doubles >= 2) {
    ctx.notes.push('Three doubles.');
    sendToJail(ctx, playerId);
    handOff(ctx, playerId);
    return commit(before, tokens, ctx);
  }
  ctx.play.doubles = roll.doubles ? play.doubles + 1 : 0;
  resolveSpace(ctx, playerId, from, boardStep(from, roll.total));
  finish(ctx, playerId);
  return commit(before, tokens, ctx);
}

function afterChoice(
  original: OpolyPlay,
  updated: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  notes: string[],
  events: ScoreEvent[],
  ledger: ScoreEvent[] = [],
): PlayOutcome {
  const ctx: Ctx = {
    play: updated,
    tokens: { ...tokens },
    players,
    events: [...events],
    notes,
    dice: 0,
    rentScale: 1,
    utilityDice: null,
    sample: Math.random,
    depth: 0,
    route: null,
    drawn: [],
    priorEvents: ledger,
  };
  finish(ctx, original.turn);
  return commit(original, tokens, ctx);
}

export function payDue(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  ledger: ScoreEvent[] = [],
): PlayOutcome | { error: string } {
  const pending = play.pending;
  if (!pending || pending.kind !== 'pay') return { error: 'There is nothing to pay.' };
  const events = transferEvents(play.turn, pending.payeeId, pending.amount);
  const name = playerName(players, play.turn);
  const payee = pending.payeeId === BANK_PARTY_ID ? 'the bank' : playerName(players, pending.payeeId);
  return afterChoice(
    play,
    { ...play, pending: null },
    tokens,
    players,
    [`${name} pays ${payee} ${formatMoney(pending.amount)} for ${pending.label}.`],
    events,
    ledger,
  );
}

export type CashSplash = {
  playerId: string;
  space: number;
  amount: number;
  flow: 'pay' | 'receive';
  /** Hold the bills until this player's token finishes walking. */
  wait: boolean;
};

function passedGo(spaces: number[] | undefined): boolean {
  if (!spaces || spaces.length < 2) return false;
  for (let index = 1; index < spaces.length; index += 1) {
    if (spaces[index] === 0 && spaces[index - 1] !== 0) return true;
  }
  return false;
}

/** Where bills should fly for each player who paid or collected. */
export function cashSplashes(
  events: { playerId: string; points: number }[],
  tokens: Record<string, number>,
  route?: { playerId: string; spaces: number[] } | null,
): CashSplash[] {
  const totals = new Map<string, { pay: number; receive: number }>();
  for (const event of events) {
    if (!event.playerId || event.points === 0) continue;
    const row = totals.get(event.playerId) ?? { pay: 0, receive: 0 };
    if (event.points < 0) row.pay += -event.points;
    else row.receive += event.points;
    totals.set(event.playerId, row);
  }
  const moving = route && route.spaces.length > 1 ? route.playerId : null;
  const collectsGo = moving != null && passedGo(route?.spaces);
  const splashes: CashSplash[] = [];
  for (const [playerId, row] of totals) {
    const space = tokens[playerId];
    if (typeof space !== 'number') continue;
    const walking = playerId === moving;
    let receive = row.receive;
    if (collectsGo && walking && receive >= GO_PAYOUT) {
      splashes.push({ playerId, space: 0, amount: GO_PAYOUT, flow: 'receive', wait: false });
      receive -= GO_PAYOUT;
    }
    if (receive > 0) {
      splashes.push({ playerId, space, amount: receive, flow: 'receive', wait: walking });
    }
    if (row.pay > 0) {
      const leftFrom = walking && route && route.spaces[0] !== space ? route.spaces[0] : null;
      splashes.push({
        playerId,
        space: leftFrom ?? space,
        amount: row.pay,
        flow: 'pay',
        wait: walking && leftFrom == null,
      });
    }
  }
  return splashes;
}

export function moneyFromSquare(prior: OpolyPlay, result: PlayOutcome): number | null {
  const paid = result.events.find((event) => event.points < 0);
  if (!paid) return null;
  const space = result.tokens[paid.playerId];
  if (typeof space !== 'number') return null;
  const spot = getBoardSpace(space);
  if (!spot) return null;
  if (
    spot.propertyId &&
    result.play.owned[spot.propertyId] === paid.playerId &&
    prior.owned[spot.propertyId] !== paid.playerId
  ) {
    return space;
  }
  if (spot.tax) return space;
  if (spot.propertyId) {
    const owner = prior.owned[spot.propertyId];
    if (owner && owner !== paid.playerId && !prior.mortgaged.includes(spot.propertyId)) return space;
  }
  return null;
}

export function acceptCard(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  ledger: ScoreEvent[] = [],
  sample: () => number = Math.random,
): PlayOutcome | { error: string } {
  const pending = play.pending;
  if (!pending || pending.kind !== 'card') return { error: 'There is no card to accept.' };
  const before = play;
  const ctx: Ctx = {
    play: {
      ...play,
      pending: null,
      jail: { ...play.jail },
      owned: { ...play.owned },
      houses: { ...play.houses },
      mortgaged: [...play.mortgaged],
      chance: [...play.chance],
      chest: [...play.chest],
      chanceFree: { ...play.chanceFree },
      chestFree: { ...play.chestFree },
    },
    tokens: { ...tokens },
    players,
    events: [],
    notes: [],
    dice: 0,
    rentScale: 1,
    utilityDice: null,
    sample,
    depth: 0,
    route: null,
    drawn: [],
    priorEvents: ledger,
  };
  applyCard(ctx, play.turn, pending.deck, pending.id, pending.space);
  finish(ctx, play.turn);
  return commit(before, tokens, ctx);
}

export function buyProperty(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  cash: number,
  ledger: ScoreEvent[] = [],
): PlayOutcome | { error: string } {
  const pending = play.pending;
  if (!pending || pending.kind !== 'buy') return { error: 'There is nothing to buy.' };
  const property = getProperty(pending.propertyId);
  if (!property) return { error: 'That property is not on the board.' };
  if (cash < property.price) return { error: `${playerName(players, play.turn)} does not have ${formatMoney(property.price)}.` };
  const updated: OpolyPlay = {
    ...play,
    owned: { ...play.owned, [property.id]: play.turn },
    pending: null,
  };
  const events = transferEvents(play.turn, BANK_PARTY_ID, property.price);
  return afterChoice(
    play,
    updated,
    tokens,
    players,
    [`${playerName(players, play.turn)} buys ${property.name} for ${formatMoney(property.price)}.`],
    events,
    ledger,
  );
}

export function declineProperty(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  ledger: ScoreEvent[] = [],
): PlayOutcome | { error: string } {
  if (play.pending?.kind !== 'buy') return { error: 'There is nothing to pass on.' };
  const property = getProperty(play.pending.propertyId);
  return afterChoice(
    play,
    { ...play, pending: null },
    tokens,
    players,
    [`${playerName(players, play.turn)} passes on ${property?.name ?? 'the property'}.`],
    [],
    ledger,
  );
}

export function payToLeaveJail(play: OpolyPlay, tokens: Record<string, number>, players: PlayPlayer[], cash: number): PlayOutcome | { error: string } {
  if (play.jail[play.turn] == null) return { error: 'That player is not in jail.' };
  if (cash < 50) return { error: `Leaving jail costs ${formatMoney(50)}.` };
  const jail = { ...play.jail };
  delete jail[play.turn];
  const next = { ...play, jail, doubles: 0 };
  const events = transferEvents(play.turn, BANK_PARTY_ID, 50);
  return {
    play: { ...next, undo: packUndo(play, tokens, events.length) },
    tokens,
    events: stamped(events),
    note: `${playerName(players, play.turn)} pays ${formatMoney(50)} to leave jail. Roll to move.`,
  };
}

export function useJailCard(play: OpolyPlay, tokens: Record<string, number>, players: PlayPlayer[]): PlayOutcome | { error: string } {
  if (play.jail[play.turn] == null) return { error: 'That player is not in jail.' };
  const chance = countOf(play.chanceFree, play.turn);
  const chest = countOf(play.chestFree, play.turn);
  if (chance + chest <= 0) return { error: 'No Get Out of Jail Free card.' };
  const jail = { ...play.jail };
  delete jail[play.turn];
  const chanceFree = { ...play.chanceFree };
  const chestFree = { ...play.chestFree };
  const chanceDeck = [...play.chance];
  const chestDeck = [...play.chest];
  if (chance > 0) {
    chanceFree[play.turn] = chance - 1;
    chanceDeck.push('jail-free');
  } else {
    chestFree[play.turn] = chest - 1;
    chestDeck.push('jail-free');
  }
  const next: OpolyPlay = { ...play, jail, chanceFree, chestFree, chance: chanceDeck, chest: chestDeck, doubles: 0 };
  return {
    play: { ...next, undo: packUndo(play, tokens, 0) },
    tokens,
    events: [],
    note: `${playerName(players, play.turn)} uses Get Out of Jail Free. Roll to move.`,
  };
}

function ownedPlay(play: OpolyPlay, propertyId: string, playerId: string): BoardProperty | null {
  const property = getProperty(propertyId);
  if (!property || play.owned[propertyId] !== playerId) return null;
  return property;
}

export function buildHouse(play: OpolyPlay, tokens: Record<string, number>, players: PlayPlayer[], propertyId: string, cash: number): PlayOutcome | { error: string } {
  if (play.pending || play.doubles > 0) return { error: 'Finish the move before building.' };
  if (!canBuild(play, propertyId)) return { error: 'Build evenly on a complete color group.' };
  const property = ownedPlay(play, propertyId, play.turn);
  if (!property) return { error: 'You do not own that property.' };
  const cost = houseCost(property);
  if (cash < cost) return { error: `A house costs ${formatMoney(cost)}.` };
  const nextLevel = levelOf(play, propertyId) + 1;
  const houses = { ...play.houses, [propertyId]: nextLevel };
  const events = transferEvents(play.turn, BANK_PARTY_ID, cost);
  const built = nextLevel === 5 ? 'a hotel' : 'a house';
  return {
    play: { ...play, houses, undo: packUndo(play, tokens, events.length) },
    tokens,
    events: stamped(events),
    note: `${playerName(players, play.turn)} builds ${built} on ${property.name}.`,
  };
}

export function sellBuilding(play: OpolyPlay, tokens: Record<string, number>, players: PlayPlayer[], propertyId: string): PlayOutcome | { error: string } {
  if (!canSellBuilding(play, propertyId)) return { error: 'Sell houses evenly, hotels first.' };
  const property = ownedPlay(play, propertyId, play.turn);
  if (!property) return { error: 'You do not own that property.' };
  const refund = Math.floor(houseCost(property) / 2);
  const houses = { ...play.houses };
  const nextLevel = levelOf(play, propertyId) - 1;
  if (nextLevel <= 0) delete houses[propertyId];
  else houses[propertyId] = nextLevel;
  const events = transferEvents(BANK_PARTY_ID, play.turn, refund);
  return {
    play: { ...play, houses, undo: packUndo(play, tokens, events.length) },
    tokens,
    events: stamped(events),
    note: `${playerName(players, play.turn)} sells a building on ${property.name} for ${formatMoney(refund)}.`,
  };
}

export function mortgageProperty(play: OpolyPlay, tokens: Record<string, number>, players: PlayPlayer[], propertyId: string): PlayOutcome | { error: string } {
  if (!canMortgage(play, propertyId) || play.owned[propertyId] !== play.turn) return { error: 'Sell the houses on that color before mortgaging.' };
  const property = getProperty(propertyId);
  if (!property) return { error: 'That property is not on the board.' };
  const amount = mortgageValue(propertyId);
  const events = transferEvents(BANK_PARTY_ID, play.turn, amount);
  return {
    play: { ...play, mortgaged: [...play.mortgaged, propertyId], undo: packUndo(play, tokens, events.length) },
    tokens,
    events: stamped(events),
    note: `${playerName(players, play.turn)} mortgages ${property.name} for ${formatMoney(amount)}.`,
  };
}

export function unmortgageProperty(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  propertyId: string,
  cash: number,
): PlayOutcome | { error: string } {
  if (!play.mortgaged.includes(propertyId) || play.owned[propertyId] !== play.turn) return { error: 'That property is not mortgaged.' };
  const property = getProperty(propertyId);
  if (!property) return { error: 'That property is not on the board.' };
  const cost = unmortgageCost(propertyId);
  if (cash < cost) return { error: `Unmortgaging costs ${formatMoney(cost)}.` };
  const events = transferEvents(play.turn, BANK_PARTY_ID, cost);
  return {
    play: {
      ...play,
      mortgaged: play.mortgaged.filter((id) => id !== propertyId),
      undo: packUndo(play, tokens, events.length),
    },
    tokens,
    events: stamped(events),
    note: `${playerName(players, play.turn)} unmortgages ${property.name} for ${formatMoney(cost)}.`,
  };
}

export function undoOpoly(
  play: OpolyPlay,
  events: ScoreEvent[],
): { play: OpolyPlay; tokens: Record<string, number>; events: ScoreEvent[] } | null {
  const undo = play.undo;
  if (!undo) return null;
  const restored = blankPlay(undo.turn);
  restored.doubles = undo.doubles;
  restored.jail = { ...undo.jail };
  restored.owned = { ...undo.owned };
  restored.houses = { ...undo.houses };
  restored.mortgaged = [...undo.mortgaged];
  restored.chance = [...undo.chance];
  restored.chest = [...undo.chest];
  restored.chanceFree = { ...undo.chanceFree };
  restored.chestFree = { ...undo.chestFree };
  restored.pending = undo.pending ? { ...undo.pending } : null;
  restored.undo = undo.prior ?? null;
  return {
    play: restored,
    tokens: { ...undo.tokens },
    events: events.slice(0, Math.max(0, events.length - undo.events)),
  };
}

/** Remember a manual cash transfer so Undo puts the table back. */
export function undoForCash(play: OpolyPlay, tokens: Record<string, number>, eventCount: number): OpolyPlay {
  return { ...play, undo: packUndo(play, tokens, eventCount) };
}

export function withoutOpolyPlayer(
  play: OpolyPlay,
  playerId: string,
  players: PlayPlayer[],
  events: ScoreEvent[] = [],
): OpolyPlay {
  const owned: Record<string, string> = {};
  const houses: Record<string, number> = {};
  for (const [propertyId, owner] of Object.entries(play.owned)) {
    if (owner === playerId) continue;
    owned[propertyId] = owner;
    if (play.houses[propertyId] != null) houses[propertyId] = play.houses[propertyId];
  }
  const jail = { ...play.jail };
  delete jail[playerId];
  const chanceFree = { ...play.chanceFree };
  const chestFree = { ...play.chestFree };
  const chance = [...play.chance];
  const chest = [...play.chest];
  for (let count = countOf(chanceFree, playerId); count > 0; count -= 1) chance.push('jail-free');
  for (let count = countOf(chestFree, playerId); count > 0; count -= 1) chest.push('jail-free');
  delete chanceFree[playerId];
  delete chestFree[playerId];
  let turn = play.turn;
  if (play.turn === playerId) {
    turn = nextSolvent(players, playerId, events) ?? playerId;
    if (turn === playerId) {
      const index = Math.max(0, players.findIndex((player) => player.id === playerId));
      const fallback = players[(index + 1) % players.length];
      turn = fallback && fallback.id !== playerId ? fallback.id : players.find((player) => player.id !== playerId)?.id ?? playerId;
    }
  }
  const pending =
    play.turn === playerId || (play.pending?.kind === 'pay' && play.pending.payeeId === playerId)
      ? null
      : play.pending;
  return {
    ...play,
    turn,
    owned,
    houses,
    mortgaged: play.mortgaged.filter((id) => owned[id] != null),
    jail,
    chance,
    chest,
    chanceFree,
    chestFree,
    pending,
    doubles: play.turn === playerId ? 0 : play.doubles,
    undo: null,
  };
}

/** Move off a bankrupt player who has nothing left to resolve. */
export function skipBankruptTurn(
  play: OpolyPlay,
  tokens: Record<string, number>,
  players: PlayPlayer[],
  events: ScoreEvent[],
): PlayOutcome | null {
  if (play.pending || cashOf(events, play.turn) > 0) return null;
  const passed = passTurn(players, play.turn, events);
  if (passed.turn === play.turn) return null;
  return {
    play: { ...play, turn: passed.turn, doubles: 0 },
    tokens,
    events: [],
    note: passed.notes.join(' '),
  };
}

export function turnPrompt(play: OpolyPlay, players: PlayPlayer[], events: ScoreEvent[] = []): string {
  const name = playerName(players, play.turn);
  if (!play.pending && cashOf(events, play.turn) <= 0) return `${name} is bankrupt.`;
  if (play.pending?.kind === 'buy') {
    const property = getProperty(play.pending.propertyId);
    return property
      ? `${name} can buy ${property.name} for ${formatMoney(property.price)}.`
      : `${name}'s turn.`;
  }
  if (play.pending?.kind === 'card') {
    const label = play.pending.deck === 'chance' ? 'Chance' : 'Chest';
    return `${name} drew a ${label} card.`;
  }
  if (play.pending?.kind === 'pay') {
    return `${name} owes ${formatMoney(play.pending.amount)} for ${play.pending.label}.`;
  }
  if (play.jail[play.turn] != null) {
    const spent = play.jail[play.turn] ?? 0;
    const left = 3 - spent;
    return `${name} is in jail. ${left === 1 ? 'One roll left, then pay $50.' : `${left} rolls to throw doubles.`}`;
  }
  if (play.doubles > 0) return `${name} rolled doubles. Roll again.`;
  return `${name}'s turn. Roll the dice.`;
}

export function cashOf(events: ScoreEvent[], playerId: string): number {
  const delta = events.filter((event) => event.playerId === playerId).reduce((sum, event) => sum + event.points, 0);
  return cashFromDelta(delta);
}
