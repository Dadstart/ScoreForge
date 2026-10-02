import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerDraw,
  createCheckersState,
  legalHops,
  offerDraw,
  pieceAt,
  playHop,
  resign,
  setRequireJumps,
} from './checkers';

const players = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

describe('checkers', () => {
  it('deals 12 men a side and lets Black move first', () => {
    const state = createCheckersState(players);
    assert.equal(state.pieces.length, 24);
    assert.equal(state.turn, 'dark');
    assert.equal(state.requireJumps, true);
    const hops = legalHops(state);
    assert.ok(hops.length > 0);
    assert.ok(hops.every((hop) => hop.captureRow == null));

    const played = playHop(state, players, hops[0]);
    assert.ok(played);
    assert.equal(played.turn, 'light');
    assert.equal(played.pieces.length, 24);
  });

  it('requires a jump when one is open, unless jumps are optional', () => {
    const forced = {
      ...createCheckersState(players),
      pieces: [
        { row: 5, col: 2, side: 'dark' as const, kind: 'man' as const },
        { row: 4, col: 3, side: 'light' as const, kind: 'man' as const },
        { row: 2, col: 1, side: 'light' as const, kind: 'man' as const },
      ],
    };
    const jumps = legalHops(forced);
    assert.equal(jumps.length, 1);
    assert.equal(jumps[0]?.captureRow, 4);
    assert.equal(playHop(forced, players, { fromRow: 5, fromCol: 2, toRow: 4, toCol: 1 }), null);

    const jumped = playHop(forced, players, jumps[0]);
    assert.ok(jumped);
    assert.equal(pieceAt(jumped.pieces, 4, 3), null);
    assert.equal(jumped.pieces.filter((piece) => piece.side === 'light').length, 1);

    const optional = setRequireJumps(forced, false);
    assert.ok(optional);
    const quiet = playHop(optional, players, { fromRow: 5, fromCol: 2, toRow: 4, toCol: 1 });
    assert.ok(quiet);
    assert.equal(quiet.pieces.length, 3);
  });

  it('resigns and accepts a draw', () => {
    const state = createCheckersState(players);
    const resigned = resign(state, players);
    assert.equal(resigned?.winnerSide, 'light');
    assert.equal(playHop(resigned!, players, { fromRow: 5, fromCol: 0, toRow: 4, toCol: 1 }), null);

    const offered = offerDraw(state, players);
    assert.equal(offered?.drawOffer, 'dark');
    const drawn = answerDraw(offered!, players, true);
    assert.equal(drawn?.draw, true);
    assert.equal(legalHops(drawn!).length, 0);
  });
});
