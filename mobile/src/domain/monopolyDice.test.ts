import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardStep, rollMonopolyDice } from './monopolyDice';

describe('monopoly dice', () => {
  it('rolls two faces from 1 to 6', () => {
    const low = rollMonopolyDice(() => 0);
    assert.deepEqual(low.faces, [1, 1]);
    assert.equal(low.total, 2);
    assert.equal(low.doubles, true);

    const high = rollMonopolyDice(() => 0.999);
    assert.deepEqual(high.faces, [6, 6]);
    assert.equal(high.total, 12);
    assert.equal(high.doubles, true);

    const mixed = rollMonopolyDice(() => 0.5);
    assert.equal(mixed.faces[0], 4);
    assert.equal(mixed.doubles, true);
  });

  it('walks the track and notices passing Go', () => {
    assert.deepEqual(boardStep(0, 7), { index: 7, passedGo: false });
    assert.deepEqual(boardStep(36, 6), { index: 2, passedGo: true });
    assert.deepEqual(boardStep(39, 1), { index: 0, passedGo: true });
    assert.deepEqual(boardStep(10, 12), { index: 22, passedGo: false });
  });
});
