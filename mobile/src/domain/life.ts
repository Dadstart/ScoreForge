import type { Game, Player } from './models';

/**
 * Shared life-track game. The board, careers, houses, and event text are original.
 * A turn spins 1–10. Salary is paid for every payday landed on or passed.
 * Wedding, house, career, graduation, and retirement stop the move.
 * At the end, cash + house + each child. The richest life wins.
 */

export const SPINNER_MAX = 10;
export const STARTING_CASH = 10_000;
export const COLLEGE_TUITION = 50_000;
export const STIPEND = 10_000;
export const TAXES = 15_000;
export const WEDDING_GIFT = 20_000;
export const ANNIVERSARY = 5_000;
export const CHILD_VALUE = 50_000;
export const MAX_CHILDREN = 4;

export const LIFE_COLORS = [
  { id: 'red', name: 'Red', fill: '#d64545', ink: '#fffaf0' },
  { id: 'blue', name: 'Blue', fill: '#2c6adf', ink: '#fffaf0' },
  { id: 'green', name: 'Green', fill: '#1f9a52', ink: '#fffaf0' },
  { id: 'yellow', name: 'Yellow', fill: '#e2b325', ink: '#2a2118' },
  { id: 'purple', name: 'Purple', fill: '#7b4bb8', ink: '#fffaf0' },
  { id: 'orange', name: 'Orange', fill: '#e07a2f', ink: '#1a1408' },
] as const;

export type SpaceKind =
  | 'study'
  | 'payday'
  | 'life'
  | 'baby'
  | 'taxes'
  | 'wedding'
  | 'house'
  | 'career'
  | 'graduate'
  | 'fork'
  | 'retire';

export type TrackSpace = {
  id: string;
  kind: SpaceKind;
  label: string;
  /** Two short lines printed on the space. */
  lines: readonly [string, string];
};

export type Career = {
  id: string;
  name: string;
  salary: number;
  degree: boolean;
};

export type HouseOption = {
  id: string;
  name: string;
  price: number;
};

export type LifeTile = {
  id: string;
  text: string;
  amount: number;
};

export type LifePath = 'choice' | 'college' | 'track' | 'estate' | 'country' | 'retired';

export type PlayerLife = {
  path: LifePath;
  index: number;
  careerId: string | null;
  cash: number;
  spouse: boolean;
  children: number;
  houseId: string | null;
  exit: 'estate' | 'country' | null;
};

export type LifePending =
  | { type: 'career'; reason: 'start' | 'graduate' | 'change'; options: string[] }
  | { type: 'house' }
  | { type: 'fork' };

export type LifeState = {
  players: Record<string, PlayerLife>;
  colors: Record<string, number>;
  currentPlayerId: string;
  deck: string[];
  discard: string[];
  pending: LifePending | null;
  spin: number | null;
  lastAction: string | null;
};

export type LifeAction =
  | { kind: 'college-or-career' }
  | { kind: 'career'; reason: 'start' | 'graduate' | 'change'; options: Career[] }
  | { kind: 'house' }
  | { kind: 'fork' }
  | { kind: 'spin' }
  | { kind: 'done' };

export const COLLEGE: readonly TrackSpace[] = [
  { id: 'campus', kind: 'study', label: 'Campus', lines: ['COLLEGE', 'Stay in school'] },
  { id: 'stipend', kind: 'payday', label: 'Stipend', lines: ['STIPEND', 'Collect $10,000'] },
  { id: 'midterms', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'lab', kind: 'payday', label: 'Stipend', lines: ['STIPEND', 'Collect $10,000'] },
  { id: 'degree', kind: 'graduate', label: 'Degree', lines: ['DEGREE', 'Pick a career'] },
];

export const TRACK: readonly TrackSpace[] = [
  { id: 'pay-1', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'life-1', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'baby-1', kind: 'baby', label: 'Family', lines: ['FAMILY', 'Add a child'] },
  { id: 'pay-2', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'wedding', kind: 'wedding', label: 'Wedding', lines: ['WEDDING', 'Stop to marry'] },
  { id: 'life-2', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'pay-3', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'taxes', kind: 'taxes', label: 'Taxes', lines: ['TAXES', 'Pay $15,000'] },
  { id: 'house', kind: 'house', label: 'House', lines: ['HOUSE', 'Stop and buy'] },
  { id: 'pay-4', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'baby-2', kind: 'baby', label: 'Family', lines: ['FAMILY', 'Add a child'] },
  { id: 'life-3', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'career', kind: 'career', label: 'Career', lines: ['CAREER', 'Stop. New job'] },
  { id: 'pay-5', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'baby-3', kind: 'baby', label: 'Family', lines: ['FAMILY', 'Add a child'] },
  { id: 'life-4', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'pay-6', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'fork', kind: 'fork', label: 'Retire', lines: ['RETIRE', 'Choose a road'] },
];

export const COUNTRY: readonly TrackSpace[] = [
  { id: 'country-pay', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'country-life', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'country-end', kind: 'retire', label: 'Retire', lines: ['RETIRE', 'Count wealth'] },
];

export const ESTATE: readonly TrackSpace[] = [
  { id: 'estate-life', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'estate-pay', kind: 'payday', label: 'Payday', lines: ['PAYDAY', 'Collect salary'] },
  { id: 'estate-life-2', kind: 'life', label: 'Life', lines: ['LIFE', 'Draw a tile'] },
  { id: 'estate-end', kind: 'retire', label: 'Retire', lines: ['RETIRE', 'Count wealth'] },
];

export const CAREERS: readonly Career[] = [
  { id: 'teacher', name: 'Teacher', salary: 40_000, degree: false },
  { id: 'mechanic', name: 'Mechanic', salary: 50_000, degree: false },
  { id: 'artist', name: 'Artist', salary: 30_000, degree: false },
  { id: 'chef', name: 'Chef', salary: 45_000, degree: false },
  { id: 'nurse', name: 'Nurse', salary: 55_000, degree: false },
  { id: 'driver', name: 'Driver', salary: 35_000, degree: false },
  { id: 'doctor', name: 'Doctor', salary: 120_000, degree: true },
  { id: 'lawyer', name: 'Lawyer', salary: 110_000, degree: true },
  { id: 'engineer', name: 'Engineer', salary: 90_000, degree: true },
  { id: 'architect', name: 'Architect', salary: 80_000, degree: true },
  { id: 'scientist', name: 'Scientist', salary: 100_000, degree: true },
  { id: 'accountant', name: 'Accountant', salary: 70_000, degree: true },
];

export const HOUSES: readonly HouseOption[] = [
  { id: 'cottage', name: 'Cottage', price: 60_000 },
  { id: 'family', name: 'Family home', price: 120_000 },
  { id: 'hill', name: 'Hill house', price: 200_000 },
];

export const TILES: readonly LifeTile[] = [
  { id: 'bonus', text: 'A bonus for extra work', amount: 20_000 },
  { id: 'repairs', text: 'The car needs repairs', amount: -10_000 },
  { id: 'wallet', text: 'Cash in an old coat', amount: 5_000 },
  { id: 'trip', text: 'A weekend trip', amount: -8_000 },
  { id: 'stocks', text: 'A small investment pays off', amount: 30_000 },
  { id: 'bill', text: 'An unexpected medical bill', amount: -15_000 },
  { id: 'gig', text: 'A freelance weekend', amount: 12_000 },
  { id: 'roof', text: 'A leaky roof', amount: -12_000 },
  { id: 'refund', text: 'A tax refund', amount: 8_000 },
  { id: 'tickets', text: 'A stack of parking tickets', amount: -3_000 },
  { id: 'relative', text: 'A distant relative left you cash', amount: 40_000 },
  { id: 'donate', text: 'You help a neighbor', amount: -10_000 },
  { id: 'painting', text: 'You sell an old painting', amount: 25_000 },
  { id: 'storm', text: 'Storm damage', amount: -18_000 },
  { id: 'contest', text: 'You win a local contest', amount: 15_000 },
  { id: 'phone', text: 'A broken phone', amount: -2_000 },
];

const STOP_KINDS = new Set<SpaceKind>(['wedding', 'house', 'career', 'graduate', 'fork', 'retire']);
const PATHS = new Set<LifePath>(['choice', 'college', 'track', 'estate', 'country', 'retired']);

export function formatCash(amount: number): string {
  const negative = amount < 0;
  const formatted = Math.abs(Math.trunc(amount)).toLocaleString('en-US');
  return `${negative ? '-' : ''}$${formatted}`;
}

export function getCareer(id: string | null | undefined): Career | undefined {
  return CAREERS.find((career) => career.id === id);
}

export function getHouse(id: string | null | undefined): HouseOption | undefined {
  return HOUSES.find((house) => house.id === id);
}

export function getTile(id: string | null | undefined): LifeTile | undefined {
  return TILES.find((tile) => tile.id === id);
}

export function salaryOf(careerId: string | null): number {
  return getCareer(careerId)?.salary ?? STIPEND;
}

export function netWorth(life: PlayerLife): number {
  return life.cash + (getHouse(life.houseId)?.price ?? 0) + life.children * CHILD_VALUE;
}

export function houseTrade(currentId: string | null, houseId: string): number {
  const next = getHouse(houseId);
  if (!next) return 0;
  return next.price - (getHouse(currentId)?.price ?? 0);
}

export function spacesFor(path: LifePath): readonly TrackSpace[] {
  if (path === 'college') return COLLEGE;
  if (path === 'track') return TRACK;
  if (path === 'estate') return ESTATE;
  if (path === 'country') return COUNTRY;
  return [];
}

export function createLifeState(players: { id: string }[]): LifeState {
  const lives: Record<string, PlayerLife> = {};
  const colors: Record<string, number> = {};
  players.forEach((player, index) => {
    lives[player.id] = freshPlayer();
    colors[player.id] = index % LIFE_COLORS.length;
  });
  return {
    players: lives,
    colors,
    currentPlayerId: players[0]?.id ?? '',
    deck: shuffle(TILES.map((tile) => tile.id)),
    discard: [],
    pending: null,
    spin: null,
    lastAction: null,
  };
}

export function colorIndexFor(state: LifeState, playerId: string): number {
  const color = state.colors[playerId];
  return typeof color === 'number' ? color % LIFE_COLORS.length : 0;
}

export function allRetired(state: LifeState, players: { id: string }[]): boolean {
  return players.length > 0 && players.every((player) => state.players[player.id]?.path === 'retired');
}

export function currentAction(state: LifeState): LifeAction {
  const life = state.players[state.currentPlayerId];
  if (!life || life.path === 'retired') return { kind: 'done' };
  if (state.pending?.type === 'career') {
    return {
      kind: 'career',
      reason: state.pending.reason,
      options: state.pending.options.map((id) => getCareer(id)).filter((career): career is Career => Boolean(career)),
    };
  }
  if (state.pending?.type === 'house') return { kind: 'house' };
  if (state.pending?.type === 'fork') return { kind: 'fork' };
  if (life.path === 'choice') return { kind: 'college-or-career' };
  return { kind: 'spin' };
}

export function chooseCollege(state: LifeState, players: Player[]): LifeState | null {
  const life = state.players[state.currentPlayerId];
  if (!life || life.path !== 'choice' || state.pending) return null;
  const name = playerName(players, state.currentPlayerId);
  return {
    ...state,
    players: {
      ...state.players,
      [state.currentPlayerId]: { ...life, path: 'college', cash: life.cash - COLLEGE_TUITION },
    },
    lastAction: `${name} chooses college and pays ${formatCash(COLLEGE_TUITION)} tuition.`,
  };
}

export function openStarterCareers(state: LifeState, players: Player[]): LifeState | null {
  const life = state.players[state.currentPlayerId];
  if (!life || life.path !== 'choice' || state.pending) return null;
  const name = playerName(players, state.currentPlayerId);
  return {
    ...state,
    pending: { type: 'career', reason: 'start', options: starterIds() },
    lastAction: `${name} looks over starter careers.`,
  };
}

export function chooseCareer(state: LifeState, players: Player[], careerId: string): LifeState | null {
  const pending = state.pending;
  const life = state.players[state.currentPlayerId];
  const career = getCareer(careerId);
  if (!pending || pending.type !== 'career' || !life || !career) return null;
  const keeping = careerId === life.careerId;
  if (!keeping && !pending.options.includes(careerId)) return null;
  if (pending.reason === 'graduate' && !career.degree) return null;
  if (pending.reason === 'start' && career.degree) return null;

  let next: PlayerLife = { ...life, careerId };
  if (pending.reason === 'start' || pending.reason === 'graduate') {
    next = { ...next, path: 'track', index: -1 };
  }
  const name = playerName(players, state.currentPlayerId);
  const note = keeping
    ? `${name} keeps ${career.name}.`
    : `${name} takes ${career.name}, ${formatCash(career.salary)} each payday.`;
  const playersNext = { ...state.players, [state.currentPlayerId]: next };
  return {
    ...state,
    players: playersNext,
    pending: null,
    currentPlayerId:
      pending.reason === 'start'
        ? state.currentPlayerId
        : advance(state.currentPlayerId, players, playersNext),
    lastAction: note,
  };
}

export function chooseHouse(state: LifeState, players: Player[], houseId: string): LifeState | null {
  const life = state.players[state.currentPlayerId];
  const house = getHouse(houseId);
  if (!life || state.pending?.type !== 'house' || !house) return null;
  const trade = houseTrade(life.houseId, houseId);
  const next: PlayerLife = { ...life, houseId, cash: life.cash - trade };
  const name = playerName(players, state.currentPlayerId);
  const note =
    trade > 0
      ? `${name} buys the ${house.name} for ${formatCash(trade)}.`
      : trade < 0
        ? `${name} moves to the ${house.name} and receives ${formatCash(-trade)}.`
        : `${name} keeps the ${house.name}.`;
  const playersNext = { ...state.players, [state.currentPlayerId]: next };
  return {
    ...state,
    players: playersNext,
    pending: null,
    currentPlayerId: advance(state.currentPlayerId, players, playersNext),
    lastAction: note,
  };
}

export function chooseRetirement(
  state: LifeState,
  players: Player[],
  path: 'estate' | 'country',
): LifeState | null {
  const life = state.players[state.currentPlayerId];
  if (!life || state.pending?.type !== 'fork') return null;
  const next: PlayerLife = { ...life, path, index: -1, exit: path };
  const name = playerName(players, state.currentPlayerId);
  const label = path === 'estate' ? 'city estate' : 'country lane';
  const playersNext = { ...state.players, [state.currentPlayerId]: next };
  return {
    ...state,
    players: playersNext,
    pending: null,
    currentPlayerId: advance(state.currentPlayerId, players, playersNext),
    lastAction: `${name} heads for the ${label}.`,
  };
}

export function spin(state: LifeState, players: Player[]): LifeState | null {
  return spinValue(state, players, 1 + Math.floor(Math.random() * SPINNER_MAX));
}

export function spinValue(state: LifeState, players: Player[], steps: number): LifeState | null {
  const life = state.players[state.currentPlayerId];
  if (!life || state.pending || life.path === 'choice' || life.path === 'retired') return null;
  if (!Number.isInteger(steps) || steps < 1 || steps > SPINNER_MAX) return null;
  const name = playerName(players, state.currentPlayerId);
  const moved = travel(life, state.deck, state.discard, steps);
  const playersNext = { ...state.players, [state.currentPlayerId]: moved.life };
  const detail = moved.notes.length ? ` ${moved.notes.join(' · ')}.` : '';
  return {
    ...state,
    players: playersNext,
    deck: moved.deck,
    discard: moved.discard,
    pending: moved.pending,
    spin: steps,
    currentPlayerId: moved.pending
      ? state.currentPlayerId
      : advance(state.currentPlayerId, players, playersNext),
    lastAction: `${name} spins ${steps}.${detail}`,
  };
}

export function ensureLifeState(game: Game): Game {
  if (game.templateId !== 'life') return game;
  if (game.life && isHealthy(game.life, game.players)) return game;
  return { ...game, life: repairLifeState(game) };
}

function travel(
  life: PlayerLife,
  deck: string[],
  discard: string[],
  steps: number,
): {
  life: PlayerLife;
  deck: string[];
  discard: string[];
  pending: LifePending | null;
  notes: string[];
} {
  let path = life.path;
  let index = life.index;
  let cash = life.cash;
  let spouse = life.spouse;
  let children = life.children;
  let careerId = life.careerId;
  let stepsLeft = steps;
  let pending: LifePending | null = null;
  const notes: string[] = [];

  while (stepsLeft > 0 && !pending && path !== 'retired' && path !== 'choice') {
    const spaces = spacesFor(path);
    const nextIndex = index + 1;
    if (nextIndex >= spaces.length) {
      if (path === 'college') {
        pending = { type: 'career', reason: 'graduate', options: degreeIds() };
        notes.push('Graduation');
      } else if (path === 'estate' || path === 'country') {
        path = 'retired';
        index = -1;
        notes.push('Retired');
      }
      break;
    }

    const space = spaces[nextIndex];
    index = nextIndex;
    stepsLeft -= 1;

    if (space.kind === 'payday') {
      const pay = salaryOf(careerId);
      cash += pay;
      notes.push(`${careerId ? 'Payday' : 'Stipend'} ${formatCash(pay)}`);
    }

    if (STOP_KINDS.has(space.kind)) stepsLeft = 0;
    if (stepsLeft > 0) continue;

    if (space.kind === 'wedding') {
      if (!spouse) {
        spouse = true;
        cash += WEDDING_GIFT;
        notes.push(`Wedding gifts ${signedCash(WEDDING_GIFT)}`);
      } else {
        cash += ANNIVERSARY;
        notes.push(`Anniversary ${signedCash(ANNIVERSARY)}`);
      }
    } else if (space.kind === 'house') {
      pending = { type: 'house' };
      notes.push('Stop to buy a house');
    } else if (space.kind === 'career') {
      pending = { type: 'career', reason: 'change', options: changeOptions(careerId) };
      notes.push('Career crossroads');
    } else if (space.kind === 'graduate') {
      pending = { type: 'career', reason: 'graduate', options: degreeIds() };
      notes.push('Graduation');
    } else if (space.kind === 'fork') {
      pending = { type: 'fork' };
      notes.push('Choose a retirement path');
    } else if (space.kind === 'retire') {
      path = 'retired';
      index = -1;
      notes.push('Retired');
    } else if (space.kind === 'life') {
      const drawn = drawTile(deck, discard);
      deck = drawn.deck;
      discard = [...drawn.discard, drawn.id];
      const tile = getTile(drawn.id);
      if (tile) {
        cash += tile.amount;
        notes.push(`${tile.text} (${signedCash(tile.amount)})`);
      }
    } else if (space.kind === 'baby') {
      if (children < MAX_CHILDREN) {
        children += 1;
        if (!spouse) {
          spouse = true;
          notes.push('A family begins');
        } else {
          notes.push(children === 1 ? 'A first child' : 'A new child');
        }
      } else {
        notes.push('The car is full');
      }
    } else if (space.kind === 'taxes') {
      cash -= TAXES;
      notes.push(`Taxes ${signedCash(-TAXES)}`);
    } else if (space.kind === 'study') {
      notes.push(space.label);
    }
  }

  return {
    life: {
      ...life,
      path,
      index,
      cash,
      spouse,
      children,
      careerId,
    },
    deck,
    discard,
    pending,
    notes,
  };
}

function drawTile(deck: string[], discard: string[]): { id: string; deck: string[]; discard: string[] } {
  let nextDeck = deck.filter(isTileId);
  let nextDiscard = discard.filter(isTileId);
  if (nextDeck.length === 0) {
    nextDeck = shuffle(nextDiscard.length > 0 ? nextDiscard : TILES.map((tile) => tile.id));
    nextDiscard = [];
  }
  const id = nextDeck[nextDeck.length - 1] ?? TILES[0].id;
  return { id, deck: nextDeck.slice(0, -1), discard: nextDiscard };
}

function advance(currentId: string, roster: Player[], lives: Record<string, PlayerLife>): string {
  if (roster.length === 0) return currentId;
  let index = roster.findIndex((player) => player.id === currentId);
  for (let step = 0; step < roster.length; step++) {
    index = (index + 1) % roster.length;
    const id = roster[index]?.id;
    if (id && lives[id] && lives[id].path !== 'retired') return id;
  }
  return currentId;
}

function freshPlayer(): PlayerLife {
  return {
    path: 'choice',
    index: -1,
    careerId: null,
    cash: STARTING_CASH,
    spouse: false,
    children: 0,
    houseId: null,
    exit: null,
  };
}

function starterIds(): string[] {
  return CAREERS.filter((career) => !career.degree).map((career) => career.id);
}

function degreeIds(): string[] {
  return CAREERS.filter((career) => career.degree).map((career) => career.id);
}

function changeOptions(currentId: string | null): string[] {
  const pool = CAREERS.map((career) => career.id).filter((id) => id !== currentId);
  const picked = shuffle(pool).slice(0, 3);
  return picked.length > 0 ? picked : pool.slice(0, 3);
}

function playerName(players: Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? 'Player';
}

function signedCash(amount: number): string {
  if (amount > 0) return `+${formatCash(amount)}`;
  return formatCash(amount);
}

function isTileId(value: unknown): value is string {
  return typeof value === 'string' && TILES.some((tile) => tile.id === value);
}

function isCareerId(value: unknown, degree?: boolean): value is string {
  const career = typeof value === 'string' ? getCareer(value) : undefined;
  if (!career) return false;
  if (degree == null) return true;
  return career.degree === degree;
}

function isPlayerLife(value: unknown): value is PlayerLife {
  if (!value || typeof value !== 'object') return false;
  const life = value as PlayerLife;
  if (!PATHS.has(life.path)) return false;
  if (!Number.isInteger(life.index)) return false;
  const spaces = spacesFor(life.path);
  if (life.path === 'choice' || life.path === 'retired') {
    if (life.index !== -1) return false;
  } else if (life.index < -1 || life.index >= spaces.length) {
    return false;
  }
  if (!Number.isFinite(life.cash) || !Number.isInteger(life.children)) return false;
  if (life.children < 0 || life.children > MAX_CHILDREN) return false;
  if (typeof life.spouse !== 'boolean') return false;
  if (life.careerId != null && !isCareerId(life.careerId)) return false;
  if (life.houseId != null && !getHouse(life.houseId)) return false;
  if (life.exit != null && life.exit !== 'estate' && life.exit !== 'country') return false;
  return true;
}

function isPending(value: unknown): value is LifePending {
  if (!value || typeof value !== 'object') return false;
  const pending = value as LifePending;
  if (pending.type === 'house' || pending.type === 'fork') return true;
  if (pending.type !== 'career' || !Array.isArray(pending.options) || pending.options.length === 0) return false;
  if (pending.reason !== 'start' && pending.reason !== 'graduate' && pending.reason !== 'change') return false;
  const degree = pending.reason === 'graduate' ? true : pending.reason === 'start' ? false : undefined;
  return pending.options.every((id) => isCareerId(id, degree));
}

function isHealthy(state: LifeState, players: Player[]): boolean {
  if (!state.players || !state.colors) return false;
  if (!Array.isArray(state.deck) || !Array.isArray(state.discard)) return false;
  if (!state.deck.every(isTileId) || !state.discard.every(isTileId)) return false;
  if (state.pending != null && !isPending(state.pending)) return false;
  if (state.spin != null && (!Number.isInteger(state.spin) || state.spin < 1 || state.spin > SPINNER_MAX)) {
    return false;
  }
  if (state.lastAction != null && typeof state.lastAction !== 'string') return false;
  const ids = new Set(players.map((player) => player.id));
  if (Object.keys(state.players).some((id) => !ids.has(id))) return false;
  for (const player of players) {
    if (!isPlayerLife(state.players[player.id])) return false;
    if (typeof state.colors[player.id] !== 'number') return false;
  }
  if (players.length > 0 && !ids.has(state.currentPlayerId)) return false;
  const current = state.players[state.currentPlayerId];
  if (current?.path === 'retired' && players.some((player) => state.players[player.id]?.path !== 'retired')) {
    return false;
  }
  return true;
}

function repairLifeState(game: Game): LifeState {
  const previous = game.life;
  const base = previous ?? createLifeState(game.players);
  const players: Record<string, PlayerLife> = {};
  const colors: Record<string, number> = {};
  const used: number[] = [];
  for (const player of game.players) {
    const existing = base.players?.[player.id];
    players[player.id] = existing && isPlayerLife(existing) ? existing : freshPlayer();
    const color = base.colors?.[player.id];
    const assigned =
      typeof color === 'number' && Number.isInteger(color)
        ? ((color % LIFE_COLORS.length) + LIFE_COLORS.length) % LIFE_COLORS.length
        : nextColor(used);
    colors[player.id] = assigned;
    used.push(assigned);
  }
  const pending = base.pending && isPending(base.pending) ? base.pending : null;
  const previousCurrent = typeof base.currentPlayerId === 'string' ? base.currentPlayerId : '';
  let currentPlayerId = previousCurrent;
  const current = players[currentPlayerId];
  if (!current || current.path === 'retired') {
    currentPlayerId =
      game.players.find((player) => players[player.id]?.path !== 'retired')?.id ??
      game.players[0]?.id ??
      '';
  }
  const deck = Array.isArray(base.deck) ? base.deck.filter(isTileId) : [];
  return {
    players,
    colors,
    currentPlayerId,
    deck: deck.length > 0 || (Array.isArray(base.discard) && base.discard.some(isTileId)) ? deck : shuffle(TILES.map((tile) => tile.id)),
    discard: Array.isArray(base.discard) ? base.discard.filter(isTileId) : [],
    pending: currentPlayerId === previousCurrent && players[currentPlayerId] ? pending : null,
    spin: typeof base.spin === 'number' && base.spin >= 1 && base.spin <= SPINNER_MAX ? Math.trunc(base.spin) : null,
    lastAction: typeof base.lastAction === 'string' ? base.lastAction : null,
  };
}

function nextColor(used: number[]): number {
  for (let index = 0; index < LIFE_COLORS.length; index++) {
    if (!used.includes(index)) return index;
  }
  return used.length % LIFE_COLORS.length;
}

function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const swap = next[index];
    next[index] = next[swapIndex] as T;
    next[swapIndex] = swap as T;
  }
  return next;
}
