import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createChineseState, legalHops, playHop, playerCap } from './chineseCheckers';

describe('chinese checkers', () => {
  it('opens with a step and then gives the turn to the other seat', () => {
    const players = [
      { id: 'ada', name: 'Ada' },
      { id: 'bea', name: 'Bea' },
    ];
    const state = createChineseState(players, { playerCount: 2 });
    const step = legalHops(state).find((hop) => !hop.jump);
    assert.ok(step);
    const played = playHop(state, players, step);
    assert.ok(played);
    assert.equal(played.turnSeat, 1);
    assert.equal(played.pieces.length, state.pieces.length);
  });

  it('caps a table at the number of seats', () => {
    assert.equal(playerCap({ templateId: 'chinese-checkers', chinese: { playerCount: 2 } }, 6), 2);
    assert.equal(playerCap({ templateId: 'checkers' }, 2), 2);
  });
});
