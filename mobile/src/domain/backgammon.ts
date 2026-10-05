import type { Game, Player } from './models';

/**
 * Standard backgammon for two players.
 *
 * White (light) moves from point 24 toward 1 and bears off 1–6. Black moves
 * from point 1 toward 24 and bears off 19–24. A lone checker is a blot and is
 * sent to the bar. Checkers on the bar must enter before anything else moves.
 * Both dice are played when possible; if only one number can be used, it is the
 * larger one. Doubles are four moves. The cube may be offered before the roll.
 */

export const POINT_COUNT = 24;
export const CHECKERS_PER_SIDE = 15;
export const MAX_CUBE = 64;

export const BACKGAMMON_SIDES = {
  light: { id: 'light', name: 'White', fill: '#f7f1e6', rim: '#d4a84b', ink: '#2a2118' },
  dark: { id: 'dark', name: 'Black', fill: '#1b140f', rim: '#e6c56a', ink: '#f6f1e6' },
} as const;

export type Side = keyof typeof BACKGAMMON_SIDES;
export type WinKind = 1 | 2 | 3;

export type BackgammonMove = {
  from: number | 'bar';
  to: number | 'off';
  die: number;
  hit: boolean;
};

type SideCount = Record<Side, number>;

type UndoSnap = {
  points: number[];
  bar: SideCount;
  off: SideCount;
  remaining: number[];
};

export type BackgammonState = {
  /** Signed counts. Index 0 is point 1. Positive is white, negative is black. */
  points: number[];
  bar: SideCount;
  off: SideCount;
  sides: Record<string, Side>;
  turn: Side;
  /** The two faces of the current roll, or null before the roll. */
  dice: [number, number] | null;
  /** Numbers still to play. A double is four copies. */
  remaining: number[];
  undo: UndoSnap[];
  cube: number;
  cubeOwner: Side | null;
  /** Side waiting for the opponent to take or drop. */
  offer: Side | null;
  winnerSide: Side | null;
  winKind: WinKind | null;
  lastMove: BackgammonMove | null;
  lastAction: string | null;
};

type Position = Pick<BackgammonState, 'points' | 'bar' | 'off'>;

export function oppositeSide(side: Side): Side {
  return side === 'light' ? 'dark' : 'light';
}

export function createBackgammonState(
  players: readonly { id: string }[],
  setup?: Partial<Pick<BackgammonState, 'points' | 'bar' | 'off' | 'turn'>>,
): BackgammonState {
  const placed = setup ? cleanPosition(setup) : null;
  return {
    points: placed?.points ?? openingPoints(),
    bar: placed?.bar ?? { light: 0, dark: 0 },
    off: placed?.off ?? { light: 0, dark: 0 },
    sides: assignSides(players, undefined),
    turn: placed && (setup?.turn === 'light' || setup?.turn === 'dark') ? setup.turn : 'light',
    dice: null,
    remaining: [],
    undo: [],
    cube: 1,
    cubeOwner: null,
    offer: null,
    winnerSide: null,
    winKind: null,
    lastMove: null,
    lastAction: null,
  };
}

export function playerIdForSide(state: BackgammonState, side: Side): string | null {
  for (const [playerId, assigned] of Object.entries(state.sides)) {
    if (assigned === side) return playerId;
  }
  return null;
}

export function pointCount(state: BackgammonState, point: number): { side: Side | null; count: number } {
  const value = state.points[point - 1] ?? 0;
  if (value > 0) return { side: 'light', count: value };
  if (value < 0) return { side: 'dark', count: -value };
  return { side: null, count: 0 };
}

export function borneOff(state: BackgammonState, playerId: string): number {
  const side = state.sides[playerId];
  if (side !== 'light' && side !== 'dark') return 0;
  return state.off[side];
}

export function pipCount(state: BackgammonState, side: Side): number {
  let pips = state.bar[side] * 25;
  for (let point = 1; point <= POINT_COUNT; point++) {
    pips += countAt(state.points, point, side) * pipsFrom(side, point);
  }
  return pips;
}

export function stake(state: BackgammonState): number {
  return state.cube * (state.winKind ?? 1);
}

export function legalMoves(state: BackgammonState): BackgammonMove[] {
  if (state.winnerSide || state.offer || !state.dice || state.remaining.length === 0) return [];
  const sequences = playSequences(state, state.remaining).filter((sequence) => sequence.length > 0);
  if (sequences.length === 0) return [];
  const max = Math.max(...sequences.map((sequence) => sequence.length));
  let best = sequences.filter((sequence) => sequence.length === max);
  if (max === 1) {
    const faces = [...new Set(state.remaining)];
    if (faces.length >= 2) {
      const high = Math.max(...faces);
      const usingHigh = best.filter((sequence) => sequence[0]?.die === high);
      if (usingHigh.length > 0) best = usingHigh;
    }
  }
  const seen = new Set<string>();
  const moves: BackgammonMove[] = [];
  for (const sequence of best) {
    const move = sequence[0];
    if (!move) continue;
    const key = `${move.from}:${move.to}:${move.die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push(move);
  }
  return moves;
}

export function rollDice(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
  faces?: readonly [number, number],
): BackgammonState | null {
  if (state.winnerSide || state.offer || state.dice) return null;
  const rolled = faces ?? [face(), face()];
  if (!isFace(rolled[0]) || !isFace(rolled[1])) return null;
  const pair: [number, number] = [rolled[0], rolled[1]];
  const remaining = pair[0] === pair[1] ? [pair[0], pair[0], pair[0], pair[0]] : [pair[0], pair[1]];
  const next: BackgammonState = {
    ...state,
    dice: pair,
    remaining,
    undo: [],
    lastMove: null,
  };
  const who = sideName(state, players, state.turn);
  const label = pair[0] === pair[1] ? `double ${pair[0]}s` : `${pair[0]} and ${pair[1]}`;
  const stuck = legalMoves(next).length === 0;
  return { ...next, lastAction: stuck ? `${who} rolls ${label} and cannot move.` : `${who} rolls ${label}.` };
}

export function playMove(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
  move: Pick<BackgammonMove, 'from' | 'to'>,
): BackgammonState | null {
  if (state.winnerSide || state.offer) return null;
  const match = legalMoves(state).find((candidate) => candidate.from === move.from && candidate.to === move.to);
  if (!match) return null;
  const undo = [...state.undo, snap(state)];
  const moved = applyMove(state, match);
  const who = sideName(state, players, state.turn);
  const detail = describeMove(who, match);
  const played: BackgammonState = {
    ...moved,
    dice: state.dice,
    remaining: removeDie(state.remaining, match.die),
    undo,
    lastMove: match,
    lastAction: detail,
  };
  if (played.off[state.turn] === CHECKERS_PER_SIDE) return finishWin(played, players);
  if (legalMoves(played).length === 0) {
    const unused = played.remaining.length > 0 ? ' No further move.' : '';
    return passTurn({ ...played, lastAction: `${detail}${unused}` });
  }
  return played;
}

export function endTurn(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
): BackgammonState | null {
  if (state.winnerSide || state.offer || !state.dice) return null;
  if (legalMoves(state).length > 0) return null;
  const who = sideName(state, players, state.turn);
  return passTurn({ ...state, lastAction: `${who} cannot use the dice.` });
}

export function undoMove(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
): BackgammonState | null {
  const previous = state.undo[state.undo.length - 1];
  if (!previous || state.winnerSide || state.offer) return null;
  const who = sideName(state, players, state.turn);
  return {
    ...state,
    points: previous.points.slice(),
    bar: { ...previous.bar },
    off: { ...previous.off },
    remaining: previous.remaining.slice(),
    undo: state.undo.slice(0, -1),
    lastMove: null,
    lastAction: `${who} undoes the last move.`,
  };
}

export function offerDouble(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
): BackgammonState | null {
  if (state.winnerSide || state.dice || state.offer || state.undo.length > 0) return null;
  if (state.cube >= MAX_CUBE) return null;
  if (state.cubeOwner && state.cubeOwner !== state.turn) return null;
  const who = sideName(state, players, state.turn);
  return { ...state, offer: state.turn, lastAction: `${who} doubles to ${state.cube * 2}.` };
}

export function answerDouble(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
  take: boolean,
): BackgammonState | null {
  if (!state.offer || state.winnerSide) return null;
  const responder = oppositeSide(state.offer);
  const who = sideName(state, players, responder);
  const doubler = sideName(state, players, state.offer);
  if (!take) {
    return {
      ...state,
      offer: null,
      winnerSide: state.offer,
      winKind: 1,
      lastAction: `${who} drops. ${doubler} wins ${state.cube}.`,
    };
  }
  const cube = Math.min(MAX_CUBE, state.cube * 2);
  return {
    ...state,
    offer: null,
    cube,
    cubeOwner: responder,
    lastAction: `${who} takes. The cube is ${cube}.`,
  };
}

export function resign(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
): BackgammonState | null {
  if (state.winnerSide) return null;
  const winner = oppositeSide(state.turn);
  const who = sideName(state, players, state.turn);
  const winnerName = sideName(state, players, winner);
  return {
    ...state,
    offer: null,
    dice: null,
    remaining: [],
    undo: [],
    winnerSide: winner,
    winKind: 1,
    lastAction: `${who} resigns. ${winnerName} wins ${state.cube}.`,
  };
}

export function ensureBackgammonState(game: Game): Game {
  if (game.templateId !== 'backgammon') return game;
  if (game.backgammon && isHealthy(game.backgammon, game.players)) return game;
  return { ...game, backgammon: repairBackgammonState(game) };
}

function finishWin(
  state: BackgammonState,
  players: readonly { id: string; name: string }[],
): BackgammonState {
  const kind = winKindFor(state, state.turn);
  const who = sideName(state, players, state.turn);
  const word = kind === 1 ? 'a single game' : kind === 2 ? 'a gammon' : 'a backgammon';
  return {
    ...state,
    remaining: [],
    undo: [],
    winnerSide: state.turn,
    winKind: kind,
    lastAction: `${who} wins ${word} for ${state.cube * kind}.`,
  };
}

function passTurn(state: BackgammonState): BackgammonState {
  return {
    ...state,
    turn: oppositeSide(state.turn),
    dice: null,
    remaining: [],
    undo: [],
  };
}

function winKindFor(state: Position, winner: Side): WinKind {
  const loser = oppositeSide(winner);
  if (state.off[loser] > 0) return 1;
  if (state.bar[loser] > 0) return 3;
  const [start, end] = winner === 'light' ? [1, 6] : [19, 24];
  for (let point = start; point <= end; point++) {
    if (countAt(state.points, point, loser) > 0) return 3;
  }
  return 2;
}

function playSequences(state: BackgammonState, dice: number[]): BackgammonMove[][] {
  if (dice.length === 0) return [[]];
  const results: BackgammonMove[][] = [];
  const tried = new Set<number>();
  for (const die of dice) {
    if (tried.has(die)) continue;
    tried.add(die);
    for (const move of applications(state, state.turn, die)) {
      const next = applyMove(state, move);
      for (const rest of playSequences(next, removeDie(dice, die))) {
        results.push([move, ...rest]);
      }
    }
  }
  return results.length > 0 ? results : [[]];
}

function applications(state: Position, side: Side, die: number): BackgammonMove[] {
  if (state.bar[side] > 0) {
    const move = enter(state, side, die);
    return move ? [move] : [];
  }
  const moves: BackgammonMove[] = [];
  const seen = new Set<string>();
  for (let point = 1; point <= POINT_COUNT; point++) {
    if (countAt(state.points, point, side) === 0) continue;
    const move = step(state, side, point, die);
    if (!move) continue;
    const key = `${move.from}:${move.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moves.push(move);
  }
  return moves;
}

function enter(state: Position, side: Side, die: number): BackgammonMove | null {
  const point = side === 'light' ? 25 - die : die;
  if (blocked(state.points, side, point)) return null;
  return { from: 'bar', to: point, die, hit: blot(state.points, side, point) };
}

function step(state: Position, side: Side, from: number, die: number): BackgammonMove | null {
  const dest = side === 'light' ? from - die : from + die;
  if (dest >= 1 && dest <= POINT_COUNT) {
    if (blocked(state.points, side, dest)) return null;
    return { from, to: dest, die, hit: blot(state.points, side, dest) };
  }
  if (!canBearOff(state, side)) return null;
  const distance = pipsFrom(side, from);
  if (die === distance) return { from, to: 'off', die, hit: false };
  if (die > distance && distance === farthestPip(state, side)) return { from, to: 'off', die, hit: false };
  return null;
}

function applyMove(state: BackgammonState, move: BackgammonMove): BackgammonState {
  const side = state.turn;
  const opponent = oppositeSide(side);
  let points = state.points.slice();
  const bar: SideCount = { ...state.bar };
  const off: SideCount = { ...state.off };
  if (move.from === 'bar') bar[side] -= 1;
  else points = add(points, move.from, side, -1);
  if (move.to === 'off') {
    off[side] += 1;
  } else {
    if (move.hit) {
      points = add(points, move.to, opponent, -1);
      bar[opponent] += 1;
    }
    points = add(points, move.to, side, 1);
  }
  return { ...state, points, bar, off };
}

function canBearOff(state: Position, side: Side): boolean {
  if (state.bar[side] > 0) return false;
  for (let point = 1; point <= POINT_COUNT; point++) {
    if (countAt(state.points, point, side) > 0 && !inHome(side, point)) return false;
  }
  return true;
}

function farthestPip(state: Position, side: Side): number {
  let farthest = 0;
  for (let point = 1; point <= POINT_COUNT; point++) {
    if (countAt(state.points, point, side) > 0) farthest = Math.max(farthest, pipsFrom(side, point));
  }
  return farthest;
}

function inHome(side: Side, point: number): boolean {
  return side === 'light' ? point >= 1 && point <= 6 : point >= 19 && point <= 24;
}

function pipsFrom(side: Side, point: number): number {
  return side === 'light' ? point : 25 - point;
}

function countAt(points: readonly number[], point: number, side: Side): number {
  const value = points[point - 1] ?? 0;
  if (side === 'light') return value > 0 ? value : 0;
  return value < 0 ? -value : 0;
}

function blocked(points: readonly number[], side: Side, point: number): boolean {
  return countAt(points, point, oppositeSide(side)) >= 2;
}

function blot(points: readonly number[], side: Side, point: number): boolean {
  return countAt(points, point, oppositeSide(side)) === 1;
}

function add(points: number[], point: number, side: Side, delta: number): number[] {
  const next = points.slice();
  const sign = side === 'light' ? 1 : -1;
  next[point - 1] = (next[point - 1] ?? 0) + sign * delta;
  return next;
}

function removeDie(dice: readonly number[], die: number): number[] {
  const index = dice.indexOf(die);
  if (index < 0) return dice.slice();
  return dice.slice(0, index).concat(dice.slice(index + 1));
}

function snap(state: BackgammonState): UndoSnap {
  return {
    points: state.points.slice(),
    bar: { ...state.bar },
    off: { ...state.off },
    remaining: state.remaining.slice(),
  };
}

function describeMove(who: string, move: BackgammonMove): string {
  if (move.from === 'bar' && typeof move.to === 'number') {
    return move.hit ? `${who} enters on ${move.to} and hits.` : `${who} enters on ${move.to}.`;
  }
  if (move.to === 'off' && typeof move.from === 'number') return `${who} bears off from ${move.from}.`;
  if (typeof move.from === 'number' && typeof move.to === 'number') {
    return move.hit ? `${who} hits from ${move.from} to ${move.to}.` : `${who} moves ${move.from} to ${move.to}.`;
  }
  return `${who} moves.`;
}

function sideName(state: BackgammonState, players: readonly { id: string; name: string }[], side: Side): string {
  return players.find((player) => state.sides[player.id] === side)?.name ?? BACKGAMMON_SIDES[side].name;
}

function face(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function isFace(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function openingPoints(): number[] {
  const points = Array.from({ length: POINT_COUNT }, () => 0);
  const light: Array<[number, number]> = [
    [24, 2],
    [13, 5],
    [8, 3],
    [6, 5],
  ];
  const dark: Array<[number, number]> = [
    [1, 2],
    [12, 5],
    [17, 3],
    [19, 5],
  ];
  for (const [point, count] of light) points[point - 1] = count;
  for (const [point, count] of dark) points[point - 1] = -count;
  return points;
}

function assignSides(players: readonly { id: string }[], previous: Record<string, Side> | undefined): Record<string, Side> {
  const sides: Record<string, Side> = {};
  const used = new Set<Side>();
  for (const player of players.slice(0, 2)) {
    const prior = previous?.[player.id];
    if ((prior === 'light' || prior === 'dark') && !used.has(prior)) {
      sides[player.id] = prior;
      used.add(prior);
    }
  }
  for (const player of players.slice(0, 2)) {
    if (sides[player.id]) continue;
    const side: Side = used.has('light') ? 'dark' : 'light';
    sides[player.id] = side;
    used.add(side);
  }
  return sides;
}

function cleanPosition(value: Partial<Pick<BackgammonState, 'points' | 'bar' | 'off'>>): Position | null {
  if (!Array.isArray(value.points) || value.points.length !== POINT_COUNT) return null;
  const points = value.points.map((count) => (Number.isInteger(count) ? count : Number.NaN));
  if (points.some((count) => !Number.isInteger(count))) return null;
  const bar = value.bar == null ? { light: 0, dark: 0 } : cleanCounts(value.bar);
  const off = value.off == null ? { light: 0, dark: 0 } : cleanCounts(value.off);
  if (!bar || !off) return null;
  if (total(points, bar.light, off.light, 'light') !== CHECKERS_PER_SIDE) return null;
  if (total(points, bar.dark, off.dark, 'dark') !== CHECKERS_PER_SIDE) return null;
  return { points, bar, off };
}

function cleanCounts(value: SideCount | undefined): SideCount | null {
  if (!value || !Number.isInteger(value.light) || !Number.isInteger(value.dark)) return null;
  if (value.light < 0 || value.dark < 0) return null;
  return { light: value.light, dark: value.dark };
}

function total(points: readonly number[], bar: number, off: number, side: Side): number {
  let sum = bar + off;
  for (let point = 1; point <= POINT_COUNT; point++) sum += countAt(points, point, side);
  return sum;
}

function repairBackgammonState(game: Game): BackgammonState {
  const previous = game.backgammon;
  const placed = previous ? cleanPosition(previous) : null;
  const fresh = createBackgammonState(game.players);
  if (!placed || !previous) return { ...fresh, sides: assignSides(game.players, previous?.sides) };
  const dice = cleanDice(previous.dice);
  const remaining = dice ? cleanRemaining(previous.remaining, dice) : [];
  const undo = dice && remaining.length < dieCount(dice) ? cleanUndo(previous.undo) : [];
  let winnerSide: Side | null = previous.winnerSide === 'light' || previous.winnerSide === 'dark' ? previous.winnerSide : null;
  let winKind: WinKind | null = previous.winKind === 1 || previous.winKind === 2 || previous.winKind === 3 ? previous.winKind : null;
  if (winnerSide && !winKind) winKind = 1;
  if (!winnerSide) winKind = null;
  const offer: Side | null =
    !winnerSide && (previous.offer === 'light' || previous.offer === 'dark') ? previous.offer : null;
  const cubeOwner: Side | null =
    previous.cubeOwner === 'light' || previous.cubeOwner === 'dark' ? previous.cubeOwner : null;
  const cube = cubeValue(previous.cube);
  return {
    points: placed.points,
    bar: placed.bar,
    off: placed.off,
    sides: assignSides(game.players, previous.sides),
    turn: previous.turn === 'dark' ? 'dark' : 'light',
    dice: winnerSide || offer ? null : dice,
    remaining: winnerSide || offer ? [] : remaining,
    undo: winnerSide || offer ? [] : undo,
    cube,
    cubeOwner,
    offer,
    winnerSide,
    winKind,
    lastMove: cleanMove(previous.lastMove),
    lastAction: typeof previous.lastAction === 'string' ? previous.lastAction : null,
  };
}

function dieCount(dice: [number, number]): number {
  return dice[0] === dice[1] ? 4 : 2;
}

function cubeValue(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return 1;
  let cube = 1;
  while (cube < value && cube < MAX_CUBE) cube *= 2;
  return cube === value ? cube : 1;
}

function cleanDice(value: [number, number] | null | undefined): [number, number] | null {
  if (!value || !isFace(value[0]) || !isFace(value[1])) return null;
  return [value[0], value[1]];
}

function cleanRemaining(value: number[] | undefined, dice: [number, number]): number[] {
  if (!Array.isArray(value)) return [];
  const pool = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
  const remaining: number[] = [];
  for (const die of value) {
    const index = pool.indexOf(die);
    if (index < 0) continue;
    pool.splice(index, 1);
    remaining.push(die);
  }
  return remaining;
}

function cleanUndo(value: UndoSnap[] | undefined): UndoSnap[] {
  if (!Array.isArray(value)) return [];
  const snaps: UndoSnap[] = [];
  for (const snap of value) {
    const placed = snap ? cleanPosition(snap) : null;
    if (!placed || !Array.isArray(snap.remaining)) return [];
    const remaining = snap.remaining.filter(isFace);
    snaps.push({ ...placed, remaining });
  }
  return snaps;
}

function cleanMove(value: BackgammonMove | null | undefined): BackgammonMove | null {
  if (!value) return null;
  const fromOk = value.from === 'bar' || (Number.isInteger(value.from) && value.from >= 1 && value.from <= POINT_COUNT);
  const toOk = value.to === 'off' || (Number.isInteger(value.to) && value.to >= 1 && value.to <= POINT_COUNT);
  if (!fromOk || !toOk || !isFace(value.die) || typeof value.hit !== 'boolean') return null;
  return { from: value.from, to: value.to, die: value.die, hit: value.hit };
}

function isHealthy(state: BackgammonState, players: Player[]): boolean {
  return sameState(state, repairBackgammonState({ backgammon: state, players } as Game));
}

function sameState(a: BackgammonState, b: BackgammonState): boolean {
  return (
    a.turn === b.turn &&
    a.cube === b.cube &&
    a.cubeOwner === b.cubeOwner &&
    a.offer === b.offer &&
    a.winnerSide === b.winnerSide &&
    a.winKind === b.winKind &&
    a.lastAction === b.lastAction &&
    samePair(a.dice, b.dice) &&
    sameNumbers(a.remaining, b.remaining) &&
    sameNumbers(a.points, b.points) &&
    a.bar.light === b.bar.light &&
    a.bar.dark === b.bar.dark &&
    a.off.light === b.off.light &&
    a.off.dark === b.off.dark &&
    sameSides(a.sides, b.sides) &&
    sameMove(a.lastMove, b.lastMove) &&
    a.undo.length === b.undo.length &&
    a.undo.every((snap, index) => {
      const other = b.undo[index];
      return (
        other != null &&
        sameNumbers(snap.points, other.points) &&
        snap.bar.light === other.bar.light &&
        snap.bar.dark === other.bar.dark &&
        snap.off.light === other.off.light &&
        snap.off.dark === other.off.dark &&
        sameNumbers(snap.remaining, other.remaining)
      );
    })
  );
}

function samePair(a: [number, number] | null, b: [number, number] | null): boolean {
  if (!a || !b) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameMove(a: BackgammonMove | null, b: BackgammonMove | null): boolean {
  if (!a || !b) return a === b;
  return a.from === b.from && a.to === b.to && a.die === b.die && a.hit === b.hit;
}

function sameSides(a: Record<string, Side>, b: Record<string, Side>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}
