import type { Game, Player } from './models';

/**
 * Four-pawn race on a 68-space ring. Each color has a seven-space lane into
 * the center. A 5 leaves the nest. Doubles roll again. Three doubles in a row
 * send the leading pawn back. The first player with every pawn home wins.
 */

export const TRACK_SPACES = 68;
export const SIDE_SPACES = 17;
export const LANE_SPACES = 7;
export const PAWNS_PER_PLAYER = 4;
export const CAPTURE_BONUS = 20;
export const HOME_BONUS = 10;

const HOME_PROGRESS = TRACK_SPACES + LANE_SPACES;

export const PARCHEESI_COLORS = [
  { id: 'red', name: 'Red', fill: '#d64545', soft: '#f8d6d6', ink: '#fffaf0' },
  { id: 'blue', name: 'Blue', fill: '#2c6adf', soft: '#d5e3fb', ink: '#fffaf0' },
  { id: 'yellow', name: 'Yellow', fill: '#e2b325', soft: '#f8ecc4', ink: '#2a2118' },
  { id: 'green', name: 'Green', fill: '#1f9a52', soft: '#d3f0df', ink: '#fffaf0' },
] as const;

export type ParcheesiSpot =
  | { zone: 'nest' }
  | { zone: 'track'; index: number }
  | { zone: 'lane'; index: number }
  | { zone: 'home' };

export type ParcheesiMove =
  | { type: 'enter'; pawn: number; die: number }
  | { type: 'run'; pawn: number; die: number }
  | { type: 'bonus'; pawn: number };

export type ParcheesiBonus = { kind: 'capture'; pawn: number } | { kind: 'home' };

export type ParcheesiState = {
  pawns: Record<string, ParcheesiSpot[]>;
  colors: Record<string, number>;
  currentPlayerId: string;
  dice: number[] | null;
  remaining: number[];
  doublesStreak: number;
  bonus: ParcheesiBonus | null;
  winnerId: string | null;
  lastAction: string | null;
};

type Seat = { id: string; name?: string };

export function startIndex(color: number): number {
  return (color % PARCHEESI_COLORS.length) * SIDE_SPACES;
}

/** Start spaces and the space before each home lane cannot be captured. */
export function isSafeIndex(index: number): boolean {
  for (let color = 0; color < PARCHEESI_COLORS.length; color += 1) {
    const start = startIndex(color);
    if (index === start || index === (start + TRACK_SPACES - 1) % TRACK_SPACES) return true;
  }
  return false;
}

export function createParcheesiState(players: { id: string }[]): ParcheesiState {
  const ids = players.map((player) => player.id);
  const colors = colorsFor(ids, {}, true);
  const pawns: Record<string, ParcheesiSpot[]> = {};
  for (const id of ids) pawns[id] = nestPawns();
  return {
    pawns,
    colors,
    currentPlayerId: ids[0] ?? '',
    dice: null,
    remaining: [],
    doublesStreak: 0,
    bonus: null,
    winnerId: null,
    lastAction: null,
  };
}

export function homeCount(state: ParcheesiState, playerId: string): number {
  return (state.pawns[playerId] ?? []).filter((spot) => spot.zone === 'home').length;
}

export function colorIndexFor(state: ParcheesiState, playerId: string): number {
  const color = state.colors[playerId];
  return typeof color === 'number' ? color % PARCHEESI_COLORS.length : 0;
}

export function rollDice(
  state: ParcheesiState,
  players: Seat[],
  faces?: [number, number],
  sample: () => number = Math.random,
): ParcheesiState | null {
  if (state.winnerId || state.dice || state.remaining.length > 0 || state.bonus) return null;
  const rolled: [number, number] = faces ?? [dieFace(sample), dieFace(sample)];
  if (!isFace(rolled[0]) || !isFace(rolled[1])) return null;
  const name = seatName(players, state.currentPlayerId);
  const doubles = rolled[0] === rolled[1];
  const streak = doubles ? state.doublesStreak + 1 : 0;
  if (streak >= 3) {
    const pawn = leadingPawn(state, state.currentPlayerId);
    const pawns =
      pawn == null ? state.pawns : setPawn(state.pawns, state.currentPlayerId, pawn, { zone: 'nest' });
    return {
      ...state,
      pawns,
      dice: null,
      remaining: [],
      bonus: null,
      doublesStreak: 0,
      currentPlayerId: nextPlayerId(players, state.currentPlayerId),
      lastAction:
        pawn == null
          ? `${name} rolls doubles a third time.`
          : `${name} rolls doubles a third time. The leading pawn returns to the nest.`,
    };
  }
  const rolledState: ParcheesiState = {
    ...state,
    dice: [rolled[0], rolled[1]],
    remaining: [rolled[0], rolled[1]],
    doublesStreak: streak,
    bonus: null,
    lastAction: `${name} rolls ${rolled[0]} and ${rolled[1]}.`,
  };
  if (legalMoves(rolledState, players).length > 0) return rolledState;
  const passed = passTurn(rolledState, players);
  if (!passed) return rolledState;
  return {
    ...passed,
    lastAction: `${name} rolls ${rolled[0]} and ${rolled[1]} and cannot move.`,
  };
}

export function legalMoves(state: ParcheesiState, players: Seat[]): ParcheesiMove[] {
  if (state.winnerId || !state.dice) return [];
  const ready = clearDeadBonus(state);
  const raw = candidateMoves(ready);
  if (raw.length === 0) return [];
  const scored = raw.map((move) => ({ move, dice: diceUsedBy(ready, move, players, 12) }));
  const best = Math.max(...scored.map((row) => row.dice));
  let chosen = scored.filter((row) => row.dice === best && row.dice >= 0).map((row) => row.move);
  if (!ready.bonus && ready.remaining.length > 1 && best < ready.remaining.length) {
    const larger = Math.max(...ready.remaining);
    const big = chosen.filter((move) => move.type !== 'bonus' && move.die === larger);
    if (big.length > 0) chosen = big;
  }
  return chosen;
}

export function moveDestination(state: ParcheesiState, move: ParcheesiMove): ParcheesiSpot | null {
  const playerId = state.currentPlayerId;
  const color = state.colors[playerId];
  if (typeof color !== 'number') return null;
  if (move.type === 'enter') return { zone: 'track', index: startIndex(color) };
  const steps = move.type === 'bonus' ? bonusSteps(state.bonus) : move.die;
  if (steps <= 0) return null;
  return runPath(state, playerId, move.pawn, steps)?.dest ?? null;
}

export function playMove(state: ParcheesiState, players: Seat[], move: ParcheesiMove): ParcheesiState | null {
  if (state.winnerId) return null;
  if (!legalMoves(state, players).some((allowed) => sameMove(allowed, move))) return null;
  const ready = clearDeadBonus(state);
  const next = applyDirect(ready, players, move);
  if (!next) return null;
  return { ...next, lastAction: describeMove(players, ready, move, next) };
}

export function passTurn(state: ParcheesiState, players: Seat[]): ParcheesiState | null {
  if (state.winnerId || !state.dice) return null;
  if (legalMoves(state, players).length > 0) return null;
  return {
    ...state,
    dice: null,
    remaining: [],
    bonus: null,
    doublesStreak: 0,
    currentPlayerId: nextPlayerId(players, state.currentPlayerId),
    lastAction: `${seatName(players, state.currentPlayerId)} cannot move.`,
  };
}

export function ensureParcheesiState(game: Game): Game {
  if (game.templateId !== 'parcheesi') return game;
  if (game.parcheesi && isHealthy(game.parcheesi, game.players)) return game;
  return { ...game, parcheesi: repairParcheesi(game) };
}

function nestPawns(): ParcheesiSpot[] {
  return Array.from({ length: PAWNS_PER_PLAYER }, () => ({ zone: 'nest' as const }));
}

function preferredColor(index: number, count: number): number {
  if (count === 2) return index === 0 ? 0 : 2;
  return index % PARCHEESI_COLORS.length;
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
    if (typeof color === 'number' && color >= 0 && color < PARCHEESI_COLORS.length && !used.has(color)) {
      colors[id] = color;
      used.add(color);
    }
  }
  for (const id of ids) {
    if (colors[id] != null) continue;
    let next = 0;
    while (used.has(next) && next < PARCHEESI_COLORS.length) next += 1;
    colors[id] = next % PARCHEESI_COLORS.length;
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

function sameMove(a: ParcheesiMove, b: ParcheesiMove): boolean {
  if (a.type !== b.type || a.pawn !== b.pawn) return false;
  if (a.type === 'bonus' || b.type === 'bonus') return true;
  return a.die === b.die;
}

function bonusSteps(bonus: ParcheesiBonus | null): number {
  if (bonus?.kind === 'capture') return CAPTURE_BONUS;
  if (bonus?.kind === 'home') return HOME_BONUS;
  return 0;
}

function progressOf(color: number, spot: ParcheesiSpot): number | null {
  if (spot.zone === 'nest') return null;
  if (spot.zone === 'home') return HOME_PROGRESS;
  if (spot.zone === 'lane') return TRACK_SPACES + spot.index;
  return (spot.index - startIndex(color) + TRACK_SPACES) % TRACK_SPACES;
}

function spaceAt(color: number, progress: number): ParcheesiSpot | null {
  if (progress < 0 || progress > HOME_PROGRESS) return null;
  if (progress === HOME_PROGRESS) return { zone: 'home' };
  if (progress >= TRACK_SPACES) return { zone: 'lane', index: progress - TRACK_SPACES };
  return { zone: 'track', index: (startIndex(color) + progress) % TRACK_SPACES };
}

type Occupant = { playerId: string; pawn: number };

function pawnsOn(state: ParcheesiState, spot: ParcheesiSpot, laneColor: number): Occupant[] {
  const found: Occupant[] = [];
  for (const [playerId, pawns] of Object.entries(state.pawns)) {
    if (spot.zone === 'lane' && state.colors[playerId] !== laneColor) continue;
    pawns.forEach((pawnSpot, pawn) => {
      if (spot.zone === 'track' && pawnSpot.zone === 'track' && pawnSpot.index === spot.index) {
        found.push({ playerId, pawn });
      }
      if (spot.zone === 'lane' && pawnSpot.zone === 'lane' && pawnSpot.index === spot.index) {
        found.push({ playerId, pawn });
      }
    });
  }
  return found;
}

function isBlockade(entries: Occupant[]): boolean {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.playerId, (counts.get(entry.playerId) ?? 0) + 1);
  for (const count of counts.values()) if (count >= 2) return true;
  return false;
}

function runPath(
  state: ParcheesiState,
  playerId: string,
  pawn: number,
  steps: number,
): { dest: ParcheesiSpot; captured: Occupant | null } | null {
  if (!Number.isInteger(steps) || steps <= 0) return null;
  const spot = state.pawns[playerId]?.[pawn];
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
    if (next.zone === 'home') return progress === destProgress ? { dest: next, captured: null } : null;
    const here = pawnsOn(state, next, color).filter((entry) => entry.playerId !== playerId || entry.pawn !== pawn);
    if (isBlockade(here)) return null;
    if (progress !== destProgress) continue;
    const own = here.filter((entry) => entry.playerId === playerId);
    const foe = here.filter((entry) => entry.playerId !== playerId);
    if (own.length >= 2 || foe.length > 1 || (own.length > 0 && foe.length > 0)) return null;
    if (foe.length === 1) {
      if (next.zone !== 'track' || isSafeIndex(next.index)) return null;
      captured = foe[0] ?? null;
    }
  }
  const dest = spaceAt(color, destProgress);
  return dest ? { dest, captured } : null;
}

function canEnter(state: ParcheesiState, playerId: string, pawn: number): boolean {
  const spot = state.pawns[playerId]?.[pawn];
  const color = state.colors[playerId];
  if (!spot || spot.zone !== 'nest' || typeof color !== 'number') return false;
  const here = pawnsOn(state, { zone: 'track', index: startIndex(color) }, color);
  const own = here.filter((entry) => entry.playerId === playerId).length;
  const foe = here.filter((entry) => entry.playerId !== playerId).length;
  return foe === 0 && own < 2;
}

function setPawn(
  pawns: Record<string, ParcheesiSpot[]>,
  playerId: string,
  pawn: number,
  spot: ParcheesiSpot,
): Record<string, ParcheesiSpot[]> {
  const row = pawns[playerId];
  if (!row) return pawns;
  return { ...pawns, [playerId]: row.map((current, index) => (index === pawn ? spot : current)) };
}

function hasDie(remaining: number[], die: number): boolean {
  return remaining.includes(die);
}

function removeDie(remaining: number[], die: number): number[] {
  const index = remaining.indexOf(die);
  if (index < 0) return [...remaining];
  return remaining.filter((_, at) => at !== index);
}

function nextBonus(
  state: ParcheesiState,
  pawns: Record<string, ParcheesiSpot[]>,
  playerId: string,
  pawn: number,
  path: { dest: ParcheesiSpot; captured: Occupant | null },
): ParcheesiBonus | null {
  if ((pawns[playerId] ?? []).filter((spot) => spot.zone === 'home').length >= PAWNS_PER_PLAYER) return null;
  const scratch: ParcheesiState = { ...state, pawns, bonus: null };
  if (path.captured && runPath(scratch, playerId, pawn, CAPTURE_BONUS)) return { kind: 'capture', pawn };
  if (path.dest.zone === 'home') {
    const other = (pawns[playerId] ?? []).some(
      (_, index) => index !== pawn && runPath(scratch, playerId, index, HOME_BONUS),
    );
    if (other) return { kind: 'home' };
  }
  return null;
}

function applyDirect(state: ParcheesiState, players: Seat[], move: ParcheesiMove): ParcheesiState | null {
  if (state.winnerId || !state.dice) return null;
  const playerId = state.currentPlayerId;
  if (move.type === 'enter') {
    if (state.bonus || move.die !== 5 || !hasDie(state.remaining, 5)) return null;
    if (!canEnter(state, playerId, move.pawn)) return null;
    const color = state.colors[playerId] ?? 0;
    const pawns = setPawn(state.pawns, playerId, move.pawn, { zone: 'track', index: startIndex(color) });
    return settle(state, players, pawns, removeDie(state.remaining, 5), null, playerId);
  }
  const steps = move.type === 'bonus' ? bonusSteps(state.bonus) : move.die;
  if (move.type === 'bonus') {
    if (!state.bonus || steps <= 0) return null;
    if (state.bonus.kind === 'capture' && move.pawn !== state.bonus.pawn) return null;
    if (state.bonus.kind === 'home' && state.pawns[playerId]?.[move.pawn]?.zone === 'home') return null;
  } else if (state.bonus || !hasDie(state.remaining, move.die)) {
    return null;
  }
  const path = runPath(state, playerId, move.pawn, steps);
  if (!path) return null;
  let pawns = setPawn(state.pawns, playerId, move.pawn, path.dest);
  if (path.captured) pawns = setPawn(pawns, path.captured.playerId, path.captured.pawn, { zone: 'nest' });
  const remaining = move.type === 'bonus' ? state.remaining : removeDie(state.remaining, move.die);
  const bonus = nextBonus(state, pawns, playerId, move.pawn, path);
  return settle(state, players, pawns, remaining, bonus, playerId);
}

function settle(
  state: ParcheesiState,
  players: Seat[],
  pawns: Record<string, ParcheesiSpot[]>,
  remaining: number[],
  bonus: ParcheesiBonus | null,
  playerId: string,
): ParcheesiState {
  const won = (pawns[playerId] ?? []).filter((spot) => spot.zone === 'home').length >= PAWNS_PER_PLAYER;
  if (won) {
    return { ...state, pawns, remaining: [], bonus: null, winnerId: playerId, doublesStreak: 0 };
  }
  if (bonus || remaining.length > 0) return { ...state, pawns, remaining, bonus };
  const doubles = state.dice != null && state.dice.length === 2 && state.dice[0] === state.dice[1];
  if (doubles) return { ...state, pawns, dice: null, remaining: [], bonus: null };
  return {
    ...state,
    pawns,
    dice: null,
    remaining: [],
    bonus: null,
    doublesStreak: 0,
    currentPlayerId: nextPlayerId(players, playerId),
  };
}

function bonusMoves(state: ParcheesiState): ParcheesiMove[] {
  if (!state.bonus) return [];
  const playerId = state.currentPlayerId;
  const moves: ParcheesiMove[] = [];
  (state.pawns[playerId] ?? []).forEach((_, pawn) => {
    if (state.bonus?.kind === 'capture' && pawn !== state.bonus.pawn) return;
    if (state.bonus?.kind === 'home' && state.pawns[playerId]?.[pawn]?.zone === 'home') return;
    const steps = bonusSteps(state.bonus);
    if (runPath(state, playerId, pawn, steps)) moves.push({ type: 'bonus', pawn });
  });
  return moves;
}

function clearDeadBonus(state: ParcheesiState): ParcheesiState {
  if (!state.bonus || bonusMoves(state).length > 0) return state;
  return { ...state, bonus: null };
}

function candidateMoves(state: ParcheesiState): ParcheesiMove[] {
  if (state.bonus) return bonusMoves(state);
  const moves: ParcheesiMove[] = [];
  const seen = new Set<number>();
  const playerId = state.currentPlayerId;
  for (const die of state.remaining) {
    if (seen.has(die)) continue;
    seen.add(die);
    (state.pawns[playerId] ?? []).forEach((spot, pawn) => {
      if (die === 5 && spot.zone === 'nest' && canEnter(state, playerId, pawn)) {
        moves.push({ type: 'enter', pawn, die });
      }
      if ((spot.zone === 'track' || spot.zone === 'lane') && runPath(state, playerId, pawn, die)) {
        moves.push({ type: 'run', pawn, die });
      }
    });
  }
  return moves;
}

function diceUsedBy(before: ParcheesiState, move: ParcheesiMove, players: Seat[], depth: number): number {
  const after = applyDirect(before, players, move);
  if (!after) return -1;
  if (after.winnerId) return before.remaining.length;
  const used = before.remaining.length - after.remaining.length;
  return used + maxFurther(after, players, depth - 1);
}

function maxFurther(state: ParcheesiState, players: Seat[], depth: number): number {
  if (depth <= 0 || state.winnerId) return 0;
  const ready = clearDeadBonus(state);
  let best = 0;
  for (const move of candidateMoves(ready)) {
    const score = diceUsedBy(ready, move, players, depth);
    if (score > best) best = score;
  }
  return best;
}

function leadingPawn(state: ParcheesiState, playerId: string): number | null {
  const color = state.colors[playerId];
  if (typeof color !== 'number') return null;
  let best = -1;
  let pawn: number | null = null;
  (state.pawns[playerId] ?? []).forEach((spot, index) => {
    if (spot.zone === 'nest' || spot.zone === 'home') return;
    const progress = progressOf(color, spot);
    if (progress != null && progress > best) {
      best = progress;
      pawn = index;
    }
  });
  return pawn;
}

function describeMove(players: Seat[], before: ParcheesiState, move: ParcheesiMove, after: ParcheesiState): string {
  const name = seatName(players, before.currentPlayerId);
  const from = before.pawns[before.currentPlayerId]?.[move.pawn];
  const to = after.pawns[before.currentPlayerId]?.[move.pawn];
  let text = `${name} moves.`;
  if (move.type === 'enter') text = `${name} brings a pawn out.`;
  else if (to?.zone === 'home' && from?.zone !== 'home') text = `${name} moves a pawn to the center.`;
  else if (wasCaptured(before, after, before.currentPlayerId)) text = `${name} captures a pawn.`;
  else if (move.type === 'bonus' && before.bonus?.kind === 'capture') text = `${name} takes the extra 20.`;
  else if (move.type === 'bonus') text = `${name} takes the extra 10.`;
  else text = `${name} moves ${move.die}.`;
  if (after.winnerId) return `${text} All four pawns are home.`;
  if (after.dice == null && before.dice && after.currentPlayerId === before.currentPlayerId) {
    return `${text} Doubles — roll again.`;
  }
  return text;
}

function wasCaptured(before: ParcheesiState, after: ParcheesiState, actor: string): boolean {
  for (const [playerId, pawns] of Object.entries(before.pawns)) {
    if (playerId === actor) continue;
    for (let pawn = 0; pawn < pawns.length; pawn += 1) {
      const spot = pawns[pawn];
      const next = after.pawns[playerId]?.[pawn];
      if (spot && spot.zone !== 'nest' && next?.zone === 'nest') return true;
    }
  }
  return false;
}

function isHealthy(state: ParcheesiState, players: Player[]): boolean {
  if (!players.length || !players.some((player) => player.id === state.currentPlayerId)) return false;
  if (state.winnerId != null && !players.some((player) => player.id === state.winnerId)) return false;
  if (state.lastAction != null && typeof state.lastAction !== 'string') return false;
  if (!validDice(state.dice) || !remainingFits(state.dice, state.remaining)) return false;
  if (!Number.isInteger(state.doublesStreak) || state.doublesStreak < 0 || state.doublesStreak > 2) return false;
  if (state.dice == null && (state.remaining.length > 0 || state.bonus)) return false;
  if (!validBonus(state)) return false;

  const used = new Set<number>();
  const track = new Map<number, string[]>();
  const lanes = new Map<string, string[]>();
  for (const player of players) {
    const spots = state.pawns[player.id];
    const color = state.colors[player.id];
    if (!spots || spots.length !== PAWNS_PER_PLAYER) return false;
    if (typeof color !== 'number' || color < 0 || color >= PARCHEESI_COLORS.length || used.has(color)) return false;
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
  for (const owners of track.values()) {
    if (owners.length > 2) return false;
    if (owners.length === 2 && owners[0] !== owners[1]) return false;
  }
  for (const owners of lanes.values()) {
    if (owners.length > 2) return false;
    if (owners.some((id) => id !== owners[0])) return false;
  }
  for (const id of Object.keys(state.pawns)) {
    if (!players.some((player) => player.id === id)) return false;
  }
  for (const id of Object.keys(state.colors)) {
    if (!players.some((player) => player.id === id)) return false;
  }
  return true;
}

function validSpot(spot: ParcheesiSpot | undefined): spot is ParcheesiSpot {
  if (!spot || typeof spot !== 'object') return false;
  if (spot.zone === 'nest' || spot.zone === 'home') return true;
  if (spot.zone === 'track') return Number.isInteger(spot.index) && spot.index >= 0 && spot.index < TRACK_SPACES;
  if (spot.zone === 'lane') return Number.isInteger(spot.index) && spot.index >= 0 && spot.index < LANE_SPACES;
  return false;
}

function validDice(dice: number[] | null): boolean {
  return dice == null || (Array.isArray(dice) && dice.length === 2 && isFace(dice[0]) && isFace(dice[1]));
}

function remainingFits(dice: number[] | null, remaining: number[]): boolean {
  if (!Array.isArray(remaining) || remaining.some((face) => !isFace(face))) return false;
  if (dice == null) return remaining.length === 0;
  const pool = [...dice];
  for (const face of remaining) {
    const at = pool.indexOf(face);
    if (at < 0) return false;
    pool.splice(at, 1);
  }
  return true;
}

function validBonus(state: ParcheesiState): boolean {
  const bonus = state.bonus;
  if (bonus == null) return true;
  if (bonus.kind === 'home') return true;
  if (bonus.kind !== 'capture' || !Number.isInteger(bonus.pawn) || bonus.pawn < 0 || bonus.pawn >= PAWNS_PER_PLAYER) {
    return false;
  }
  const spot = state.pawns[state.currentPlayerId]?.[bonus.pawn];
  return spot?.zone === 'track' || spot?.zone === 'lane';
}

function repairParcheesi(game: Game): ParcheesiState {
  const previous = game.parcheesi;
  const ids = game.players.map((player) => player.id);
  const pawns: Record<string, ParcheesiSpot[]> = {};
  for (const player of game.players) {
    const existing = previous?.pawns[player.id];
    pawns[player.id] = Array.from({ length: PAWNS_PER_PLAYER }, (_, index) => cleanSpot(existing?.[index]));
  }
  const untouched =
    Object.values(pawns).every((row) => row.every((spot) => spot.zone === 'nest')) &&
    (previous?.dice == null || previous.dice.length === 0);
  const colors = colorsFor(ids, previous?.colors ?? {}, untouched);
  const current =
    previous && ids.includes(previous.currentPlayerId) ? previous.currentPlayerId : (ids[0] ?? '');
  const dice = previous?.dice && validDice(previous.dice) ? previous.dice : null;
  const remaining =
    dice && previous && remainingFits(dice, previous.remaining) ? [...previous.remaining] : dice ? [...dice] : [];
  const winnerId = previous?.winnerId && ids.includes(previous.winnerId) ? previous.winnerId : null;
  const rebuilt = dropCrowds({
    pawns,
    colors,
    currentPlayerId: current,
    dice: winnerId ? null : dice,
    remaining: winnerId || dice == null ? [] : remaining,
    doublesStreak:
      previous && Number.isInteger(previous.doublesStreak) && previous.doublesStreak >= 0 && previous.doublesStreak <= 2
        ? previous.doublesStreak
        : 0,
    bonus: null,
    winnerId,
    lastAction: typeof previous?.lastAction === 'string' ? previous.lastAction : null,
  });
  if (rebuilt.dice == null || !previous?.bonus || !validBonus({ ...rebuilt, bonus: previous.bonus })) return rebuilt;
  return {
    ...rebuilt,
    bonus: previous.bonus.kind === 'capture' ? { kind: 'capture', pawn: previous.bonus.pawn } : { kind: 'home' },
  };
}

function cleanSpot(spot: ParcheesiSpot | undefined): ParcheesiSpot {
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

function dropCrowds(state: ParcheesiState): ParcheesiState {
  const track = new Map<number, Occupant[]>();
  const lanes = new Map<string, Occupant[]>();
  let pawns = state.pawns;
  for (const [playerId, row] of Object.entries(pawns)) {
    row.forEach((spot, pawn) => {
      if (spot.zone === 'track') {
        const list = track.get(spot.index) ?? [];
        list.push({ playerId, pawn });
        track.set(spot.index, list);
      }
      if (spot.zone === 'lane') {
        const key = `${state.colors[playerId]}:${spot.index}`;
        const list = lanes.get(key) ?? [];
        list.push({ playerId, pawn });
        lanes.set(key, list);
      }
    });
  }
  const overflow = (entries: Occupant[]) => {
    if (new Set(entries.map((entry) => entry.playerId)).size > 1) return entries;
    return entries.slice(2);
  };
  for (const entries of [...track.values(), ...lanes.values()]) {
    for (const entry of overflow(entries)) pawns = setPawn(pawns, entry.playerId, entry.pawn, { zone: 'nest' });
  }
  return { ...state, pawns };
}
