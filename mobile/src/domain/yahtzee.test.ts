import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, createPlayer, createScoreEvent } from './models';
import {
  boxById,
  grandTotal,
  isScorecardComplete,
  scoreError,
  YAHTZEE_BOXES,
} from './yahtzee';

describe('yahtzee', () => {
  it('accepts only the scores a box can show', () => {
    const aces = boxById('aces');
    const twos = boxById('twos');
    const fullHouse = boxById('fullHouse');
    const threeKind = boxById('threeKind');
    assert.ok(aces && twos && fullHouse && threeKind);
    assert.equal(scoreError(aces, 3), null);
    assert.ok(scoreError(aces, 6));
    assert.ok(scoreError(twos, 3));
    assert.equal(scoreError(fullHouse, 25), null);
    assert.ok(scoreError(fullHouse, 10));
    assert.equal(scoreError(threeKind, 18), null);
    assert.ok(scoreError(threeKind, 31));
  });

  it('adds the upper bonus at 63', () => {
    const player = createPlayer('Ada');
    const faces = [
      ['aces', 3],
      ['twos', 6],
      ['threes', 9],
      ['fours', 12],
      ['fives', 15],
      ['sixes', 18],
    ] as const;
    const events = faces.map(([box, points], index) => ({
      ...createScoreEvent(player.id, points, null, box),
      timestamp: `2026-01-01T00:00:0${index}.000Z`,
    }));
    assert.equal(3 + 6 + 9 + 12 + 15 + 18, 63);
    assert.equal(grandTotal(events, player.id), 63 + 35);
  });

  it('is complete only when every player has filled every box', () => {
    const ada = createPlayer('Ada');
    const bea = createPlayer('Bea');
    const filled = YAHTZEE_BOXES.map((box, index) => ({
      ...createScoreEvent(ada.id, 0, null, box.id),
      timestamp: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));
    const game = {
      ...createGame({ name: 'Yahtzee', templateId: 'yahtzee', players: [ada, bea] }),
      events: filled,
    };
    assert.equal(isScorecardComplete(game), false);
    const both = YAHTZEE_BOXES.map((box, index) => ({
      ...createScoreEvent(bea.id, 0, null, box.id),
      timestamp: `2026-01-02T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));
    assert.equal(isScorecardComplete({ ...game, events: [...filled, ...both] }), true);
  });
});
