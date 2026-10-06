import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScoreEvent, type ScoreEvent } from './models';
import {
  createYahtzeeState,
  rollDice,
  scoreDice,
  scoreForBox,
  scorePreview,
  toggleHold,
  undoYahtzee,
  yahtzeeBonusCount,
  type Dice,
} from './yahtzee';

const players = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

function dice(faces: number[]): Dice {
  return faces as Dice;
}

describe('yahtzee dice', () => {
  it('rolls five dice and keeps the ones that are held', () => {
    const started = createYahtzeeState(players);
    assert.equal(started.turn.playerId, 'ada');
    assert.equal(started.turn.rollsLeft, 3);
    const first = rollDice(started, [1, 2, 3, 4, 5]);
    assert.ok(first);
    assert.deepEqual(first.turn.dice, [1, 2, 3, 4, 5]);
    assert.equal(first.turn.rollsLeft, 2);
    const held = toggleHold(first, 0);
    assert.ok(held);
    assert.deepEqual(held.turn.held, [true, false, false, false, false]);
    const second = rollDice(held, [6, 6, 6, 6]);
    assert.ok(second);
    assert.deepEqual(second.turn.dice, [1, 6, 6, 6, 6]);
    assert.equal(second.turn.rollsLeft, 1);
    const third = rollDice(second, [3, 3, 3, 3]);
    assert.ok(third);
    assert.equal(third.turn.rollsLeft, 0);
    assert.equal(toggleHold(third, 1), null);
    assert.equal(rollDice(third, []), null);
  });

  it('scores a roll in an open box and passes the turn', () => {
    const rolled = rollDice(createYahtzeeState(players), [6, 6, 6, 5, 5]);
    assert.ok(rolled);
    const preview = scorePreview(rolled.turn.dice!, [], 'ada');
    assert.equal(preview.sixes, 18);
    assert.equal(preview.fullHouse, 25);
    assert.equal(preview.threeKind, 28);
    assert.equal(preview.yahtzee, 0);
    assert.equal(preview.chance, 28);
    const scored = scoreDice(rolled, [], players, 'fullHouse');
    assert.ok(scored);
    assert.equal(scoreForBox(scored.events, 'ada', 'fullHouse'), 25);
    assert.equal(scored.state.turn.playerId, 'bea');
    assert.equal(scored.state.turn.dice, null);
    assert.equal(scored.state.turn.rollsLeft, 3);
  });

  it('scratches a box the dice do not fill', () => {
    const rolled = rollDice(createYahtzeeState(players), [1, 2, 3, 4, 6]);
    assert.ok(rolled);
    assert.equal(scorePreview(rolled.turn.dice!, [], 'ada').largeStraight, 0);
    assert.equal(scorePreview(rolled.turn.dice!, [], 'ada').smallStraight, 30);
    const straight = rollDice(createYahtzeeState(players), [1, 2, 3, 4, 5]);
    assert.equal(straight && scorePreview(straight.turn.dice!, [], 'ada').largeStraight, 40);
    const scored = scoreDice(rolled, [], players, 'largeStraight');
    assert.equal(scored && scoreForBox(scored.events, 'ada', 'largeStraight'), 0);
  });

  it('gives a Yahtzee bonus and forces the matching upper box', () => {
    const events = [createScoreEvent('ada', 50, null, 'yahtzee')];
    const rolled = rollDice(createYahtzeeState(players), [4, 4, 4, 4, 4]);
    assert.ok(rolled);
    const preview = scorePreview(rolled.turn.dice!, events, 'ada');
    assert.equal(preview.fours, 20);
    assert.equal(preview.chance, null);
    assert.equal(preview.yahtzee, null);
    const scored = scoreDice(rolled, events, players, 'fours');
    assert.ok(scored);
    assert.equal(scoreForBox(scored.events, 'ada', 'fours'), 20);
    assert.equal(yahtzeeBonusCount(scored.events, 'ada'), 1);
    const undone = undoYahtzee(scored.state, scored.events);
    assert.ok(undone);
    assert.deepEqual(undone.state.turn.dice, [4, 4, 4, 4, 4]);
    assert.equal(scoreForBox(undone.events, 'ada', 'fours'), null);
    assert.equal(yahtzeeBonusCount(undone.events, 'ada'), 0);
  });

  it('scores a joker in the lower section once that upper box is filled', () => {
    const events: ScoreEvent[] = [
      createScoreEvent('ada', 50, null, 'yahtzee'),
      createScoreEvent('ada', 20, null, 'fours'),
    ];
    const rolled = rollDice(createYahtzeeState(players), [4, 4, 4, 4, 4]);
    assert.ok(rolled);
    const preview = scorePreview(rolled.turn.dice!, events, 'ada');
    assert.equal(preview.fours, null);
    assert.equal(preview.fullHouse, 25);
    assert.equal(preview.smallStraight, 30);
    assert.equal(preview.largeStraight, 40);
    assert.equal(preview.chance, 20);
    assert.equal(preview.aces, null);
    const scored = scoreDice(rolled, events, players, 'fullHouse');
    assert.equal(scored && scoreForBox(scored.events, 'ada', 'fullHouse'), 25);
    assert.equal(scored && yahtzeeBonusCount(scored.events, 'ada'), 1);
  });

  it('does not award a bonus when the Yahtzee box was scratched', () => {
    const events = [createScoreEvent('ada', 0, null, 'yahtzee')];
    const rolled = rollDice(createYahtzeeState(players), [1, 1, 1, 1, 1]);
    assert.ok(rolled);
    const scored = scoreDice(rolled, events, players, 'aces');
    assert.equal(scored && scoreForBox(scored.events, 'ada', 'aces'), 5);
    assert.equal(scored && yahtzeeBonusCount(scored.events, 'ada'), 0);
  });
});
