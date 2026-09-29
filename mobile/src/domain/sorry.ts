import type { Game, Player } from './models';

/**
 * Pawn race with a 60-space track, safety lanes, and a 45-card deck.
 * Board geometry is original; the turn rules follow the familiar public card effects.
 *
 * Each color owns 15 clockwise spaces. Pawns leave Start at local 4, slide on the
 * triangles at local 1 (4 spaces) and local 9 (5 spaces), and turn into a 5-space
 * safety lane instead of landing on local 2.
 */

export const TRACK_SPACES = 60;
export const SIDE_SPACES = 15;
export const SAFETY_SPACES = 5;
export const PAWNS_PER_PLAYER = 4;

export const SORRY_COLORS = [
  { id: 'red', name: 'Red', fill: '#d64545', soft: '#f8d6d6', ink: '#fffaf0' },
  { id: 'blue', name: 'Blue', fill: '#2c6adf', soft: '#d5e3fb', ink: '#fffaf0' },
  { id: 'yellow', name: 'Yellow', fill: '#e2b325', soft: '#f8ecc4', ink: '#2a2118' },
  { id: 'green', name: 'Green', fill: '#1f9a52', soft: '#d3f0df', ink: '#fffaf0' },
] as const;

export type CardKind = 1 | 2 | 3 | 4 | 5 | 7 | 8 | 10 | 11 | 12 | 'sorry';

export type PawnSpot =
  | { zone: 'start' }
  | { zone: 'track'; index: number }
  | { zone: 'safety'; index: number }
  | { zone: 'home' };

export type SorryMove =
  | { type: 'start'; pawn: number }
  | { type: 'forward'; pawn: number; steps: number }
  | { type: 'backward'; pawn: number; steps: number }
  | { type: 'split'; pawn: number; steps: number; pawn2: number; steps2: number }
  | { type: 'switch'; pawn: number; targetPlayerId: string; targetPawn: number }
  | { type: 'sorry'; pawn: number; targetPlayerId: string; targetPawn: number };

export type SorryState = {
  pawns: Record<string, PawnSpot[]>;
  colors: Record<string, number>;
  deck: CardKind[];
  discard: CardKind[];
  currentPlayerId: string;
  drawn: CardKind | null;
  winnerId: string | null;
  lastAction: string | null;
};

export type SlideSpan = { colorIndex: number; start: number; end: number };

const CARD_RANKS: readonly CardKind[] = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 'sorry'];

export function startExit(colorIndex: number): number {
  return colorIndex * SIDE_SPACES + 4;
}

export function safetyGate(colorIndex: number): number {
  return colorIndex * SIDE_SPACES + 2;
}

export function slideSpans(): SlideSpan[] {
  const spans: SlideSpan[] = [];
  for (let colorIndex = 0; colorIndex < SORRY_COLORS.length; colorIndex++) {
    const base = colorIndex * SIDE_SPACES;
    spans.push({ colorIndex, start: base + 1, end: base + 4 });
    spans.push({ colorIndex, start: base + 9, end: base + 13 });
  }
  return spans;
}

export function cardInfo(card: CardKind): { title: string; detail: string } {
  switch (card) {
    case 1:
      return { title: '1', detail: 'Leave Start, or move forward 1.' };
    case 2:
      return { title: '2', detail: 'Leave Start, or move forward 2. Then draw again.' };
    case 3:
      return { title: '3', detail: 'Move forward 3.' };
    case 4:
      return { title: '4', detail: 'Move backward 4. Backward moves do not slide.' };
    case 5:
      return { title: '5', detail: 'Move forward 5.' };
    case 7:
      return { title: '7', detail: 'Move forward 7, or split it between two pawns.' };
    case 8:
      return { title: '8', detail: 'Move forward 8.' };
    case 10:
      return { title: '10', detail: 'Move forward 10, or move backward 1.' };
    case 11:
      return { title: '11', detail: 'Move forward 11, or switch with an opponent on the track.' };
    case 12:
      return { title: '12', detail: 'Move forward 12.' };
    case 'sorry':
      return {
        title: 'Sorry',
        detail: 'From Start, bump an opponent on the track and take their space.',
      };
  }
}

export function createSorryState(players: { id: string }[]): SorryState {
  const pawns: Record<string, PawnSpot[]> = {};
  const colors: Record<string, number> = {};
  players.forEach((player, index) => {
    pawns[player.id] = pawnsAtStart();
    colors[player.id] = index % SORRY_COLORS.length;
  });
  return {
    pawns,
    colors,
    deck: shuffledDeck(),
    discard: [],
    currentPlayerId: players[0]?.id ?? '',
    drawn: null,
    winnerId: null,
    lastAction: null,
  };
}

export function homeCount(state: SorryState, playerId: string): number {
  return (state.pawns[playerId] ?? []).filter((spot) => spot.zone === 'home').length;
}

export function colorIndexFor(state: SorryState, playerId: string): number {
  const color = state.colors[playerId];
  return typeof color === 'number' ? color % SORRY_COLORS.length : 0;
}

export function drawCard(state: SorryState): SorryState | null {
  if (state.drawn || state.winnerId) return null;
  let deck = [...state.deck];
  let discard = [...state.discard];
  if (deck.length === 0) {
    if (discard.length === 0) return null;
    deck = shuffle(discard);
    discard = [];
  }
  const drawn = deck[deck.length - 1];
  if (!isCard(drawn)) return null;
  return {
    ...state,
    deck: deck.slice(0, -1),
    discard,
    drawn,
  };
}

export function legalMoves(state: SorryState, players: Player[]): SorryMove[] {
  if (!state.drawn || state.winnerId) return [];
  const playerId = state.currentPlayerId;
  if (!players.some((player) => player.id === playerId)) return [];
  const moves: SorryMove[] = [];
  const consider = (move: SorryMove) => {
    if (cardAllows(state.drawn as CardKind, move) && resolveMove(state, move)) moves.push(move);
  };

  for (let pawn = 0; pawn < PAWNS_PER_PLAYER; pawn++) {
    consider({ type: 'start', pawn });
    for (const steps of [1, 2, 3, 5, 7, 8, 10, 11, 12]) {
      consider({ type: 'forward', pawn, steps });
    }
    consider({ type: 'backward', pawn, steps: 1 });
    consider({ type: 'backward', pawn, steps: 4 });
    for (const opponent of players) {
      if (opponent.id === playerId) continue;
      for (let targetPawn = 0; targetPawn < PAWNS_PER_PLAYER; targetPawn++) {
        consider({ type: 'switch', pawn, targetPlayerId: opponent.id, targetPawn });
        consider({ type: 'sorry', pawn, targetPlayerId: opponent.id, targetPawn });
      }
    }
  }

  if (state.drawn === 7) {
    for (let pawn = 0; pawn < PAWNS_PER_PLAYER; pawn++) {
      for (let pawn2 = 0; pawn2 < PAWNS_PER_PLAYER; pawn2++) {
        if (pawn === pawn2) continue;
        for (let steps = 1; steps <= 6; steps++) {
          consider({ type: 'split', pawn, steps, pawn2, steps2: 7 - steps });
        }
      }
    }
  }

  return moves;
}

export function describeMove(players: Player[], move: SorryMove): string {
  const pawnName = (index: number) => `pawn ${index + 1}`;
  const owner = (id: string) => players.find((player) => player.id === id)?.name ?? 'Opponent';
  switch (move.type) {
    case 'start':
      return `Move ${pawnName(move.pawn)} out of Start`;
    case 'forward':
      return `Move ${pawnName(move.pawn)} forward ${move.steps}`;
    case 'backward':
      return `Move ${pawnName(move.pawn)} back ${move.steps}`;
    case 'split':
      return `Move ${pawnName(move.pawn)} forward ${move.steps}, then ${pawnName(move.pawn2)} forward ${move.steps2}`;
    case 'switch':
      return `Switch ${pawnName(move.pawn)} with ${owner(move.targetPlayerId)}'s ${pawnName(move.targetPawn)}`;
    case 'sorry':
      return `Sorry — replace ${owner(move.targetPlayerId)}'s ${pawnName(move.targetPawn)}`;
    default: {
      const unreachable: never = move;
      return unreachable;
    }
  }
}

export function playMove(
  state: SorryState,
  players: Player[],
  move: SorryMove,
  target: number,
): SorryState | null {
  if (!state.drawn || state.winnerId) return null;
  const pawns = resolveMove(state, move);
  if (!pawns) return null;
  const card = state.drawn;
  const actor = players.find((player) => player.id === state.currentPlayerId);
  const won = countHome(pawns, state.currentPlayerId) >= Math.max(1, target);
  const drawAgain = card === 2 && !won;
  return {
    ...state,
    pawns,
    drawn: null,
    discard: [...state.discard, card],
    currentPlayerId:
      won || drawAgain ? state.currentPlayerId : nextPlayerId(players, state.currentPlayerId),
    winnerId: won ? state.currentPlayerId : null,
    lastAction: `${actor?.name ?? 'Player'}: ${describeMove(players, move)}${drawAgain ? ' Draw again.' : ''}`,
  };
}

export function passTurn(state: SorryState, players: Player[]): SorryState | null {
  if (!state.drawn || state.winnerId) return null;
  if (legalMoves(state, players).length > 0) return null;
  const actor = players.find((player) => player.id === state.currentPlayerId);
  return {
    ...state,
    drawn: null,
    discard: [...state.discard, state.drawn],
    currentPlayerId: nextPlayerId(players, state.currentPlayerId),
    lastAction: `${actor?.name ?? 'Player'} cannot use this card.`,
  };
}

export function ensureSorryState(game: Game): Game {
  if (game.templateId !== 'sorry') return game;
  if (game.sorry && isHealthy(game.sorry, game.players)) return game;
  return { ...game, sorry: repairSorryState(game) };
}

function pawnsAtStart(): PawnSpot[] {
  return Array.from({ length: PAWNS_PER_PLAYER }, () => ({ zone: 'start' as const }));
}

function shuffledDeck(): CardKind[] {
  const deck: CardKind[] = [];
  for (let i = 0; i < 5; i++) deck.push(1);
  for (const rank of [2, 3, 4, 5, 7, 8, 10, 11, 12] as const) {
    for (let i = 0; i < 4; i++) deck.push(rank);
  }
  for (let i = 0; i < 4; i++) deck.push('sorry');
  return shuffle(deck);
}

function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  return next;
}

function isCard(value: unknown): value is CardKind {
  return CARD_RANKS.some((rank) => rank === value);
}

function nextPlayerId(players: { id: string }[], current: string): string {
  if (players.length === 0) return current;
  const index = players.findIndex((player) => player.id === current);
  const start = index < 0 ? 0 : index + 1;
  return players[start % players.length].id;
}

function countHome(pawns: Record<string, PawnSpot[]>, playerId: string): number {
  return (pawns[playerId] ?? []).filter((spot) => spot.zone === 'home').length;
}

function cardAllows(card: CardKind, move: SorryMove): boolean {
  switch (card) {
    case 1:
      return move.type === 'start' || (move.type === 'forward' && move.steps === 1);
    case 2:
      return move.type === 'start' || (move.type === 'forward' && move.steps === 2);
    case 3:
      return move.type === 'forward' && move.steps === 3;
    case 4:
      return move.type === 'backward' && move.steps === 4;
    case 5:
      return move.type === 'forward' && move.steps === 5;
    case 7:
      return (move.type === 'forward' && move.steps === 7) || move.type === 'split';
    case 8:
      return move.type === 'forward' && move.steps === 8;
    case 10:
      return (
        (move.type === 'forward' && move.steps === 10) ||
        (move.type === 'backward' && move.steps === 1)
      );
    case 11:
      return (move.type === 'forward' && move.steps === 11) || move.type === 'switch';
    case 12:
      return move.type === 'forward' && move.steps === 12;
    case 'sorry':
      return move.type === 'sorry';
    default:
      return false;
  }
}

function resolveMove(state: SorryState, move: SorryMove): Record<string, PawnSpot[]> | null {
  if (!state.drawn || !cardAllows(state.drawn, move)) return null;
  const playerId = state.currentPlayerId;
  const mine = state.pawns[playerId];
  if (!mine || move.pawn < 0 || move.pawn >= mine.length) return null;
  const colorIndex = colorIndexFor(state, playerId);

  switch (move.type) {
    case 'start': {
      if (mine[move.pawn].zone !== 'start') return null;
      return place(
        state.pawns,
        playerId,
        colorIndex,
        move.pawn,
        { zone: 'track', index: startExit(colorIndex) },
        true,
      );
    }
    case 'forward':
    case 'backward': {
      const dest = destination(
        mine[move.pawn],
        move.steps,
        colorIndex,
        move.type === 'forward' ? 'forward' : 'backward',
      );
      if (!dest) return null;
      return place(state.pawns, playerId, colorIndex, move.pawn, dest, move.type === 'forward');
    }
    case 'split': {
      if (move.pawn === move.pawn2 || move.steps < 1 || move.steps2 < 1) return null;
      if (move.steps + move.steps2 !== 7) return null;
      if (move.pawn2 < 0 || move.pawn2 >= mine.length) return null;
      const first = destination(mine[move.pawn], move.steps, colorIndex, 'forward');
      if (!first) return null;
      const mid = place(state.pawns, playerId, colorIndex, move.pawn, first, true);
      if (!mid) return null;
      const second = destination(mid[playerId][move.pawn2], move.steps2, colorIndex, 'forward');
      if (!second) return null;
      return place(mid, playerId, colorIndex, move.pawn2, second, true);
    }
    case 'switch': {
      if (move.targetPlayerId === playerId) return null;
      const mineSpot = mine[move.pawn];
      const theirs = state.pawns[move.targetPlayerId]?.[move.targetPawn];
      if (mineSpot.zone !== 'track' || !theirs || theirs.zone !== 'track') return null;
      const next = clonePawns(state.pawns);
      const fromIndex = mineSpot.index;
      next[playerId][move.pawn] = { zone: 'start' };
      next[move.targetPlayerId][move.targetPawn] = { zone: 'track', index: fromIndex };
      return place(
        next,
        playerId,
        colorIndex,
        move.pawn,
        { zone: 'track', index: theirs.index },
        false,
      );
    }
    case 'sorry': {
      if (move.targetPlayerId === playerId) return null;
      if (mine[move.pawn].zone !== 'start') return null;
      const theirs = state.pawns[move.targetPlayerId]?.[move.targetPawn];
      if (!theirs || theirs.zone !== 'track') return null;
      const next = clonePawns(state.pawns);
      next[move.targetPlayerId][move.targetPawn] = { zone: 'start' };
      return place(
        next,
        playerId,
        colorIndex,
        move.pawn,
        { zone: 'track', index: theirs.index },
        false,
      );
    }
    default: {
      const unreachable: never = move;
      return unreachable;
    }
  }
}

function destination(
  spot: PawnSpot,
  steps: number,
  colorIndex: number,
  direction: 'forward' | 'backward',
): PawnSpot | null {
  if (!Number.isInteger(steps) || steps <= 0) return null;
  if (direction === 'backward') {
    if (spot.zone !== 'track') return null;
    return { zone: 'track', index: (spot.index - steps + TRACK_SPACES) % TRACK_SPACES };
  }
  if (spot.zone === 'safety') return alongSafety(spot.index, steps);
  if (spot.zone !== 'track') return null;
  const gate = safetyGate(colorIndex);
  if (spot.index === gate) return alongSafety(0, steps - 1);
  let cursor = spot.index;
  for (let step = 1; step <= steps; step++) {
    const next = (cursor + 1) % TRACK_SPACES;
    if (next === gate) return alongSafety(0, steps - step);
    cursor = next;
  }
  return { zone: 'track', index: cursor };
}

function alongSafety(index: number, steps: number): PawnSpot | null {
  if (steps < 0) return null;
  const next = index + steps;
  if (next < SAFETY_SPACES) return { zone: 'safety', index: next };
  if (next === SAFETY_SPACES) return { zone: 'home' };
  return null;
}

function place(
  pawns: Record<string, PawnSpot[]>,
  playerId: string,
  colorIndex: number,
  pawnIndex: number,
  dest: PawnSpot,
  allowSlide: boolean,
): Record<string, PawnSpot[]> | null {
  if (!pawns[playerId]?.[pawnIndex]) return null;
  const next = clonePawns(pawns);
  next[playerId][pawnIndex] = { zone: 'start' };

  let landing = dest;
  if (landing.zone === 'track' && landing.index === safetyGate(colorIndex)) {
    landing = { zone: 'safety', index: 0 };
  }

  if (landing.zone === 'home') {
    next[playerId][pawnIndex] = { zone: 'home' };
    return next;
  }

  if (landing.zone === 'safety') {
    const blocked = next[playerId].some(
      (spot, index) =>
        index !== pawnIndex && spot.zone === 'safety' && spot.index === landing.index,
    );
    if (blocked) return null;
    next[playerId][pawnIndex] = landing;
    return next;
  }

  if (landing.zone !== 'track') return null;

  const slide = allowSlide ? slideSpans().find((span) => span.start === landing.index) : undefined;
  if (slide && slide.colorIndex !== colorIndex) {
    for (let index = slide.start; index <= slide.end; index++) clearTrack(next, index);
    next[playerId][pawnIndex] = { zone: 'track', index: slide.end };
    return next;
  }

  const occupant = findTrack(next, landing.index);
  if (occupant) {
    if (occupant.playerId === playerId) return null;
    next[occupant.playerId][occupant.pawnIndex] = { zone: 'start' };
  }
  next[playerId][pawnIndex] = { zone: 'track', index: landing.index };
  return next;
}

function clearTrack(pawns: Record<string, PawnSpot[]>, index: number) {
  for (const spots of Object.values(pawns)) {
    for (let pawnIndex = 0; pawnIndex < spots.length; pawnIndex++) {
      const spot = spots[pawnIndex];
      if (spot.zone === 'track' && spot.index === index) spots[pawnIndex] = { zone: 'start' };
    }
  }
}

function findTrack(
  pawns: Record<string, PawnSpot[]>,
  index: number,
): { playerId: string; pawnIndex: number } | null {
  for (const [playerId, spots] of Object.entries(pawns)) {
    for (let pawnIndex = 0; pawnIndex < spots.length; pawnIndex++) {
      const spot = spots[pawnIndex];
      if (spot.zone === 'track' && spot.index === index) return { playerId, pawnIndex };
    }
  }
  return null;
}

function clonePawns(pawns: Record<string, PawnSpot[]>): Record<string, PawnSpot[]> {
  const next: Record<string, PawnSpot[]> = {};
  for (const [playerId, spots] of Object.entries(pawns)) {
    next[playerId] = spots.map((spot) => ({ ...spot }));
  }
  return next;
}

function spotIndex(spot: PawnSpot): number | undefined {
  return spot.zone === 'track' || spot.zone === 'safety' ? spot.index : undefined;
}

function cleanSpot(value: unknown): PawnSpot {
  if (!value || typeof value !== 'object') return { zone: 'start' };
  const spot = value as Partial<PawnSpot>;
  if (spot.zone === 'home') return { zone: 'home' };
  if (spot.zone === 'start') return { zone: 'start' };
  if (
    spot.zone === 'track' &&
    typeof spot.index === 'number' &&
    Number.isInteger(spot.index) &&
    spot.index >= 0 &&
    spot.index < TRACK_SPACES
  ) {
    return { zone: 'track', index: spot.index };
  }
  if (
    spot.zone === 'safety' &&
    typeof spot.index === 'number' &&
    Number.isInteger(spot.index) &&
    spot.index >= 0 &&
    spot.index < SAFETY_SPACES
  ) {
    return { zone: 'safety', index: spot.index };
  }
  return { zone: 'start' };
}

function isHealthy(state: SorryState, players: Player[]): boolean {
  if (!players.length || !players.some((player) => player.id === state.currentPlayerId)) return false;
  if (state.winnerId != null && !players.some((player) => player.id === state.winnerId)) return false;
  if (state.drawn != null && !isCard(state.drawn)) return false;
  if (state.lastAction != null && typeof state.lastAction !== 'string') return false;
  if (!Array.isArray(state.deck) || !state.deck.every(isCard)) return false;
  if (!Array.isArray(state.discard) || !state.discard.every(isCard)) return false;

  const used = new Set<number>();
  const tracks = new Set<number>();
  for (const player of players) {
    const spots = state.pawns[player.id];
    const color = state.colors[player.id];
    if (!spots || spots.length !== PAWNS_PER_PLAYER) return false;
    if (typeof color !== 'number' || color < 0 || color >= SORRY_COLORS.length || used.has(color)) {
      return false;
    }
    used.add(color);
    const safety = new Set<number>();
    for (const spot of spots) {
      const clean = cleanSpot(spot);
      if (clean.zone !== spot.zone || spotIndex(clean) !== spotIndex(spot)) return false;
      if (clean.zone === 'track') {
        if (tracks.has(clean.index)) return false;
        tracks.add(clean.index);
      }
      if (clean.zone === 'safety') {
        if (safety.has(clean.index)) return false;
        safety.add(clean.index);
      }
    }
  }
  for (const id of Object.keys(state.pawns)) {
    if (!players.some((player) => player.id === id)) return false;
  }
  return true;
}

function repairSorryState(game: Game): SorryState {
  const previous = game.sorry;
  const pawns: Record<string, PawnSpot[]> = {};
  const colors: Record<string, number> = {};
  const used = new Set<number>();

  for (const player of game.players) {
    const existing = previous?.pawns[player.id];
    pawns[player.id] = existing
      ? Array.from({ length: PAWNS_PER_PLAYER }, (_, index) => cleanSpot(existing[index]))
      : pawnsAtStart();
    const prior = previous?.colors[player.id];
    if (typeof prior === 'number' && prior >= 0 && prior < SORRY_COLORS.length && !used.has(prior)) {
      colors[player.id] = prior;
      used.add(prior);
    }
  }
  for (const player of game.players) {
    if (colors[player.id] != null) continue;
    let next = 0;
    while (used.has(next) && next < SORRY_COLORS.length) next++;
    colors[player.id] = next % SORRY_COLORS.length;
    used.add(colors[player.id]);
  }

  const tracks = new Set<number>();
  for (const player of game.players) {
    const safety = new Set<number>();
    pawns[player.id] = pawns[player.id].map((spot) => {
      if (spot.zone === 'track') {
        if (tracks.has(spot.index)) return { zone: 'start' };
        tracks.add(spot.index);
      }
      if (spot.zone === 'safety') {
        if (safety.has(spot.index)) return { zone: 'start' };
        safety.add(spot.index);
      }
      return spot;
    });
  }

  const deck = (previous?.deck ?? []).filter(isCard);
  const discard = (previous?.discard ?? []).filter(isCard);
  let currentPlayerId = previous?.currentPlayerId ?? '';
  let drawn = previous?.drawn && isCard(previous.drawn) ? previous.drawn : null;
  if (!game.players.some((player) => player.id === currentPlayerId)) {
    currentPlayerId = game.players[0]?.id ?? '';
    if (drawn) {
      discard.push(drawn);
      drawn = null;
    }
  }
  const winnerId =
    previous?.winnerId && game.players.some((player) => player.id === previous.winnerId)
      ? previous.winnerId
      : null;

  return {
    pawns,
    colors,
    deck: deck.length + discard.length + (drawn ? 1 : 0) > 0 ? deck : shuffledDeck(),
    discard: deck.length + discard.length + (drawn ? 1 : 0) > 0 ? discard : [],
    currentPlayerId,
    drawn,
    winnerId,
    lastAction: typeof previous?.lastAction === 'string' ? previous.lastAction : null,
  };
}
