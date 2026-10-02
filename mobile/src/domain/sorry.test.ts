import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPlayer, type Player } from './models';
import {
  createSorryState,
  drawCard,
  legalMoves,
  passTurn,
  playMove,
  startExit,
  type PawnSpot,
} from './sorry';

function atStart(): PawnSpot[] {
  return [{ zone: 'start' }, { zone: 'start' }, { zone: 'start' }, { zone: 'start' }];
}

describe('sorry', () => {
  const ada = createPlayer('Ada');
  const bea = createPlayer('Bea');
  const players: Player[] = [ada, bea];

  it('draws the top card and will not draw a second before it is played', () => {
    const state = { ...createSorryState(players), deck: [2, 1], discard: [] };
    const drawn = drawCard(state);
    assert.ok(drawn);
    assert.equal(drawn.drawn, 1);
    assert.deepEqual(drawn.deck, [2]);
    assert.equal(drawCard(drawn), null);
  });

  it('moves a pawn out of Start on a 1', () => {
    const state = { ...createSorryState(players), deck: [], drawn: 1 as const };
    const start = legalMoves(state, players).find((move) => move.type === 'start' && move.pawn === 0);
    assert.ok(start);
    const played = playMove(state, players, start, 4);
    assert.ok(played);
    assert.deepEqual(played.pawns[ada.id]?.[0], { zone: 'track', index: startExit(0) });
    assert.equal(played.drawn, null);
    assert.equal(played.currentPlayerId, bea.id);
  });

  it('bumps an opponent with Sorry and sends them back to Start', () => {
    const state = {
      ...createSorryState(players),
      drawn: 'sorry' as const,
      pawns: {
        [ada.id]: atStart(),
        [bea.id]: [{ zone: 'track', index: 20 } as PawnSpot, ...atStart().slice(1)],
      },
    };
    const sorry = legalMoves(state, players).find((move) => move.type === 'sorry');
    assert.ok(sorry && sorry.type === 'sorry');
    const played = playMove(state, players, sorry, 4);
    assert.ok(played);
    assert.deepEqual(played.pawns[ada.id]?.[sorry.pawn], { zone: 'track', index: 20 });
    assert.deepEqual(played.pawns[bea.id]?.[sorry.targetPawn], { zone: 'start' });
  });

  it('passes a card that cannot be played', () => {
    const state = { ...createSorryState(players), drawn: 3 as const };
    assert.equal(legalMoves(state, players).length, 0);
    const passed = passTurn(state, players);
    assert.ok(passed);
    assert.equal(passed.drawn, null);
    assert.equal(passed.currentPlayerId, bea.id);
    assert.deepEqual(passed.discard, [3]);
  });
});
