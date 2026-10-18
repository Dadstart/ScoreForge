import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, createPlayer } from './models';
import {
  answerDraw,
  countDiscs,
  createReversiState,
  discCount,
  ensureReversiState,
  legalMoves,
  playMove,
  resign,
  type Side,
} from './reversi';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';

const players = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

describe('reversi', () => {
  it('opens on the diagonal and gives Black four moves', () => {
    const state = createReversiState(players);
    assert.equal(countDiscs(state.cells, 'dark'), 2);
    assert.equal(countDiscs(state.cells, 'light'), 2);
    assert.equal(state.cells[3 * 8 + 3], 'dark');
    assert.equal(state.cells[3 * 8 + 4], 'light');
    assert.equal(state.cells[4 * 8 + 3], 'light');
    assert.equal(state.cells[4 * 8 + 4], 'dark');
    assert.equal(state.turn, 'dark');
    assert.deepEqual(
      legalMoves(state).map((move) => [move.row, move.col]),
      [
        [2, 4],
        [3, 5],
        [4, 2],
        [5, 3],
      ],
    );

    const played = playMove(state, players, 2, 4);
    assert.ok(played);
    assert.equal(played.turn, 'light');
    assert.equal(played.cells[2 * 8 + 4], 'dark');
    assert.equal(played.cells[3 * 8 + 4], 'dark');
    assert.equal(countDiscs(played.cells, 'dark'), 4);
    assert.equal(discCount(played, 'ada'), 4);
    assert.equal(playMove(state, players, 2, 3), null);

    const game = {
      ...createGame({ name: 'Reversi', templateId: 'reversi', players: [createPlayer('Ada')] }),
      players,
      reversi: state,
    };
    assert.equal(ensureReversiState(game), game);
  });

  it('flips every bracketed line', () => {
    const state = {
      ...createReversiState(players),
      cells: filled('.'),
    };
    state.cells[2 * 8 + 4] = 'dark';
    state.cells[3 * 8 + 4] = 'light';
    state.cells[4 * 8 + 2] = 'dark';
    state.cells[4 * 8 + 3] = 'light';
    const played = playMove(state, players, 4, 4);
    assert.ok(played);
    assert.equal(played.lastFlips.length, 2);
    assert.equal(played.cells[3 * 8 + 4], 'dark');
    assert.equal(played.cells[4 * 8 + 3], 'dark');
    assert.equal(played.cells[4 * 8 + 4], 'dark');
  });

  it('skips a side that has no move, then ends on the higher count', () => {
    const cells = filled('B');
    cells[0] = null;
    cells[1] = 'light';
    cells[2 * 8] = null;
    cells[2 * 8 + 1] = 'light';
    const state = { ...createReversiState(players), cells, turn: 'dark' as const };
    const played = playMove(state, players, 2, 0);
    assert.ok(played);
    assert.equal(played.turn, 'dark');
    assert.match(played.lastAction ?? '', /Bea has no move/);
    assert.equal(played.winnerSide, null);

    const closing = filled('B');
    closing[0] = null;
    closing[1] = 'light';
    const ended = playMove({ ...createReversiState(players), cells: closing, turn: 'dark' }, players, 0, 0);
    assert.equal(ended?.winnerSide, 'dark');
    assert.equal(ended?.draw, false);
    assert.equal(countDiscs(ended!.cells, 'dark'), 64);
    assert.equal(legalMoves(ended!).length, 0);

    const template = getTemplate('reversi');
    assert.ok(template);
    const snapshot = calculate(
      {
        ...createGame({ name: 'Reversi', templateId: 'reversi', players: [createPlayer('Ada')] }),
        players,
        reversi: ended,
        status: 'Completed',
      },
      template,
    );
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
    assert.equal(snapshot.standings.find((row) => row.playerId === 'ada')?.total, 64);
  });

  it('draws a filled board when the counts match', () => {
    const cells = Array.from({ length: 64 }, (_, index) => (index < 32 ? 'dark' : 'light') as Side);
    const game = {
      ...createGame({ name: 'Reversi', templateId: 'reversi', players: [createPlayer('Ada'), createPlayer('Bea')] }),
      players,
      reversi: { ...createReversiState(players), cells, turn: 'dark' as const },
    };
    const repaired = ensureReversiState(game);
    assert.equal(repaired.reversi?.draw, true);
    assert.equal(repaired.reversi?.winnerSide, null);
    assert.match(repaired.reversi?.lastAction ?? '', /32 discs each/);
  });

  it('resigns and accepts a draw', () => {
    const state = createReversiState(players);
    const resigned = resign(state, players);
    assert.equal(resigned?.winnerSide, 'light');
    assert.equal(playMove(resigned!, players, 2, 4), null);

    const offered = playMove(state, players, 2, 4);
    assert.ok(offered);
    const reply = answerDraw({ ...offered, drawOffer: 'light' }, players, true);
    assert.equal(reply?.draw, true);
    assert.equal(legalMoves(reply!).length, 0);
  });
});

function filled(mark: '.' | 'B' | 'W'): (Side | null)[] {
  const cell: Side | null = mark === 'B' ? 'dark' : mark === 'W' ? 'light' : null;
  return Array.from({ length: 64 }, () => cell);
}
