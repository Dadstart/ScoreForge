import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, createPlayer } from './models';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import {
  answerDraw,
  capturedValue,
  checkedKing,
  createChessState,
  ensureChessState,
  legalMoves,
  offerDraw,
  pieceAt,
  playMove,
  resign,
  squareName,
  type ChessState,
  type PromotionKind,
} from './chess';

const players = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

function sq(file: string, rank: number) {
  return { row: 8 - rank, col: file.charCodeAt(0) - 97 };
}

function play(state: ChessState, from: string, to: string, promotion?: PromotionKind) {
  const start = sq(from[0], Number(from[1]));
  const end = sq(to[0], Number(to[1]));
  const next = playMove(state, players, {
    fromRow: start.row,
    fromCol: start.col,
    toRow: end.row,
    toCol: end.col,
    promotion: promotion ?? null,
  });
  assert.ok(next, `${from}-${to}`);
  return next;
}

describe('chess', () => {
  it('opens with 32 pieces, White to move, and 20 legal moves', () => {
    const state = createChessState(players);
    assert.equal(state.pieces.length, 32);
    assert.equal(state.turn, 'white');
    assert.equal(state.sides.ada, 'white');
    assert.equal(state.sides.bea, 'black');
    const moves = legalMoves(state);
    assert.equal(moves.length, 20);
    assert.ok(moves.every((move) => !move.capture));

    const played = play(state, 'e2', 'e4');
    assert.equal(played.turn, 'black');
    assert.equal(played.pieces.length, 32);
    assert.equal(squareName(played.lastMove?.toRow ?? -1, played.lastMove?.toCol ?? -1), 'e4');
  });

  it('mates in two with the fool mate', () => {
    let state = createChessState(players);
    state = play(state, 'f2', 'f3');
    state = play(state, 'e7', 'e5');
    state = play(state, 'g2', 'g4');
    state = play(state, 'd8', 'h4');
    assert.equal(state.winnerSide, 'black');
    assert.equal(state.draw, false);
    assert.match(state.lastAction ?? '', /Checkmate/);
    assert.equal(legalMoves(state).length, 0);
    assert.equal(playMove(state, players, { fromRow: 6, fromCol: 0, toRow: 4, toCol: 0 }), null);
  });

  it('mates with the scholar mate', () => {
    let state = createChessState(players);
    state = play(state, 'e2', 'e4');
    state = play(state, 'e7', 'e5');
    state = play(state, 'd1', 'h5');
    state = play(state, 'b8', 'c6');
    state = play(state, 'f1', 'c4');
    state = play(state, 'g8', 'f6');
    state = play(state, 'h5', 'f7');
    assert.equal(state.winnerSide, 'white');
    assert.equal(pieceAt(state.pieces, sq('f', 7).row, sq('f', 7).col)?.kind, 'queen');
    assert.equal(capturedValue(state, 'ada'), 1);

    const template = getTemplate('chess');
    assert.ok(template);
    const game = {
      ...createGame({
        name: 'Chess',
        templateId: 'chess',
        players: [createPlayer('Ada'), createPlayer('Bea')],
      }),
      players: [
        { id: 'ada', name: 'Ada' },
        { id: 'bea', name: 'Bea' },
      ],
      chess: state,
      status: 'Completed' as const,
    };
    const snap = calculate(game, template);
    assert.equal(snap.isComplete, true);
    assert.equal(snap.winnerName, 'Ada');
  });

  it('refuses a move that leaves the king in check, including a pinned knight', () => {
    const state: ChessState = {
      ...createChessState(players),
      pieces: [
        { row: 7, col: 4, side: 'white', kind: 'king' },
        { row: 6, col: 4, side: 'white', kind: 'knight' },
        { row: 0, col: 4, side: 'black', kind: 'rook' },
        { row: 0, col: 0, side: 'black', kind: 'king' },
      ],
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
    };
    assert.equal(checkedKing(state), null);
    assert.equal(
      legalMoves(state).some((move) => move.fromRow === 6 && move.fromCol === 4),
      false,
    );
    assert.equal(play(state, 'e1', 'd1').turn, 'black');
    assert.equal(playMove(state, players, { fromRow: 7, fromCol: 4, toRow: 6, toCol: 4 }), null);
  });

  it('castles both ways, and not through check or after the rook moves', () => {
    const open: ChessState = {
      ...createChessState(players),
      pieces: [
        { row: 7, col: 4, side: 'white', kind: 'king' },
        { row: 7, col: 7, side: 'white', kind: 'rook' },
        { row: 7, col: 0, side: 'white', kind: 'rook' },
        { row: 0, col: 4, side: 'black', kind: 'king' },
      ],
    };
    const kingside = play(open, 'e1', 'g1');
    assert.equal(kingside.lastMove?.castle, 'kingside');
    assert.equal(pieceAt(kingside.pieces, 7, 6)?.kind, 'king');
    assert.equal(pieceAt(kingside.pieces, 7, 5)?.kind, 'rook');
    assert.equal(kingside.castling.whiteKingside, false);
    assert.equal(kingside.castling.whiteQueenside, false);

    const queenside = play(open, 'e1', 'c1');
    assert.equal(pieceAt(queenside.pieces, 7, 2)?.kind, 'king');
    assert.equal(pieceAt(queenside.pieces, 7, 3)?.kind, 'rook');

    const through: ChessState = {
      ...open,
      pieces: [...open.pieces, { row: 0, col: 5, side: 'black', kind: 'rook' }],
    };
    assert.equal(
      legalMoves(through).some((move) => move.castle === 'kingside'),
      false,
    );
    assert.equal(
      legalMoves(through).some((move) => move.castle === 'queenside'),
      true,
    );

    const inCheck: ChessState = {
      ...open,
      pieces: [...open.pieces, { row: 1, col: 4, side: 'black', kind: 'rook' }],
    };
    assert.ok(checkedKing(inCheck));
    assert.equal(
      legalMoves(inCheck).some((move) => move.castle != null),
      false,
    );

    const rookMoved = play(open, 'h1', 'h2');
    assert.equal(rookMoved.castling.whiteKingside, false);
    assert.equal(rookMoved.castling.whiteQueenside, true);
  });

  it('captures en passant on the next move only, and promotes a pawn', () => {
    const ready: ChessState = {
      ...createChessState(players),
      turn: 'white',
      enPassant: { row: 2, col: 3 },
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
      pieces: [
        { row: 7, col: 0, side: 'white', kind: 'king' },
        { row: 3, col: 4, side: 'white', kind: 'pawn' },
        { row: 3, col: 3, side: 'black', kind: 'pawn' },
        { row: 0, col: 7, side: 'black', kind: 'king' },
      ],
    };
    const taken = play(ready, 'e5', 'd6');
    assert.equal(taken.lastMove?.enPassant, true);
    assert.equal(pieceAt(taken.pieces, sq('d', 6).row, sq('d', 6).col)?.side, 'white');
    assert.equal(pieceAt(taken.pieces, sq('d', 5).row, sq('d', 5).col), null);
    assert.equal(capturedValue(taken, 'ada'), 1);

    const ignored = play(ready, 'a1', 'a2');
    assert.equal(ignored.enPassant, null);
    assert.ok(pieceAt(ignored.pieces, sq('d', 5).row, sq('d', 5).col));

    const promote: ChessState = {
      ...createChessState(players),
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
      pieces: [
        { row: 1, col: 0, side: 'white', kind: 'pawn' },
        { row: 7, col: 7, side: 'white', kind: 'king' },
        { row: 3, col: 5, side: 'black', kind: 'king' },
      ],
    };
    const choices = legalMoves(promote).filter((move) => move.fromRow === 1 && move.fromCol === 0);
    assert.deepEqual(
      choices.map((move) => move.promotion).sort(),
      ['bishop', 'knight', 'queen', 'rook'],
    );
    assert.equal(playMove(promote, players, { fromRow: 1, fromCol: 0, toRow: 0, toCol: 0 }), null);
    const knight = play(promote, 'a7', 'a8', 'knight');
    assert.equal(pieceAt(knight.pieces, 0, 0)?.kind, 'knight');
  });

  it('draws by stalemate, repetition, the fifty-move rule, and bare kings', () => {
    const stalemate: ChessState = {
      ...createChessState(players),
      turn: 'black',
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
      pieces: [
        { row: 0, col: 0, side: 'black', kind: 'king' },
        { row: 2, col: 1, side: 'white', kind: 'queen' },
        { row: 4, col: 2, side: 'white', kind: 'king' },
      ],
    };
    const game = {
      ...createGame({ name: 'Chess', templateId: 'chess', players: [createPlayer('Ada'), createPlayer('Bea')] }),
      players: [
        { id: 'ada', name: 'Ada' },
        { id: 'bea', name: 'Bea' },
      ],
      chess: stalemate,
    };
    const settled = ensureChessState(game).chess;
    assert.equal(settled?.draw, true);
    assert.match(settled?.lastAction ?? '', /Stalemate/);

    let repeated = createChessState(players);
    repeated = play(repeated, 'b1', 'a3');
    repeated = play(repeated, 'b8', 'a6');
    repeated = play(repeated, 'a3', 'b1');
    repeated = play(repeated, 'a6', 'b8');
    assert.equal(repeated.draw, false);
    repeated = play(repeated, 'b1', 'a3');
    repeated = play(repeated, 'b8', 'a6');
    repeated = play(repeated, 'a3', 'b1');
    repeated = play(repeated, 'a6', 'b8');
    assert.equal(repeated.draw, true);
    assert.match(repeated.lastAction ?? '', /three times/);

    const long: ChessState = {
      ...createChessState(players),
      halfmove: 99,
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
      pieces: [
        { row: 7, col: 4, side: 'white', kind: 'king' },
        { row: 7, col: 0, side: 'white', kind: 'rook' },
        { row: 0, col: 4, side: 'black', kind: 'king' },
        { row: 0, col: 0, side: 'black', kind: 'rook' },
      ],
    };
    const fifty = play(long, 'e1', 'd1');
    assert.equal(fifty.draw, true);
    assert.match(fifty.lastAction ?? '', /Fifty moves/);

    const bare: ChessState = {
      ...createChessState(players),
      castling: { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false },
      pieces: [
        { row: 7, col: 4, side: 'white', kind: 'king' },
        { row: 0, col: 4, side: 'black', kind: 'king' },
      ],
    };
    const ended = ensureChessState({ ...game, chess: bare }).chess;
    assert.equal(ended?.draw, true);
    assert.match(ended?.lastAction ?? '', /enough material/);
  });

  it('resigns, agrees a draw, and seats a second player as Black', () => {
    const state = createChessState([{ id: 'ada' }]);
    assert.equal(resign(state, players)?.winnerSide, 'black');
    const offered = offerDraw(state, players);
    assert.equal(offered?.drawOffer, 'white');
    assert.equal(answerDraw(offered!, players, true)?.draw, true);

    const game = {
      ...createGame({ name: 'Chess', templateId: 'chess', players: [createPlayer('Ada')] }),
      players: [
        { id: 'ada', name: 'Ada' },
        { id: 'bea', name: 'Bea' },
      ],
      chess: state,
    };
    const seated = ensureChessState(game).chess;
    assert.equal(seated?.sides.ada, 'white');
    assert.equal(seated?.sides.bea, 'black');
    assert.equal(ensureChessState({ ...game, templateId: 'checkers' }).chess, state);
  });
});
