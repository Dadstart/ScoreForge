import type { Game, Player } from './models';

/**
 * Standard chess. Row 0 is rank 8 and row 7 is rank 1, so White sits at the
 * bottom until the board flips for Black. White moves first.
 *
 * The game plays castling, en passant, and promotion. A side in check must
 * get out. Checkmate wins. Stalemate, threefold repetition, the fifty-move
 * rule, and insufficient material are draws.
 */

export const BOARD_SIZE = 8;

export const CHESS_SIDES = {
  white: { id: 'white', name: 'White', fill: '#f7f3ea', ink: '#1a120c', rim: '#d4a84b' },
  black: { id: 'black', name: 'Black', fill: '#1a120c', ink: '#f7f3ea', rim: '#8d6a32' },
} as const;

export type Side = keyof typeof CHESS_SIDES;
export type PieceKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PromotionKind = 'queen' | 'rook' | 'bishop' | 'knight';

export const PIECE_GLYPH: Record<PieceKind, string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};

export const PIECE_VALUE: Record<PieceKind, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

const PROMOTIONS: readonly PromotionKind[] = ['queen', 'rook', 'bishop', 'knight'];
const KIND_ORDER: readonly PieceKind[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

export type ChessPiece = {
  row: number;
  col: number;
  side: Side;
  kind: PieceKind;
};

export type ChessSquare = { row: number; col: number };

export type ChessMove = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  promotion: PromotionKind | null;
  castle: 'kingside' | 'queenside' | null;
  enPassant: boolean;
  capture: boolean;
};

export type CastlingRights = {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
};

export type ChessState = {
  pieces: ChessPiece[];
  sides: Record<string, Side>;
  turn: Side;
  castling: CastlingRights;
  /** Square a pawn skipped on a double step. Cleared if it is not taken at once. */
  enPassant: ChessSquare | null;
  /** Plies since the last capture or pawn move. 100 ends the game. */
  halfmove: number;
  fullmove: number;
  /** Pieces lost by that side, in the order they were taken. */
  taken: Record<Side, PieceKind[]>;
  /** Position keys, including the current one, for threefold repetition. */
  history: string[];
  winnerSide: Side | null;
  draw: boolean;
  drawOffer: Side | null;
  lastMove: ChessMove | null;
  lastAction: string | null;
};

type Delta = readonly [number, number];

const KNIGHT_DELTAS: readonly Delta[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_DELTAS: readonly Delta[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const BISHOP_DELTAS: readonly Delta[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DELTAS: readonly Delta[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const OPEN_RIGHTS: CastlingRights = {
  whiteKingside: true,
  whiteQueenside: true,
  blackKingside: true,
  blackQueenside: true,
};

export function oppositeSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

export function onBoard(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE;
}

export function squareName(row: number, col: number): string {
  return `${'abcdefgh'[col] ?? '?'}${8 - row}`;
}

export function pieceAt(pieces: readonly ChessPiece[], row: number, col: number): ChessPiece | null {
  if (!onBoard(row, col)) return null;
  return pieces.find((piece) => piece.row === row && piece.col === col) ?? null;
}

export function createChessState(players: { id: string }[]): ChessState {
  const state: ChessState = {
    pieces: startingPieces(),
    sides: assignSides(players, undefined),
    turn: 'white',
    castling: { ...OPEN_RIGHTS },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    taken: { white: [], black: [] },
    history: [],
    winnerSide: null,
    draw: false,
    drawOffer: null,
    lastMove: null,
    lastAction: null,
  };
  state.history = [positionKey(state)];
  return state;
}

export function playerIdForSide(state: ChessState, side: Side): string | null {
  for (const [playerId, assigned] of Object.entries(state.sides)) {
    if (assigned === side) return playerId;
  }
  return null;
}

export function lostPieces(state: ChessState, side: Side): PieceKind[] {
  const lost = state.taken?.[side] ?? [];
  return [...lost].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
}

/** Material the player has captured. Kings are never taken. */
export function capturedValue(state: ChessState, playerId: string): number {
  const side = state.sides[playerId];
  if (side !== 'white' && side !== 'black') return 0;
  return lostPieces(state, oppositeSide(side)).reduce((sum, kind) => sum + PIECE_VALUE[kind], 0);
}

export function checkedKing(state: ChessState): ChessSquare | null {
  if (state.winnerSide || state.draw) return null;
  const king = kingPiece(state.pieces, state.turn);
  if (!king || !attacked(state.pieces, king.row, king.col, oppositeSide(state.turn))) return null;
  return { row: king.row, col: king.col };
}

export function legalMoves(state: ChessState): ChessMove[] {
  if (state.winnerSide || state.draw) return [];
  const moves: ChessMove[] = [];
  for (const piece of state.pieces) {
    if (piece.side !== state.turn) continue;
    moves.push(...pseudoMoves(state, piece));
  }
  return moves.filter((move) => kingSafeAfter(state.pieces, move, state.turn));
}

export function playMove(
  state: ChessState,
  players: readonly { id: string; name: string }[],
  request: { fromRow: number; fromCol: number; toRow: number; toCol: number; promotion?: PromotionKind | null },
): ChessState | null {
  if (state.winnerSide || state.draw) return null;
  const promotion = request.promotion ?? null;
  const match = legalMoves(state).find(
    (move) =>
      move.fromRow === request.fromRow &&
      move.fromCol === request.fromCol &&
      move.toRow === request.toRow &&
      move.toCol === request.toCol &&
      move.promotion === promotion,
  );
  if (!match) return null;
  const moving = pieceAt(state.pieces, match.fromRow, match.fromCol);
  if (!moving || moving.side !== state.turn) return null;

  const applied = applyMove(state.pieces, match);
  const victim = oppositeSide(moving.side);
  const taken = applied.captured
    ? {
        white: victim === 'white' ? [...state.taken.white, applied.captured] : [...state.taken.white],
        black: victim === 'black' ? [...state.taken.black, applied.captured] : [...state.taken.black],
      }
    : { white: [...state.taken.white], black: [...state.taken.black] };
  const who = sideName(state, players, moving.side);
  const next: ChessState = {
    pieces: applied.pieces,
    sides: state.sides,
    turn: oppositeSide(state.turn),
    castling: updateCastling(state.castling, match),
    enPassant:
      moving.kind === 'pawn' && Math.abs(match.toRow - match.fromRow) === 2
        ? { row: (match.fromRow + match.toRow) / 2, col: match.fromCol }
        : null,
    halfmove: moving.kind === 'pawn' || applied.captured ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'black' ? state.fullmove + 1 : state.fullmove,
    taken,
    history: state.history,
    winnerSide: null,
    draw: false,
    drawOffer: null,
    lastMove: match,
    lastAction: describeMove(who, moving.kind, match),
  };
  next.history = [...state.history, positionKey(next)];
  if (checkedKing(next)) next.lastAction = `${next.lastAction} Check.`;
  return conclude(next, players);
}

export function offerDraw(state: ChessState, players: readonly { id: string; name: string }[]): ChessState | null {
  if (state.winnerSide || state.draw) return null;
  const who = sideName(state, players, state.turn);
  if (state.drawOffer === state.turn) {
    return { ...state, drawOffer: null, lastAction: `${who} withdrew the draw offer.` };
  }
  return { ...state, drawOffer: state.turn, lastAction: `${who} offers a draw.` };
}

export function answerDraw(
  state: ChessState,
  players: readonly { id: string; name: string }[],
  accept: boolean,
): ChessState | null {
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

export function resign(state: ChessState, players: readonly { id: string; name: string }[]): ChessState | null {
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

export function ensureChessState(game: Game): Game {
  if (game.templateId !== 'chess') return game;
  if (game.chess && isHealthy(game.chess, game.players)) return game;
  return { ...game, chess: repairChessState(game) };
}

function startingPieces(): ChessPiece[] {
  const back: PieceKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const pieces: ChessPiece[] = [];
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    pieces.push({ row: 0, col, side: 'black', kind: back[col] });
    pieces.push({ row: 1, col, side: 'black', kind: 'pawn' });
    pieces.push({ row: 6, col, side: 'white', kind: 'pawn' });
    pieces.push({ row: 7, col, side: 'white', kind: back[col] });
  }
  return pieces;
}

function pseudoMoves(state: ChessState, piece: ChessPiece): ChessMove[] {
  if (piece.kind === 'pawn') return pawnMoves(state, piece);
  if (piece.kind === 'knight') return stepMoves(state.pieces, piece, KNIGHT_DELTAS);
  if (piece.kind === 'bishop') return slideMoves(state.pieces, piece, BISHOP_DELTAS);
  if (piece.kind === 'rook') return slideMoves(state.pieces, piece, ROOK_DELTAS);
  if (piece.kind === 'queen') return slideMoves(state.pieces, piece, [...BISHOP_DELTAS, ...ROOK_DELTAS]);
  return [...stepMoves(state.pieces, piece, KING_DELTAS), ...castleMoves(state, piece)];
}

function stepMoves(pieces: readonly ChessPiece[], piece: ChessPiece, deltas: readonly Delta[]): ChessMove[] {
  const moves: ChessMove[] = [];
  for (const [dRow, dCol] of deltas) {
    const toRow = piece.row + dRow;
    const toCol = piece.col + dCol;
    const target = pieceAt(pieces, toRow, toCol);
    if (!onBoard(toRow, toCol) || (target && (target.side === piece.side || target.kind === 'king'))) continue;
    moves.push(moveTo(piece, toRow, toCol, Boolean(target), null));
  }
  return moves;
}

function slideMoves(pieces: readonly ChessPiece[], piece: ChessPiece, deltas: readonly Delta[]): ChessMove[] {
  const moves: ChessMove[] = [];
  for (const [dRow, dCol] of deltas) {
    let toRow = piece.row + dRow;
    let toCol = piece.col + dCol;
    while (onBoard(toRow, toCol)) {
      const target = pieceAt(pieces, toRow, toCol);
      if (target) {
        if (target.side !== piece.side && target.kind !== 'king') moves.push(moveTo(piece, toRow, toCol, true, null));
        break;
      }
      moves.push(moveTo(piece, toRow, toCol, false, null));
      toRow += dRow;
      toCol += dCol;
    }
  }
  return moves;
}

function pawnMoves(state: ChessState, piece: ChessPiece): ChessMove[] {
  const dir = piece.side === 'white' ? -1 : 1;
  const startRow = piece.side === 'white' ? 6 : 1;
  const lastRow = piece.side === 'white' ? 0 : 7;
  const moves: ChessMove[] = [];
  const oneRow = piece.row + dir;
  if (onBoard(oneRow, piece.col) && !pieceAt(state.pieces, oneRow, piece.col)) {
    pushPawn(moves, piece, oneRow, piece.col, false, false, lastRow);
    const twoRow = piece.row + dir * 2;
    if (piece.row === startRow && onBoard(twoRow, piece.col) && !pieceAt(state.pieces, twoRow, piece.col)) {
      moves.push(moveTo(piece, twoRow, piece.col, false, null));
    }
  }
  for (const dCol of [-1, 1]) {
    const toCol = piece.col + dCol;
    if (!onBoard(oneRow, toCol)) continue;
    const target = pieceAt(state.pieces, oneRow, toCol);
    if (target && target.side !== piece.side && target.kind !== 'king') {
      pushPawn(moves, piece, oneRow, toCol, true, false, lastRow);
    } else if (!target && state.enPassant?.row === oneRow && state.enPassant.col === toCol) {
      const victimRow = piece.side === 'white' ? oneRow + 1 : oneRow - 1;
      const victim = pieceAt(state.pieces, victimRow, toCol);
      if (victim && victim.side !== piece.side && victim.kind === 'pawn') {
        moves.push({ ...moveTo(piece, oneRow, toCol, true, null), enPassant: true });
      }
    }
  }
  return moves;
}

function pushPawn(
  moves: ChessMove[],
  piece: ChessPiece,
  toRow: number,
  toCol: number,
  capture: boolean,
  enPassant: boolean,
  lastRow: number,
) {
  if (toRow === lastRow) {
    for (const promotion of PROMOTIONS) moves.push({ ...moveTo(piece, toRow, toCol, capture, promotion), enPassant });
    return;
  }
  moves.push({ ...moveTo(piece, toRow, toCol, capture, null), enPassant });
}

function castleMoves(state: ChessState, piece: ChessPiece): ChessMove[] {
  if (piece.kind !== 'king') return [];
  const row = piece.side === 'white' ? 7 : 0;
  if (piece.row !== row || piece.col !== 4) return [];
  const enemy = oppositeSide(piece.side);
  if (attacked(state.pieces, row, 4, enemy)) return [];
  const moves: ChessMove[] = [];
  const kingside = piece.side === 'white' ? state.castling.whiteKingside : state.castling.blackKingside;
  const queenside = piece.side === 'white' ? state.castling.whiteQueenside : state.castling.blackQueenside;
  if (
    kingside &&
    rookHome(state.pieces, row, 7, piece.side) &&
    !pieceAt(state.pieces, row, 5) &&
    !pieceAt(state.pieces, row, 6) &&
    !attacked(state.pieces, row, 5, enemy) &&
    !attacked(state.pieces, row, 6, enemy)
  ) {
    moves.push({ ...moveTo(piece, row, 6, false, null), castle: 'kingside' });
  }
  if (
    queenside &&
    rookHome(state.pieces, row, 0, piece.side) &&
    !pieceAt(state.pieces, row, 1) &&
    !pieceAt(state.pieces, row, 2) &&
    !pieceAt(state.pieces, row, 3) &&
    !attacked(state.pieces, row, 2, enemy) &&
    !attacked(state.pieces, row, 3, enemy)
  ) {
    moves.push({ ...moveTo(piece, row, 2, false, null), castle: 'queenside' });
  }
  return moves;
}

function rookHome(pieces: readonly ChessPiece[], row: number, col: number, side: Side): boolean {
  const rook = pieceAt(pieces, row, col);
  return Boolean(rook && rook.side === side && rook.kind === 'rook');
}

function moveTo(piece: ChessPiece, toRow: number, toCol: number, capture: boolean, promotion: PromotionKind | null): ChessMove {
  return {
    fromRow: piece.row,
    fromCol: piece.col,
    toRow,
    toCol,
    promotion,
    castle: null,
    enPassant: false,
    capture,
  };
}

function applyMove(pieces: readonly ChessPiece[], move: ChessMove): { pieces: ChessPiece[]; captured: PieceKind | null } {
  const moving = pieceAt(pieces, move.fromRow, move.fromCol);
  if (!moving) return { pieces: [...pieces], captured: null };
  let next = pieces.filter((piece) => piece.row !== move.fromRow || piece.col !== move.fromCol);
  let captured: PieceKind | null = null;
  if (move.enPassant) {
    const capRow = moving.side === 'white' ? move.toRow + 1 : move.toRow - 1;
    const victim = pieceAt(next, capRow, move.toCol);
    if (victim) {
      captured = victim.kind;
      next = next.filter((piece) => piece.row !== capRow || piece.col !== move.toCol);
    }
  } else {
    const victim = pieceAt(next, move.toRow, move.toCol);
    if (victim) {
      captured = victim.kind;
      next = next.filter((piece) => piece.row !== move.toRow || piece.col !== move.toCol);
    }
  }
  next.push({ row: move.toRow, col: move.toCol, side: moving.side, kind: move.promotion ?? moving.kind });
  if (move.castle) {
    const rookFrom = move.castle === 'kingside' ? 7 : 0;
    const rookTo = move.castle === 'kingside' ? 5 : 3;
    next = next.filter((piece) => piece.row !== moving.row || piece.col !== rookFrom);
    next.push({ row: moving.row, col: rookTo, side: moving.side, kind: 'rook' });
  }
  return { pieces: next, captured };
}

function kingSafeAfter(pieces: readonly ChessPiece[], move: ChessMove, side: Side): boolean {
  const next = applyMove(pieces, move).pieces;
  const king = kingPiece(next, side);
  if (!king) return false;
  return !attacked(next, king.row, king.col, oppositeSide(side));
}

function attacked(pieces: readonly ChessPiece[], row: number, col: number, by: Side): boolean {
  const pawnRow = row + (by === 'white' ? 1 : -1);
  for (const dCol of [-1, 1]) {
    const pawn = pieceAt(pieces, pawnRow, col + dCol);
    if (pawn && pawn.side === by && pawn.kind === 'pawn') return true;
  }
  for (const [dRow, dCol] of KNIGHT_DELTAS) {
    const knight = pieceAt(pieces, row + dRow, col + dCol);
    if (knight && knight.side === by && knight.kind === 'knight') return true;
  }
  for (const [dRow, dCol] of KING_DELTAS) {
    const king = pieceAt(pieces, row + dRow, col + dCol);
    if (king && king.side === by && king.kind === 'king') return true;
  }
  if (rayHits(pieces, row, col, BISHOP_DELTAS, by, ['bishop', 'queen'])) return true;
  return rayHits(pieces, row, col, ROOK_DELTAS, by, ['rook', 'queen']);
}

function rayHits(
  pieces: readonly ChessPiece[],
  row: number,
  col: number,
  deltas: readonly Delta[],
  by: Side,
  kinds: readonly PieceKind[],
): boolean {
  for (const [dRow, dCol] of deltas) {
    let nextRow = row + dRow;
    let nextCol = col + dCol;
    while (onBoard(nextRow, nextCol)) {
      const piece = pieceAt(pieces, nextRow, nextCol);
      if (piece) {
        if (piece.side === by && kinds.includes(piece.kind)) return true;
        break;
      }
      nextRow += dRow;
      nextCol += dCol;
    }
  }
  return false;
}

function kingPiece(pieces: readonly ChessPiece[], side: Side): ChessPiece | null {
  return pieces.find((piece) => piece.side === side && piece.kind === 'king') ?? null;
}

function updateCastling(rights: CastlingRights, move: ChessMove): CastlingRights {
  const next = { ...rights };
  const touch = (row: number, col: number) => {
    if (row === 7 && col === 4) {
      next.whiteKingside = false;
      next.whiteQueenside = false;
    }
    if (row === 7 && col === 7) next.whiteKingside = false;
    if (row === 7 && col === 0) next.whiteQueenside = false;
    if (row === 0 && col === 4) {
      next.blackKingside = false;
      next.blackQueenside = false;
    }
    if (row === 0 && col === 7) next.blackKingside = false;
    if (row === 0 && col === 0) next.blackQueenside = false;
  };
  touch(move.fromRow, move.fromCol);
  if (!move.enPassant) touch(move.toRow, move.toCol);
  return next;
}

function conclude(state: ChessState, players: readonly { id: string; name: string }[]): ChessState {
  if (state.winnerSide || state.draw) return state;
  const moves = legalMoves(state);
  const inCheck = checkedKing(state) != null;
  const detail = state.lastAction ? `${state.lastAction.replace(/ Check\.$/, '')} ` : '';
  if (moves.length === 0 && inCheck) {
    const winner = oppositeSide(state.turn);
    return {
      ...state,
      winnerSide: winner,
      drawOffer: null,
      lastAction: `${detail}Checkmate. ${sideName(state, players, winner)} wins.`,
    };
  }
  if (moves.length === 0) {
    return { ...state, draw: true, drawOffer: null, lastAction: `${detail}Stalemate. The game is a draw.` };
  }
  if (state.halfmove >= 100) {
    return {
      ...state,
      draw: true,
      drawOffer: null,
      lastAction: `${detail}Fifty moves without a capture or pawn move. The game is a draw.`,
    };
  }
  const key = positionKey(state);
  if (state.history.filter((entry) => entry === key).length >= 3) {
    return { ...state, draw: true, drawOffer: null, lastAction: `${detail}The position repeated three times. The game is a draw.` };
  }
  if (insufficient(state.pieces)) {
    return {
      ...state,
      draw: true,
      drawOffer: null,
      lastAction: `${detail}Neither side has enough material to mate. The game is a draw.`,
    };
  }
  return state;
}

function insufficient(pieces: readonly ChessPiece[]): boolean {
  const white = pieces.filter((piece) => piece.side === 'white' && piece.kind !== 'king');
  const black = pieces.filter((piece) => piece.side === 'black' && piece.kind !== 'king');
  const bare = (list: ChessPiece[]) => list.length === 0;
  const minor = (list: ChessPiece[]) => list.length === 1 && (list[0].kind === 'knight' || list[0].kind === 'bishop');
  if (bare(white) && (bare(black) || minor(black))) return true;
  if (bare(black) && minor(white)) return true;
  if (white.length === 1 && black.length === 1 && white[0].kind === 'bishop' && black[0].kind === 'bishop') {
    return (white[0].row + white[0].col) % 2 === (black[0].row + black[0].col) % 2;
  }
  return false;
}

function positionKey(state: ChessState): string {
  const placed = [...state.pieces]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((piece) => `${piece.side[0]}${piece.kind[0]}${piece.row}${piece.col}`)
    .join(',');
  const rights = state.castling;
  const castle =
    `${rights.whiteKingside ? 'K' : ''}${rights.whiteQueenside ? 'Q' : ''}${rights.blackKingside ? 'k' : ''}${rights.blackQueenside ? 'q' : ''}` ||
    '-';
  const ep = state.enPassant ? `${state.enPassant.row}${state.enPassant.col}` : '-';
  return `${state.turn}|${castle}|${ep}|${placed}`;
}

function describeMove(who: string, kind: PieceKind, move: ChessMove): string {
  if (move.castle === 'kingside') return `${who} castles kingside.`;
  if (move.castle === 'queenside') return `${who} castles queenside.`;
  const dest = squareName(move.toRow, move.toCol);
  if (move.enPassant) return `${who} captures en passant on ${dest}.`;
  const verb = move.capture ? `captures on ${dest}` : `moves the ${kind} to ${dest}`;
  if (move.promotion) return `${who} ${verb} and promotes the pawn to a ${move.promotion}.`;
  if (move.capture) return `${who} captures on ${dest} with the ${kind}.`;
  return `${who} moves the ${kind} to ${dest}.`;
}

function sideName(state: ChessState, players: readonly { id: string; name: string }[], side: Side): string {
  return players.find((player) => state.sides[player.id] === side)?.name ?? CHESS_SIDES[side].name;
}

function assignSides(players: readonly { id: string }[], previous: Record<string, Side> | undefined): Record<string, Side> {
  const sides: Record<string, Side> = {};
  const used = new Set<Side>();
  for (const player of players.slice(0, 2)) {
    const prior = previous?.[player.id];
    if ((prior === 'white' || prior === 'black') && !used.has(prior)) {
      sides[player.id] = prior;
      used.add(prior);
    }
  }
  for (const player of players.slice(0, 2)) {
    if (sides[player.id]) continue;
    const side: Side = used.has('white') ? 'black' : 'white';
    sides[player.id] = side;
    used.add(side);
  }
  return sides;
}

function repairChessState(game: Game): ChessState {
  const previous = game.chess;
  const cleaned = previous ? cleanPieces(previous.pieces) : null;
  const kept = cleaned != null;
  const pieces = cleaned ?? startingPieces();
  const castling = cleanCastling(previous?.castling, pieces);
  const turn: Side = kept && (previous?.turn === 'white' || previous?.turn === 'black') ? previous.turn : 'white';
  const enPassant = kept ? cleanEnPassant(previous?.enPassant, pieces, turn) : null;
  const halfmove = kept && integerIn(previous?.halfmove, 0, 150) ? (previous?.halfmove as number) : 0;
  const fullmove = kept && integerIn(previous?.fullmove, 1, 1000) ? (previous?.fullmove as number) : 1;
  const taken = kept ? cleanTaken(previous?.taken) : { white: [], black: [] };
  let winnerSide: Side | null =
    kept && (previous?.winnerSide === 'white' || previous?.winnerSide === 'black') ? previous.winnerSide : null;
  let draw = kept && previous?.draw === true && winnerSide == null;
  if (winnerSide) draw = false;
  const drawOffer: Side | null =
    kept && !winnerSide && !draw && (previous?.drawOffer === 'white' || previous?.drawOffer === 'black')
      ? previous.drawOffer
      : null;
  const lastMove = kept ? cleanMove(previous?.lastMove) : null;
  const lastAction = typeof previous?.lastAction === 'string' ? previous.lastAction : null;
  const draft: ChessState = {
    pieces,
    sides: assignSides(game.players, previous?.sides),
    turn,
    castling,
    enPassant,
    halfmove,
    fullmove,
    taken,
    history: [],
    winnerSide,
    draw,
    drawOffer,
    lastMove,
    lastAction,
  };
  const key = positionKey(draft);
  const history = kept ? cleanHistory(previous?.history) : null;
  draft.history = history && history[history.length - 1] === key ? history : [...(history ?? []), key].slice(-400);
  if (!winnerSide && !draw) return conclude(draft, game.players);
  return draft;
}

function cleanPieces(value: unknown): ChessPiece[] | null {
  if (!Array.isArray(value)) return null;
  const pieces: ChessPiece[] = [];
  const seen = new Set<string>();
  const counts: Record<Side, number> = { white: 0, black: 0 };
  const kings: Record<Side, number> = { white: 0, black: 0 };
  const pawns: Record<Side, number> = { white: 0, black: 0 };
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Partial<ChessPiece>;
    if (typeof raw.row !== 'number' || typeof raw.col !== 'number' || !onBoard(raw.row, raw.col)) return null;
    if (raw.side !== 'white' && raw.side !== 'black') return null;
    if (!isKind(raw.kind)) return null;
    if (raw.kind === 'pawn' && (raw.row === 0 || raw.row === 7)) return null;
    const key = `${raw.row},${raw.col}`;
    if (seen.has(key)) return null;
    seen.add(key);
    counts[raw.side] += 1;
    if (raw.kind === 'king') kings[raw.side] += 1;
    if (raw.kind === 'pawn') pawns[raw.side] += 1;
    if (counts[raw.side] > 16 || kings[raw.side] > 1 || pawns[raw.side] > 8) return null;
    pieces.push({ row: raw.row, col: raw.col, side: raw.side, kind: raw.kind });
  }
  if (kings.white !== 1 || kings.black !== 1) return null;
  return pieces;
}

function cleanCastling(value: unknown, pieces: readonly ChessPiece[]): CastlingRights {
  const home = {
    whiteKingside: rookHome(pieces, 7, 7, 'white') && Boolean(kingHome(pieces, 'white')),
    whiteQueenside: rookHome(pieces, 7, 0, 'white') && Boolean(kingHome(pieces, 'white')),
    blackKingside: rookHome(pieces, 0, 7, 'black') && Boolean(kingHome(pieces, 'black')),
    blackQueenside: rookHome(pieces, 0, 0, 'black') && Boolean(kingHome(pieces, 'black')),
  };
  const raw = value && typeof value === 'object' ? (value as Partial<CastlingRights>) : {};
  return {
    whiteKingside: (typeof raw.whiteKingside === 'boolean' ? raw.whiteKingside : home.whiteKingside) && home.whiteKingside,
    whiteQueenside: (typeof raw.whiteQueenside === 'boolean' ? raw.whiteQueenside : home.whiteQueenside) && home.whiteQueenside,
    blackKingside: (typeof raw.blackKingside === 'boolean' ? raw.blackKingside : home.blackKingside) && home.blackKingside,
    blackQueenside: (typeof raw.blackQueenside === 'boolean' ? raw.blackQueenside : home.blackQueenside) && home.blackQueenside,
  };
}

function kingHome(pieces: readonly ChessPiece[], side: Side): boolean {
  const row = side === 'white' ? 7 : 0;
  const king = pieceAt(pieces, row, 4);
  return Boolean(king && king.side === side && king.kind === 'king');
}

function cleanEnPassant(value: unknown, pieces: readonly ChessPiece[], turn: Side): ChessSquare | null {
  if (!value || typeof value !== 'object') return null;
  const square = value as Partial<ChessSquare>;
  if (typeof square.row !== 'number' || typeof square.col !== 'number' || !onBoard(square.row, square.col)) return null;
  if (turn === 'white' && square.row !== 2) return null;
  if (turn === 'black' && square.row !== 5) return null;
  const pawnRow = turn === 'white' ? 3 : 4;
  const pawn = pieceAt(pieces, pawnRow, square.col);
  if (!pawn || pawn.kind !== 'pawn' || pawn.side === turn) return null;
  if (pieceAt(pieces, square.row, square.col)) return null;
  return { row: square.row, col: square.col };
}

function cleanTaken(value: unknown): Record<Side, PieceKind[]> {
  const raw = value && typeof value === 'object' ? (value as { white?: unknown; black?: unknown }) : {};
  return { white: cleanKinds(raw.white), black: cleanKinds(raw.black) };
}

function cleanKinds(value: unknown): PieceKind[] {
  if (!Array.isArray(value) || value.length > 15) return [];
  const kinds: PieceKind[] = [];
  for (const item of value) {
    if (!isKind(item) || item === 'king') return [];
    kinds.push(item);
  }
  return kinds;
}

function cleanHistory(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 400) return null;
  const history: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 500) return null;
    history.push(item);
  }
  return history;
}

function cleanMove(value: unknown): ChessMove | null {
  if (!value || typeof value !== 'object') return null;
  const move = value as Partial<ChessMove>;
  if (!onBoard(move.fromRow as number, move.fromCol as number) || !onBoard(move.toRow as number, move.toCol as number)) {
    return null;
  }
  if (move.promotion != null && !PROMOTIONS.includes(move.promotion)) return null;
  if (move.castle != null && move.castle !== 'kingside' && move.castle !== 'queenside') return null;
  if (typeof move.enPassant !== 'boolean' || typeof move.capture !== 'boolean') return null;
  return {
    fromRow: move.fromRow as number,
    fromCol: move.fromCol as number,
    toRow: move.toRow as number,
    toCol: move.toCol as number,
    promotion: move.promotion ?? null,
    castle: move.castle ?? null,
    enPassant: move.enPassant,
    capture: move.capture,
  };
}

function isKind(value: unknown): value is PieceKind {
  return value === 'king' || value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight' || value === 'pawn';
}

function integerIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isHealthy(state: ChessState, players: Player[]): boolean {
  return sameState(state, repairChessState({ chess: state, players } as Game));
}

function sameState(a: ChessState, b: ChessState): boolean {
  return (
    a.turn === b.turn &&
    a.halfmove === b.halfmove &&
    a.fullmove === b.fullmove &&
    a.winnerSide === b.winnerSide &&
    a.draw === b.draw &&
    a.drawOffer === b.drawOffer &&
    a.lastAction === b.lastAction &&
    sameSquare(a.enPassant, b.enPassant) &&
    sameMove(a.lastMove, b.lastMove) &&
    sameRights(a.castling, b.castling) &&
    sameSides(a.sides, b.sides) &&
    sameKinds(a.taken.white, b.taken.white) &&
    sameKinds(a.taken.black, b.taken.black) &&
    sameStrings(a.history, b.history) &&
    samePieces(a.pieces, b.pieces)
  );
}

function samePieces(a: readonly ChessPiece[], b: readonly ChessPiece[]): boolean {
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

function sameSquare(a: ChessSquare | null, b: ChessSquare | null): boolean {
  if (!a || !b) return a === b;
  return a.row === b.row && a.col === b.col;
}

function sameMove(a: ChessMove | null, b: ChessMove | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.fromRow === b.fromRow &&
    a.fromCol === b.fromCol &&
    a.toRow === b.toRow &&
    a.toCol === b.toCol &&
    a.promotion === b.promotion &&
    a.castle === b.castle &&
    a.enPassant === b.enPassant &&
    a.capture === b.capture
  );
}

function sameRights(a: CastlingRights, b: CastlingRights): boolean {
  return (
    a.whiteKingside === b.whiteKingside &&
    a.whiteQueenside === b.whiteQueenside &&
    a.blackKingside === b.blackKingside &&
    a.blackQueenside === b.blackQueenside
  );
}

function sameKinds(a: readonly PieceKind[], b: readonly PieceKind[]): boolean {
  return a.length === b.length && a.every((kind, index) => kind === b[index]);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
