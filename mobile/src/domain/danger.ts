import type { Game, Player } from './models';

/**
 * Four pegs race around a 28-space ring. A 6 leaves home and earns another
 * roll. Landing on an opponent sends that peg home. The finish lane takes an
 * exact count. The first player with every peg finished wins.
 */

export const TRACK_SPACES = 28;
export const SIDE_SPACES = 7;
export const LANE_SPACES = 3;
export const PEGS_PER_PLAYER = 4;

const HOME_PROGRESS = TRACK_SPACES + LANE_SPACES;

export const DANGER_COLORS = [
  { id: 'red', name: 'Red', fill: '#d64545', soft: '#f8d6d6', ink: '#fffaf0' },
  { id: 'blue', name: 'Blue', fill: '#2c6adf', soft: '#d5e3fb', ink: '#fffaf0' },
  { id: 'yellow', name: 'Yellow', fill: '#e2b325', soft: '#f8ecc4', ink: '#2a2118' },
  { id: 'green', name: 'Green', fill: '#1f9a52', soft: '#d3f0df', ink: '#fffaf0' },
] as const;

export type DangerSpot =
  | { zone: 'nest' }
  | { zone: 'track'; index: number }
  | { zone: 'lane'; index: number }
  | { zone: 'home' };

export type DangerMove = { type: 'enter'; peg: number } | { type: 'run'; peg: number };

export type DangerState = {
  pegs: Record<string, DangerSpot[]>;
  colors: Record<string, number>;
  currentPlayerId: string;
  die: number | null;
  again: boolean;
  winnerId: string | null;
  lastAction: string | null;
};

type Seat = { id: string; name?: string };
type Occupant = { playerId: string; peg: number };

export function startIndex(color: number): number {
  return (color % DANGER_COLORS.length) * SIDE_SPACES;
}

export function createDangerState(players: { id: string }[]): DangerState {
  const ids = players.map((player) => player.id);
  const colors = colorsFor(ids, {}, true);
  const pegs: Record<string, DangerSpot[]> = {};
  for (const id of ids) pegs[id] = nestPegs();
  return {
    pegs,
    colors,
    currentPlayerId: ids[0] ?? '',
    die: null,
    again: false,
    winnerId: null,
    lastAction: null,
  };
}

export function homeCount(state: DangerState, playerId: string): number {
  return (state.pegs[playerId] ?? []).filter((spot) => spot.zone === 'home').length;
}

export function colorIndexFor(state: DangerState, playerId: string): number {
  const color = state.colors[playerId];
  return typeof color === 'number' ? color % DANGER_COLORS.length : 0;
}

export function rollDie(
  state: DangerState,
  players: Seat[],
  face?: number,
  sample: () => number = Math.random,
): DangerState | null {
  if (state.winnerId || state.die != null) return null;
  const rolled = face ?? dieFace(sample);
  if (!isFace(rolled)) return null;
  const name = seatName(players, state.currentPlayerId);
  return {
    ...state,
    die: rolled,
    again: false,
    lastAction: `${name} rolls ${rolled}.`,
  };
}

export function legalMoves(state: DangerState, players: Seat[]): DangerMove[] {
  if (state.winnerId || state.die == null) return [];
  const playerId = state.currentPlayerId;
  if (!players.some((player) => player.id === playerId)) return [];
  const row = state.pegs[playerId] ?? [];
  const moves: DangerMove[] = [];
  row.forEach((spot, peg) => {
    if (spot.zone === 'nest' && state.die === 6 && canEnter(state, playerId, peg)) {
      moves.push({ type: 'enter', peg });
    }
    if ((spot.zone === 'track' || spot.zone === 'lane') && runPath(state, playerId, peg, state.die ?? 0)) {
      moves.push({ type: 'run', peg });
    }
  });
  return moves;
}

export function moveDestination(state: DangerState, move: DangerMove): DangerSpot | null {
  const playerId = state.currentPlayerId;
  const color = state.colors[playerId];
  if (typeof color !== 'number') return null;
  if (move.type === 'enter') return { zone: 'track', index: startIndex(color) };
  if (state.die == null) return null;
  return runPath(state, playerId, move.peg, state.die)?.dest ?? null;
}

export function playMove(state: DangerState, players: Seat[], move: DangerMove): DangerState | null {
  if (state.winnerId || state.die == null) return null;
  if (!legalMoves(state, players).some((allowed) => allowed.type === move.type && allowed.peg === move.peg)) {
    return null;
  }
  const next = applyMove(state, players, move);
  if (!next) return null;
  return { ...next, lastAction: describeMove(players, state, next) };
}

export function passTurn(state: DangerState, players: Seat[]): DangerState | null {
  if (state.winnerId || state.die == null) return null;
  if (legalMoves(state, players).length > 0) return null;
  return {
    ...state,
    die: null,
    again: false,
    currentPlayerId: nextPlayerId(players, state.currentPlayerId),
    lastAction: `${seatName(players, state.currentPlayerId)} cannot move.`,
  };
}

export function ensureDangerState(game: Game): Game {
  if (game.templateId !== 'danger') return game;
  if (game.danger && isHealthy(game.danger, game.players)) return game;
  return { ...game, danger: repairDanger(game) };
}

function nestPegs(): DangerSpot[] {
  return Array.from({ length: PEGS_PER_PLAYER }, () => ({ zone: 'nest' as const }));
}

function preferredColor(index: number, count: number): number {
  if (count === 2) return index === 0 ? 0 : 2;
  return index % DANGER_COLORS.length;
}

function colorsFor(ids: string[], prior: Record<string, number>, untouched: boolean): Record<string, number> {
  const colors: Record<string, number> = {};
  const used = new Set<number>();
  if (untouched) {
    ids.forEach((id, index) => {
      const color = preferredColor(index, ids.length);
      colors[id] = color;
      used.add(color);
    });
    return colors;
  }
  for (const id of ids) {
    const color = prior[id];
    if (typeof color === 'number' && color >= 0 && color < DANGER_COLORS.length && !used.has(color)) {
      colors[id] = color;
      used.add(color);
    }
  }
  for (const id of ids) {
    if (colors[id] != null) continue;
    let next = 0;
    while (used.has(next) && next < DANGER_COLORS.length) next += 1;
    colors[id] = next % DANGER_COLORS.length;
    used.add(colors[id]);
  }
  return colors;
}

function dieFace(sample: () => number): number {
  return Math.min(6, Math.max(1, Math.floor(sample() * 6) + 1));
}

function isFace(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

function seatName(players: Seat[], id: string): string {
  return players.find((player) => player.id === id)?.name || 'Player';
}

function nextPlayerId(players: Seat[], current: string): string {
  if (players.length === 0) return current;
  const index = players.findIndex((player) => player.id === current);
  if (index < 0) return players[0]?.id ?? current;
  return players[(index + 1) % players.length]?.id ?? current;
}

function progressOf(color: number, spot: DangerSpot): number | null {
  if (spot.zone === 'nest') return null;
  if (spot.zone === 'home') return HOME_PROGRESS;
  if (spot.zone === 'lane') return TRACK_SPACES + spot.index;
  return (spot.index - startIndex(color) + TRACK_SPACES) % TRACK_SPACES;
}

function spaceAt(color: number, progress: number): DangerSpot | null {
  if (progress < 0 || progress > HOME_PROGRESS) return null;
  if (progress === HOME_PROGRESS) return { zone: 'home' };
  if (progress >= TRACK_SPACES) return { zone: 'lane', index: progress - TRACK_SPACES };
  return { zone: 'track', index: (startIndex(color) + progress) % TRACK_SPACES };
}

function occupants(state: DangerState, spot: DangerSpot, laneColor: number): Occupant[] {
  const found: Occupant[] = [];
  for (const [playerId, row] of Object.entries(state.pegs)) {
    if (spot.zone === 'lane' && state.colors[playerId] !== laneColor) continue;
    row.forEach((pegSpot, peg) => {
      if (spot.zone === 'track' && pegSpot.zone === 'track' && pegSpot.index === spot.index) {
        found.push({ playerId, peg });
      }
      if (spot.zone === 'lane' && pegSpot.zone === 'lane' && pegSpot.index === spot.index) {
        found.push({ playerId, peg });
      }
    });
  }
  return found;
}

function canEnter(state: DangerState, playerId: string, peg: number): boolean {
  const spot = state.pegs[playerId]?.[peg];
  const color = state.colors[playerId];
  if (!spot || spot.zone !== 'nest' || typeof color !== 'number') return false;
  const here = occupants(state, { zone: 'track', index: startIndex(color) }, color);
  return here.every((entry) => entry.playerId !== playerId);
}

function runPath(
  state: DangerState,
  playerId: string,
  peg: number,
  steps: number,
): { dest: DangerSpot; captured: Occupant | null } | null {
  if (!Number.isInteger(steps) || steps <= 0) return null;
  const spot = state.pegs[playerId]?.[peg];
  const color = state.colors[playerId];
  if (!spot || typeof color !== 'number' || spot.zone === 'nest' || spot.zone === 'home') return null;
  const start = progressOf(color, spot);
  if (start == null) return null;
  const destProgress = start + steps;
  if (destProgress > HOME_PROGRESS) return null;
  let captured: Occupant | null = null;
  for (let progress = start + 1; progress <= destProgress; progress += 1) {
    const next = spaceAt(color, progress);
    if (!next) return null;
    if (next.zone === 'home') continue;
    if (progress !== destProgress) continue;
    const here = occupants(state, next, color).filter((entry) => entry.playerId !== playerId || entry.peg !== peg);
    const own = here.filter((entry) => entry.playerId === playerId);
    const foe = here.filter((entry) => entry.playerId !== playerId);
    if (own.length > 0 || foe.length > 1) return null;
    if (foe.length === 1 && next.zone === 'track') captured = foe[0] ?? null;
    if (foe.length === 1 && next.zone !== 'track') return null;
  }
  const dest = spaceAt(color, destProgress);
  return dest ? { dest, captured } : null;
}

function setPeg(
  pegs: Record<string, DangerSpot[]>,
  playerId: string,
  peg: number,
  spot: DangerSpot,
): Record<string, DangerSpot[]> {
  const row = pegs[playerId];
  if (!row) return pegs;
  return { ...pegs, [playerId]: row.map((current, index) => (index === peg ? spot : current)) };
}

function applyMove(state: DangerState, players: Seat[], move: DangerMove): DangerState | null {
  const playerId = state.currentPlayerId;
  const color = state.colors[playerId];
  const die = state.die;
  if (typeof color !== 'number' || die == null) return null;
  let pegs = state.pegs;
  if (move.type === 'enter') {
    const start: DangerSpot = { zone: 'track', index: startIndex(color) };
    for (const foe of occupants(state, start, color)) {
      if (foe.playerId === playerId) return null;
      pegs = setPeg(pegs, foe.playerId, foe.peg, { zone: 'nest' });
    }
    pegs = setPeg(pegs, playerId, move.peg, start);
  } else {
    const path = runPath(state, playerId, move.peg, die);
    if (!path) return null;
    if (path.captured) pegs = setPeg(pegs, path.captured.playerId, path.captured.peg, { zone: 'nest' });
    pegs = setPeg(pegs, playerId, move.peg, path.dest);
  }
  const moved: DangerState = { ...state, pegs };
  const won = homeCount(moved, playerId) >= PEGS_PER_PLAYER;
  const again = !won && die === 6;
  return {
    ...moved,
    die: null,
    again,
    winnerId: won ? playerId : null,
    currentPlayerId: won || again ? playerId : nextPlayerId(players, playerId),
  };
}

function describeMove(players: Seat[], before: DangerState, after: DangerState): string {
  const playerId = before.currentPlayerId;
  const name = seatName(players, playerId);
  const parts = [before.die === 6 && movedOut(before, after, playerId) ? `${name} moves a peg out.` : `${name} moves ${before.die}.`];
  const sent = sentHome(before, after, playerId);
  if (sent) parts.push(`${seatName(players, sent)} goes back home.`);
  if (after.winnerId) parts.push(`${name} finishes every peg.`);
  else if (homeCount(after, playerId) > homeCount(before, playerId)) parts.push('A peg reaches the finish.');
  if (after.again) parts.push('Roll again.');
  return parts.join(' ');
}

function movedOut(before: DangerState, after: DangerState, playerId: string): boolean {
  const prior = before.pegs[playerId] ?? [];
  const next = after.pegs[playerId] ?? [];
  return prior.some((spot, index) => spot.zone === 'nest' && next[index]?.zone === 'track');
}

function sentHome(before: DangerState, after: DangerState, moverId: string): string | null {
  for (const [playerId, row] of Object.entries(before.pegs)) {
    if (playerId === moverId) continue;
    const next = after.pegs[playerId] ?? [];
    if (row.some((spot, index) => spot.zone !== 'nest' && next[index]?.zone === 'nest')) return playerId;
  }
  return null;
}

function isHealthy(state: DangerState, players: Player[]): boolean {
  if (!players.length || !players.some((player) => player.id === state.currentPlayerId)) return false;
  if (state.winnerId != null && !players.some((player) => player.id === state.winnerId)) return false;
  if (state.lastAction != null && typeof state.lastAction !== 'string') return false;
  if (!(state.die == null || isFace(state.die))) return false;
  if (typeof state.again !== 'boolean') return false;
  if (state.die != null && state.again) return false;
  if (state.winnerId && (state.die != null || state.again)) return false;
  const used = new Set<number>();
  const track = new Map<number, string[]>();
  const lanes = new Map<string, string[]>();
  for (const player of players) {
    const spots = state.pegs[player.id];
    const color = state.colors[player.id];
    if (!spots || spots.length !== PEGS_PER_PLAYER) return false;
    if (typeof color !== 'number' || color < 0 || color >= DANGER_COLORS.length || used.has(color)) return false;
    used.add(color);
    for (const spot of spots) {
      if (!validSpot(spot)) return false;
      if (spot.zone === 'track') {
        const owners = track.get(spot.index) ?? [];
        owners.push(player.id);
        track.set(spot.index, owners);
      }
      if (spot.zone === 'lane') {
        const key = `${color}:${spot.index}`;
        const owners = lanes.get(key) ?? [];
        owners.push(player.id);
        lanes.set(key, owners);
      }
    }
  }
  for (const owners of track.values()) if (owners.length > 1) return false;
  for (const owners of lanes.values()) if (owners.length > 1) return false;
  for (const id of Object.keys(state.pegs)) {
    if (!players.some((player) => player.id === id)) return false;
  }
  for (const id of Object.keys(state.colors)) {
    if (!players.some((player) => player.id === id)) return false;
  }
  return true;
}

function validSpot(spot: DangerSpot | undefined): spot is DangerSpot {
  if (!spot || typeof spot !== 'object') return false;
  if (spot.zone === 'nest' || spot.zone === 'home') return true;
  if (spot.zone === 'track') return Number.isInteger(spot.index) && spot.index >= 0 && spot.index < TRACK_SPACES;
  if (spot.zone === 'lane') return Number.isInteger(spot.index) && spot.index >= 0 && spot.index < LANE_SPACES;
  return false;
}

function repairDanger(game: Game): DangerState {
  const previous = game.danger;
  const ids = game.players.map((player) => player.id);
  const pegs: Record<string, DangerSpot[]> = {};
  for (const player of game.players) {
    const existing = previous?.pegs[player.id];
    pegs[player.id] = Array.from({ length: PEGS_PER_PLAYER }, (_, index) => cleanSpot(existing?.[index]));
  }
  const untouched = Object.values(pegs).every((row) => row.every((spot) => spot.zone === 'nest')) && previous?.die == null;
  const colors = colorsFor(ids, previous?.colors ?? {}, untouched);
  const current = previous && ids.includes(previous.currentPlayerId) ? previous.currentPlayerId : (ids[0] ?? '');
  const die = previous?.die != null && isFace(previous.die) ? previous.die : null;
  const winnerId = previous?.winnerId && ids.includes(previous.winnerId) ? previous.winnerId : null;
  return dropCrowds({
    pegs,
    colors,
    currentPlayerId: current,
    die: winnerId ? null : die,
    again: !untouched && !winnerId && die == null && previous?.again === true,
    winnerId,
    lastAction: typeof previous?.lastAction === 'string' ? previous.lastAction : null,
  });
}

function cleanSpot(spot: DangerSpot | undefined): DangerSpot {
  if (!spot) return { zone: 'nest' };
  if (spot.zone === 'home') return { zone: 'home' };
  if (spot.zone === 'track' && Number.isInteger(spot.index) && spot.index >= 0 && spot.index < TRACK_SPACES) {
    return { zone: 'track', index: spot.index };
  }
  if (spot.zone === 'lane' && Number.isInteger(spot.index) && spot.index >= 0 && spot.index < LANE_SPACES) {
    return { zone: 'lane', index: spot.index };
  }
  return { zone: 'nest' };
}

function dropCrowds(state: DangerState): DangerState {
  const track = new Map<number, Occupant[]>();
  const lanes = new Map<string, Occupant[]>();
  let pegs = state.pegs;
  for (const [playerId, row] of Object.entries(pegs)) {
    row.forEach((spot, peg) => {
      if (spot.zone === 'track') {
        const list = track.get(spot.index) ?? [];
        list.push({ playerId, peg });
        track.set(spot.index, list);
      }
      if (spot.zone === 'lane') {
        const key = `${state.colors[playerId]}:${spot.index}`;
        const list = lanes.get(key) ?? [];
        list.push({ playerId, peg });
        lanes.set(key, list);
      }
    });
  }
  for (const entries of [...track.values(), ...lanes.values()]) {
    for (const entry of entries.slice(1)) pegs = setPeg(pegs, entry.playerId, entry.peg, { zone: 'nest' });
  }
  return { ...state, pegs };
}
