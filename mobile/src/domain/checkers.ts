import type { Game, Player } from './models';

/**
 * American checkers (English draughts) on the dark squares of an 8×8 board.
 *
 * Black moves first. Men move and jump diagonally forward. Kings move and jump
 * one square in any diagonal direction. A jump is required when one is available;
 * if several jumps are open, the player may choose any of them. A piece that
 * jumps must keep jumping. A man that reaches the back rank by a jump is crowned
 * immediately and continues as a king when another jump is open.
 */

export const BOARD_SIZE = 8;
export const MEN_PER_SIDE = 12;

export const CHECKERS_SIDES = {
  dark: { id: 'dark', name: 'Black', fill: '#1b140f', rim: '#e6c56a', ink: '#f6f1e6' },
  light: { id: 'light', name: 'Red', fill: '#c44536', rim: '#f6d2c6', ink: '#fffaf0' },
} as const;

export type Side = keyof typeof CHECKERS_SIDES;
export type Kind = 'man' | 'king';

export type CheckersPiece = {
  row: number;
  col: number;
  side: Side;
  kind: Kind;
};

export type CheckersHop = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  captureRow: number | null;
  captureCol: number | null;
};

export type CheckersSquare = { row: number; col: number };

export type CheckersState = {
  pieces: CheckersPiece[];
  sides: Record<string, Side>;
  turn: Side;
  /** Set while the piece that just jumped must jump again. */
  chain: CheckersSquare | null;
  winnerSide: Side | null;
  draw: boolean;
  drawOffer: Side | null;
  lastMove: CheckersHop | null;
  lastAction: string | null;
};

const KING_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function oppositeSide(side: Side): Side {
  return side === 'dark' ? 'light' : 'dark';
}

export function isDarkSquare(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    col >= 0 &&
    row < BOARD_SIZE &&
    col < BOARD_SIZE &&
    (row + col) % 2 === 1
  );
}

export function createCheckersState(players: { id: string }[]): CheckersState {
  return {
    pieces: startingPieces(),
    sides: assignSides(players, undefined),
    turn: 'dark',
    chain: null,
    winnerSide: null,
    draw: false,
    drawOffer: null,
    lastMove: null,
    lastAction: null,
  };
}

export function pieceAt(pieces: readonly CheckersPiece[], row: number, col: number): CheckersPiece | null {
  return pieces.find((piece) => piece.row === row && piece.col === col) ?? null;
}

export function playerIdForSide(state: CheckersState, side: Side): string | null {
  for (const [playerId, assigned] of Object.entries(state.sides)) {
    if (assigned === side) return playerId;
  }
  return null;
}

export function capturedCount(state: CheckersState, playerId: string): number {
  const side = state.sides[playerId];
  if (side !== 'dark' && side !== 'light') return 0;
  const remaining = state.pieces.filter((piece) => piece.side === oppositeSide(side)).length;
  return MEN_PER_SIDE - remaining;
}

export function legalHops(state: CheckersState): CheckersHop[] {
  if (state.winnerSide || state.draw) return [];
  if (state.chain) {
    const piece = pieceAt(state.pieces, state.chain.row, state.chain.col);
    if (!piece || piece.side !== state.turn) return [];
    return jumpsFrom(state.pieces, piece);
  }
  const mine = state.pieces.filter((piece) => piece.side === state.turn);
  const jumps = mine.flatMap((piece) => jumpsFrom(state.pieces, piece));
  if (jumps.length > 0) return jumps;
  return mine.flatMap((piece) => stepsFrom(state.pieces, piece));
}

export function playHop(
  state: CheckersState,
  players: readonly { id: string; name: string }[],
  hop: Pick<CheckersHop, 'fromRow' | 'fromCol' | 'toRow' | 'toCol'>,
): CheckersState | null {
  if (state.winnerSide || state.draw) return null;
  const match = legalHops(state).find(
    (candidate) =>
      candidate.fromRow === hop.fromRow &&
      candidate.fromCol === hop.fromCol &&
      candidate.toRow === hop.toRow &&
      candidate.toCol === hop.toCol,
  );
  if (!match) return null;
  const pieces = applyHop(state.pieces, match);
  if (!pieces) return null;

  const mover = state.turn;
  const before = pieceAt(state.pieces, match.fromRow, match.fromCol);
  const landed = pieceAt(pieces, match.toRow, match.toCol);
  if (!before || !landed) return null;
  const captured = match.captureRow != null;
  const crowned = before.kind === 'man' && landed.kind === 'king';
  const continuing = captured && jumpsFrom(pieces, landed).length > 0;
  const who = players.find((player) => state.sides[player.id] === mover)?.name ?? CHECKERS_SIDES[mover].name;

  const next: CheckersState = {
    ...state,
    pieces,
    turn: continuing ? mover : oppositeSide(mover),
    chain: continuing ? { row: match.toRow, col: match.toCol } : null,
    winnerSide: null,
    draw: false,
    drawOffer: null,
    lastMove: match,
    lastAction: describeHop(who, captured, crowned, continuing),
  };
  if (continuing) return next;
  return finishTurn(next, players);
}

export function offerDraw(state: CheckersState, players: readonly { id: string; name: string }[]): CheckersState | null {
  if (state.winnerSide || state.draw || state.chain) return null;
  const who = sideName(state, players, state.turn);
  if (state.drawOffer === state.turn) {
    return { ...state, drawOffer: null, lastAction: `${who} withdrew the draw offer.` };
  }
  return { ...state, drawOffer: state.turn, lastAction: `${who} offers a draw.` };
}

export function answerDraw(
  state: CheckersState,
  players: readonly { id: string; name: string }[],
  accept: boolean,
): CheckersState | null {
  if (!state.drawOffer || state.winnerSide || state.draw) return null;
  const responder = oppositeSide(state.drawOffer);
  const who = sideName(state, players, responder);
  if (!accept) return { ...state, drawOffer: null, lastAction: `${who} declines the draw.` };
  return {
    ...state,
    draw: true,
    drawOffer: null,
    chain: null,
    lastAction: 'The game is a draw.',
  };
}

export function resign(state: CheckersState, players: readonly { id: string; name: string }[]): CheckersState | null {
  if (state.winnerSide || state.draw) return null;
  const winner = oppositeSide(state.turn);
  const who = sideName(state, players, state.turn);
  const winnerName = sideName(state, players, winner);
  return {
    ...state,
    winnerSide: winner,
    chain: null,
    drawOffer: null,
    lastAction: `${who} resigns. ${winnerName} wins.`,
  };
}

export function ensureCheckersState(game: Game): Game {
  if (game.templateId !== 'checkers') return game;
  if (game.checkers && isHealthy(game.checkers, game.players)) return game;
  return { ...game, checkers: repairCheckersState(game) };
}

function startingPieces(): CheckersPiece[] {
  const pieces: CheckersPiece[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!isDarkSquare(row, col)) continue;
      if (row <= 2) pieces.push({ row, col, side: 'light', kind: 'man' });
      if (row >= 5) pieces.push({ row, col, side: 'dark', kind: 'man' });
    }
  }
  return pieces;
}

function moveDirs(piece: CheckersPiece): ReadonlyArray<readonly [number, number]> {
  if (piece.kind === 'king') return KING_DIRS;
  const forward = piece.side === 'dark' ? -1 : 1;
  return [
    [forward, -1],
    [forward, 1],
  ];
}

function stepsFrom(pieces: readonly CheckersPiece[], piece: CheckersPiece): CheckersHop[] {
  const hops: CheckersHop[] = [];
  for (const [dRow, dCol] of moveDirs(piece)) {
    const toRow = piece.row + dRow;
    const toCol = piece.col + dCol;
    if (!isDarkSquare(toRow, toCol) || pieceAt(pieces, toRow, toCol)) continue;
    hops.push({
      fromRow: piece.row,
      fromCol: piece.col,
      toRow,
      toCol,
      captureRow: null,
      captureCol: null,
    });
  }
  return hops;
}

function jumpsFrom(pieces: readonly CheckersPiece[], piece: CheckersPiece): CheckersHop[] {
  const hops: CheckersHop[] = [];
  for (const [dRow, dCol] of moveDirs(piece)) {
    const captureRow = piece.row + dRow;
    const captureCol = piece.col + dCol;
    const toRow = piece.row + dRow * 2;
    const toCol = piece.col + dCol * 2;
    if (!isDarkSquare(toRow, toCol) || pieceAt(pieces, toRow, toCol)) continue;
    const captured = pieceAt(pieces, captureRow, captureCol);
    if (!captured || captured.side === piece.side) continue;
    hops.push({
      fromRow: piece.row,
      fromCol: piece.col,
      toRow,
      toCol,
      captureRow,
      captureCol,
    });
  }
  return hops;
}

function applyHop(pieces: readonly CheckersPiece[], hop: CheckersHop): CheckersPiece[] | null {
  const moving = pieceAt(pieces, hop.fromRow, hop.fromCol);
  if (!moving) return null;
  let next = pieces.filter((piece) => piece.row !== hop.fromRow || piece.col !== hop.fromCol);
  if (hop.captureRow != null && hop.captureCol != null) {
    if (!pieceAt(next, hop.captureRow, hop.captureCol)) return null;
    next = next.filter((piece) => piece.row !== hop.captureRow || piece.col !== hop.captureCol);
  }
  next.push(crown({ ...moving, row: hop.toRow, col: hop.toCol }));
  return next;
}

function crown(piece: CheckersPiece): CheckersPiece {
  const promoted =
    piece.kind === 'man' &&
    ((piece.side === 'dark' && piece.row === 0) || (piece.side === 'light' && piece.row === BOARD_SIZE - 1));
  return promoted ? { ...piece, kind: 'king' } : piece;
}

function finishTurn(state: CheckersState, players: readonly { id: string; name: string }[]): CheckersState {
  const result = resolution(state);
  if (!result.winnerSide && !result.draw) return state;
  if (result.draw) {
    return { ...state, draw: true, chain: null, drawOffer: null, lastAction: 'The game is a draw.' };
  }
  const winnerName = sideName(state, players, result.winnerSide as Side);
  const detail = state.lastAction ? `${state.lastAction} ` : '';
  return {
    ...state,
    winnerSide: result.winnerSide,
    chain: null,
    drawOffer: null,
    lastAction: `${detail}${winnerName} wins.`,
  };
}

function resolution(state: CheckersState): { winnerSide: Side | null; draw: boolean } {
  if (state.chain) return { winnerSide: null, draw: false };
  const side = state.turn;
  const opponent = oppositeSide(side);
  const sidePieces = state.pieces.some((piece) => piece.side === side);
  const opponentPieces = state.pieces.some((piece) => piece.side === opponent);
  if (!sidePieces && !opponentPieces) return { winnerSide: null, draw: true };
  if (!opponentPieces) return { winnerSide: side, draw: false };
  if (!sidePieces) return { winnerSide: opponent, draw: false };
  const open = legalHops({ ...state, winnerSide: null, draw: false, drawOffer: null });
  if (open.length === 0) return { winnerSide: opponent, draw: false };
  return { winnerSide: null, draw: false };
}

function describeHop(who: string, captured: boolean, crowned: boolean, continuing: boolean): string {
  const verb = captured ? 'jumps' : 'moves';
  const crown = crowned ? ' and is crowned' : '';
  const more = continuing ? ' and must jump again' : '';
  return `${who} ${verb}${crown}${more}.`;
}

function sideName(state: CheckersState, players: readonly { id: string; name: string }[], side: Side): string {
  return players.find((player) => state.sides[player.id] === side)?.name ?? CHECKERS_SIDES[side].name;
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

function cleanPieces(value: unknown): CheckersPiece[] | null {
  if (!Array.isArray(value)) return null;
  const pieces: CheckersPiece[] = [];
  const seen = new Set<string>();
  const counts: Record<Side, number> = { dark: 0, light: 0 };
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Partial<CheckersPiece>;
    const row = raw.row;
    const col = raw.col;
    if (typeof row !== 'number' || typeof col !== 'number' || !isDarkSquare(row, col)) return null;
    if (raw.side !== 'dark' && raw.side !== 'light') return null;
    if (raw.kind !== 'man' && raw.kind !== 'king') return null;
    const key = `${row},${col}`;
    if (seen.has(key)) return null;
    seen.add(key);
    counts[raw.side] += 1;
    if (counts[raw.side] > MEN_PER_SIDE) return null;
    pieces.push({ row, col, side: raw.side, kind: raw.kind });
  }
  return pieces;
}

function cleanSquare(value: unknown): CheckersSquare | null {
  if (!value || typeof value !== 'object') return null;
  const square = value as Partial<CheckersSquare>;
  if (!isDarkSquare(square.row as number, square.col as number)) return null;
  return { row: square.row as number, col: square.col as number };
}

function cleanHop(value: unknown): CheckersHop | null {
  if (!value || typeof value !== 'object') return null;
  const hop = value as Partial<CheckersHop>;
  if (!isDarkSquare(hop.fromRow as number, hop.fromCol as number)) return null;
  if (!isDarkSquare(hop.toRow as number, hop.toCol as number)) return null;
  const capture =
    hop.captureRow == null && hop.captureCol == null
      ? { captureRow: null, captureCol: null }
      : isDarkSquare(hop.captureRow as number, hop.captureCol as number)
        ? { captureRow: hop.captureRow as number, captureCol: hop.captureCol as number }
        : null;
  if (!capture) return null;
  return {
    fromRow: hop.fromRow as number,
    fromCol: hop.fromCol as number,
    toRow: hop.toRow as number,
    toCol: hop.toCol as number,
    captureRow: capture.captureRow,
    captureCol: capture.captureCol,
  };
}

function repairCheckersState(game: Game): CheckersState {
  const previous = game.checkers;
  const cleaned = previous ? cleanPieces(previous.pieces) : null;
  const pieces = cleaned ?? startingPieces();
  const kept = cleaned != null;
  const sides = assignSides(game.players, previous?.sides);
  const turn: Side = kept && (previous?.turn === 'dark' || previous?.turn === 'light') ? previous.turn : 'dark';
  let chain = kept ? cleanSquare(previous?.chain) : null;
  let winnerSide: Side | null =
    kept && (previous?.winnerSide === 'dark' || previous?.winnerSide === 'light') ? previous.winnerSide : null;
  let draw = kept && previous?.draw === true && winnerSide == null;
  if (winnerSide) draw = false;
  let drawOffer: Side | null =
    kept &&
    !winnerSide &&
    !draw &&
    !chain &&
    (previous?.drawOffer === 'dark' || previous?.drawOffer === 'light')
      ? previous.drawOffer
      : null;
  const lastMove = kept ? cleanHop(previous?.lastMove) : null;
  const lastAction = typeof previous?.lastAction === 'string' ? previous.lastAction : null;

  if (chain) {
    const piece = pieceAt(pieces, chain.row, chain.col);
    if (!piece || piece.side !== turn || jumpsFrom(pieces, piece).length === 0) chain = null;
  }
  if (chain) drawOffer = null;

  const repaired: CheckersState = {
    pieces,
    sides,
    turn,
    chain,
    winnerSide,
    draw,
    drawOffer,
    lastMove,
    lastAction,
  };
  if (!winnerSide && !draw) {
    const result = resolution(repaired);
    if (result.winnerSide || result.draw) {
      return {
        ...repaired,
        winnerSide: result.winnerSide,
        draw: result.draw,
        chain: null,
        drawOffer: null,
      };
    }
  }
  return repaired;
}

function isHealthy(state: CheckersState, players: Player[]): boolean {
  return sameState(state, repairCheckersState({ checkers: state, players } as Game));
}

function sameState(a: CheckersState, b: CheckersState): boolean {
  return (
    a.turn === b.turn &&
    a.winnerSide === b.winnerSide &&
    a.draw === b.draw &&
    a.drawOffer === b.drawOffer &&
    a.lastAction === b.lastAction &&
    sameSquare(a.chain, b.chain) &&
    sameHop(a.lastMove, b.lastMove) &&
    sameSides(a.sides, b.sides) &&
    samePieces(a.pieces, b.pieces)
  );
}

function samePieces(a: readonly CheckersPiece[], b: readonly CheckersPiece[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (piece, index) =>
        piece.row === b[index].row &&
        piece.col === b[index].col &&
        piece.side === b[index].side &&
        piece.kind === b[index].kind,
    )
  );
}

function sameSides(a: Record<string, Side>, b: Record<string, Side>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function sameSquare(a: CheckersSquare | null, b: CheckersSquare | null): boolean {
  if (!a || !b) return a === b;
  return a.row === b.row && a.col === b.col;
}

function sameHop(a: CheckersHop | null, b: CheckersHop | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.fromRow === b.fromRow &&
    a.fromCol === b.fromCol &&
    a.toRow === b.toRow &&
    a.toCol === b.toCol &&
    a.captureRow === b.captureRow &&
    a.captureCol === b.captureCol
  );
}
