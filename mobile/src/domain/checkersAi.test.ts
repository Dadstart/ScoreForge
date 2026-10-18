import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCheckersState,
  isAiTurn,
  legalHops,
  playHop,
  type CheckersState,
} from './checkers';
import { chooseCheckersHop } from './checkersAi';

const players = [
  { id: 'ada', name: 'Ada' },
  { id: 'bot', name: 'Computer' },
];

describe('checkersAi', () => {
  it('stores the computer seat and marks its turn', () => {
    const state = createCheckersState(players, {
      aiPlayerId: 'bot',
      aiDifficulty: 'hard',
    });
    assert.equal(state.aiPlayerId, 'bot');
    assert.equal(state.aiDifficulty, 'hard');
    assert.equal(state.sides.ada, 'dark');
    assert.equal(state.sides.bot, 'light');
    assert.equal(isAiTurn(state), false);

    const hop = legalHops(state)[0];
    assert.ok(hop);
    const after = playHop(state, players, hop);
    assert.ok(after);
    assert.equal(isAiTurn(after), true);
  });

  it('returns a legal hop for each difficulty', () => {
    const state = createCheckersState(players, {
      aiPlayerId: 'bot',
      aiDifficulty: 'medium',
    });
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const hop = chooseCheckersHop(state, difficulty);
      assert.ok(hop);
      assert.ok(
        legalHops(state).some(
          (candidate) =>
            candidate.fromRow === hop.fromRow &&
            candidate.fromCol === hop.fromCol &&
            candidate.toRow === hop.toRow &&
            candidate.toCol === hop.toCol,
        ),
      );
    }
  });

  it('takes a forced capture on medium', () => {
    const state: CheckersState = {
      ...createCheckersState(players, { aiPlayerId: 'bot', aiDifficulty: 'medium' }),
      turn: 'light',
      pieces: [
        { row: 2, col: 3, side: 'light', kind: 'man' },
        { row: 3, col: 4, side: 'dark', kind: 'man' },
        { row: 5, col: 0, side: 'dark', kind: 'man' },
      ],
    };
    const hop = chooseCheckersHop(state, 'medium');
    assert.ok(hop);
    assert.equal(hop.captureRow, 3);
    assert.equal(hop.captureCol, 4);
    assert.equal(hop.toRow, 4);
    assert.equal(hop.toCol, 5);
  });
});
