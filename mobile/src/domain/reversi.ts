import type { Game, Player } from './models';

/**
 * Reversi on an 8×8 board, with the fixed diagonal opening.
 *
 * Black moves first. A move places a disc that brackets one or more straight
 * lines of the other color. Every bracketed disc flips. Lines count across,
 * down, and on both diagonals. A side that cannot flip anything is skipped.
 * When neither side can move, the higher count wins. An equal count is a draw.
 */

export const BOARD_SIZE = 8;

export const REVERSI_SIDES = {
  dark: { id: 'dark', name: 'Black', fill: '#161311', rim: '#3d3832', ink: '#f6f1e6' },
  light: { id: 'light', name: 'White', fill: '#f4efe4', rim: '#d5cbb8', ink: '#1b140f' },
} as const;

export type Side = keyof typeof REVERSI_SIDES;

export type ReversiSquare = { row: number; col: number };

export type ReversiMove = ReversiSquare & {
  flips: ReversiSquare[];
};

export type ReversiState = {
  /** 64 cells, row-major from the top. null is empty. */
  cells: (Side | null)[];
  sides: Record<string, Side>;
  turn: Side;
  winnerSide: Side | null;
  draw: boolean;
  drawOffer: Side | null;
  lastMove: ReversiSquare | null;
  lastFlips: ReversiSquare[];
  lastAction: string | null;
};

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

export function oppositeSide(side: Side): Side {
  return side === 'dark' ? 'light' : 'dark';
}

export function createReversiState(players: { id: string }[]): ReversiState {
  return {
    cells: startingCells(),
    sides: assignSides(players, undefined),
    turn: 'dark',
    winnerSide: null,
    draw: false,
    drawOffer: null,
    lastMove: null,
    lastFlips: [],
    lastAction: null,
  };
}

export function countDiscs(cells: readonly (Side | null)[], side: Side): number {
  let count = 0;
  for (const cell of cells) if (cell === side) count += 1;
  return count;
}

export function discCount(state: ReversiState, playerId: string): number {
  const side = state.sides[playerId];
  if (side !== 'dark' && side !== 'light') return 0;
  return countDiscs(state.cells, side);
}

export function playerIdForSide(state: ReversiState, side: Side): string | null {
  for (const [playerId, assigned] of Object.entries(state.sides)) {
    if (assigned === side) return playerId;
  }
  return null;
}

export function legalMoves(state: ReversiState): ReversiMove[] {
  if (state.winnerSide || state.draw) return [];
  return movesFor(state.cells, state.turn);
}

export function playMove(
  state: ReversiState,
  players: readonly { id: string; name: string }[],
  row: number,
  col: number,
): ReversiState | null {
  if (state.winnerSide || state.draw) return null;
  const match = movesFor(state.cells, state.turn).find((move) => move.row === row && move.col === col);
  if (!match) return null;
  const mover = state.turn;
  const cells = applyMove(state.cells, match, mover);
  const who = sideName(state, players, mover);
  const flipped = match.flips.length;
  const next: ReversiState = {
    ...state,
    cells,
    drawOffer: null,
    lastMove: { row, col },
    lastFlips: match.flips.map((flip) => ({ ...flip })),
    lastAction: `${who} flips ${flipped} ${flipped === 1 ? 'disc' : 'discs'}.`,
  };
  return handoff(next, players, mover);
}

export function offerDraw(state: ReversiState, players: readonly { id: string; name: string }[]): ReversiState | null {
  if (state.winnerSide || state.draw) return null;
  const who = sideName(state, players, state.turn);
  if (state.drawOffer === state.turn) {
    return { ...state, drawOffer: null, lastAction: `${who} withdrew the draw offer.` };
  }
  return { ...state, drawOffer: state.turn, lastAction: `${who} offers a draw.` };
}

export function answerDraw(
  state: ReversiState,
  players: readonly { id: string; name: string }[],
  accept: boolean,
): ReversiState | null {
  if (!state.drawOffer || state.winnerSide || state.draw) return null;
  const responder = oppositeSide(state.drawOffer);
  const who = sideName(state, players, responder);
  if (!accept) return { ...state, drawOffer: null, lastAction: `${who} declines the draw.` };
  return {
    ...state,
    draw: true,
    drawOffer: null,
    lastAction: 'The game is a draw.',
  };
}

export function resign(state: ReversiState, players: readonly { id: string; name: string }[]): ReversiState | null {
  if (state.winnerSide || state.draw) return null;
  const winner = oppositeSide(state.turn);
  const who = sideName(state, players, state.turn);
  const winnerName = sideName(state, players, winner);
  return {
    ...state,
    winnerSide: winner,
    drawOffer: null,
    lastAction: `${who} resigns. ${winnerName} wins.`,
  };
}

export function ensureReversiState(game: Game): Game {
  if (game.templateId !== 'reversi') return game;
  if (game.reversi && isHealthy(game.reversi, game.players)) return game;
  return { ...game, reversi: repairReversiState(game) };
}

function startingCells(): (Side | null)[] {
  const cells: (Side | null)[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null);
  // Rank 8 is the top row. Black starts on d5 and e4, White on e5 and d4.
  cells[3 * BOARD_SIZE + 3] = 'dark';
  cells[3 * BOARD_SIZE + 4] = 'light';
  cells[4 * BOARD_SIZE + 3] = 'light';
  cells[4 * BOARD_SIZE + 4] = 'dark';
  return cells;
}

function index(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

function onBoard(row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE;
}

function flipsFrom(cells: readonly (Side | null)[], row: number, col: number, side: Side): ReversiSquare[] {
  if (!onBoard(row, col) || cells[index(row, col)] != null) return [];
  const opponent = oppositeSide(side);
  const flips: ReversiSquare[] = [];
  for (const [dRow, dCol] of DIRS) {
    const line: ReversiSquare[] = [];
    let nextRow = row + dRow;
    let nextCol = col + dCol;
    while (onBoard(nextRow, nextCol) && cells[index(nextRow, nextCol)] === opponent) {
      line.push({ row: nextRow, col: nextCol });
      nextRow += dRow;
      nextCol += dCol;
    }
    if (line.length > 0 && onBoard(nextRow, nextCol) && cells[index(nextRow, nextCol)] === side) {
      flips.push(...line);
    }
  }
  return flips;
}

function movesFor(cells: readonly (Side | null)[], side: Side): ReversiMove[] {
  const moves: ReversiMove[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const flips = flipsFrom(cells, row, col, side);
      if (flips.length > 0) moves.push({ row, col, flips });
    }
  }
  return moves;
}

function applyMove(cells: readonly (Side | null)[], move: ReversiMove, side: Side): (Side | null)[] {
  const next = cells.slice();
  next[index(move.row, move.col)] = side;
  for (const flip of move.flips) next[index(flip.row, flip.col)] = side;
  return next;
}

function handoff(
  state: ReversiState,
  players: readonly { id: string; name: string }[],
  mover: Side,
): ReversiState {
  const opponent = oppositeSide(mover);
  const opponentMoves = movesFor(state.cells, opponent);
  if (opponentMoves.length > 0) return { ...state, turn: opponent };
  if (movesFor(state.cells, mover).length > 0) {
    const passed = sideName(state, players, opponent);
    const detail = state.lastAction ? `${state.lastAction} ` : '';
    return { ...state, turn: mover, lastAction: `${detail}${passed} has no move.` };
  }
  return finish(state, players);
}

function finish(state: ReversiState, players: readonly { id: string; name: string }[]): ReversiState {
  const dark = countDiscs(state.cells, 'dark');
  const light = countDiscs(state.cells, 'light');
  const detail = state.lastAction ? `${state.lastAction} ` : '';
  if (dark === light) {
    return {
      ...state,
      draw: true,
      winnerSide: null,
      drawOffer: null,
      lastAction: `${detail}${dark} discs each. The game is a draw.`,
    };
  }
  const winner: Side = dark > light ? 'dark' : 'light';
  const winnerName = sideName(state, players, winner);
  const high = Math.max(dark, light);
  const low = Math.min(dark, light);
  return {
    ...state,
    winnerSide: winner,
    draw: false,
    drawOffer: null,
    lastAction: `${detail}${winnerName} wins ${high} to ${low}.`,
  };
}

function sideName(state: ReversiState, players: readonly { id: string; name: string }[], side: Side): string {
  return players.find((player) => state.sides[player.id] === side)?.name ?? REVERSI_SIDES[side].name;
}

function assignSides(players: readonly { id: string }[], previous: Record<string, Side> | undefined): Record<string, Side> {
  const sides: Record<string, Side> = {};
  const used = new Set<Side>();
  for (const player of players.slice(0, 2)) {
    const prior = previous?.[player.id];
    if ((prior === 'dark' || prior === 'light') && !used.has(prior)) {
      sides[player.id] = prior;
      used.add(prior);
    }
  }
  for (const player of players.slice(0, 2)) {
    if (sides[player.id]) continue;
    const side: Side = used.has('dark') ? 'light' : 'dark';
    sides[player.id] = side;
    used.add(side);
  }
  return sides;
}

function cleanCells(value: unknown): (Side | null)[] | null {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE * BOARD_SIZE) return null;
  const cells: (Side | null)[] = [];
  for (const item of value) {
    if (item == null) cells.push(null);
    else if (item === 'dark' || item === 'light') cells.push(item);
    else return null;
  }
  const occupied = cells.filter((cell) => cell != null).length;
  if (occupied < 4) return null;
  return cells;
}

function cleanSquare(value: unknown): ReversiSquare | null {
  if (!value || typeof value !== 'object') return null;
  const square = value as Partial<ReversiSquare>;
  if (!onBoard(square.row as number, square.col as number)) return null;
  return { row: square.row as number, col: square.col as number };
}

function cleanFlips(value: unknown): ReversiSquare[] {
  if (!Array.isArray(value)) return [];
  const flips: ReversiSquare[] = [];
  for (const item of value) {
    const square = cleanSquare(item);
    if (!square) return [];
    flips.push(square);
  }
  return flips;
}

function repairReversiState(game: Game): ReversiState {
  const previous = game.reversi;
  const cleaned = previous ? cleanCells(previous.cells) : null;
  const cells = cleaned ?? startingCells();
  const kept = cleaned != null;
  const sides = assignSides(game.players, previous?.sides);
  let turn: Side = kept && (previous?.turn === 'dark' || previous?.turn === 'light') ? previous.turn : 'dark';
  let winnerSide: Side | null =
    kept && (previous?.winnerSide === 'dark' || previous?.winnerSide === 'light') ? previous.winnerSide : null;
  let draw = kept && previous?.draw === true && winnerSide == null;
  if (winnerSide) draw = false;
  let drawOffer: Side | null =
    kept && !winnerSide && !draw && (previous?.drawOffer === 'dark' || previous?.drawOffer === 'light')
      ? previous.drawOffer
      : null;
  const lastMove = kept ? cleanSquare(previous?.lastMove) : null;
  const lastFlips = kept ? cleanFlips(previous?.lastFlips) : [];
  const lastAction = typeof previous?.lastAction === 'string' ? previous.lastAction : null;

  if (!winnerSide && !draw) {
    if (movesFor(cells, turn).length === 0 && movesFor(cells, oppositeSide(turn)).length > 0) {
      turn = oppositeSide(turn);
      drawOffer = null;
    }
  }

  const repaired: ReversiState = {
    cells,
    sides,
    turn,
    winnerSide,
    draw,
    drawOffer,
    lastMove,
    lastFlips,
    lastAction,
  };
  if (!winnerSide && !draw && movesFor(cells, turn).length === 0) {
    return finish(repaired, game.players);
  }
  return repaired;
}

function isHealthy(state: ReversiState, players: Player[]): boolean {
  return sameState(state, repairReversiState({ reversi: state, players } as Game));
}

function sameState(a: ReversiState, b: ReversiState): boolean {
  return (
    a.turn === b.turn &&
    a.winnerSide === b.winnerSide &&
    a.draw === b.draw &&
    a.drawOffer === b.drawOffer &&
    a.lastAction === b.lastAction &&
    sameSquare(a.lastMove, b.lastMove) &&
    sameFlips(a.lastFlips, b.lastFlips) &&
    sameSides(a.sides, b.sides) &&
    sameCells(a.cells, b.cells)
  );
}

function sameCells(a: readonly (Side | null)[], b: readonly (Side | null)[]): boolean {
  return a.length === b.length && a.every((cell, index) => cell === b[index]);
}

function sameSides(a: Record<string, Side>, b: Record<string, Side>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function sameSquare(a: ReversiSquare | null, b: ReversiSquare | null): boolean {
  if (!a || !b) return a === b;
  return a.row === b.row && a.col === b.col;
}

function sameFlips(a: readonly ReversiSquare[], b: readonly ReversiSquare[]): boolean {
  return a.length === b.length && a.every((flip, index) => flip.row === b[index].row && flip.col === b[index].col);
}
