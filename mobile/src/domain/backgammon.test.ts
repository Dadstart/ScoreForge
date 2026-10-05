import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHECKERS_PER_SIDE,
  answerDouble,
  borneOff,
  createBackgammonState,
  endTurn,
  legalMoves,
  offerDouble,
  pipCount,
  playMove,
  resign,
  rollDice,
  stake,
  undoMove,
  type BackgammonState,
} from './backgammon';
import { createPlayer, type Player } from './models';

function players(): [Player, Player] {
  return [createPlayer('Ada'), createPlayer('Bea')];
}

function position(
  pair: [Player, Player],
  points: number[],
  extra?: Partial<Pick<BackgammonState, 'bar' | 'off' | 'turn'>>,
): BackgammonState {
  return createBackgammonState(pair, { points, ...extra });
}

function fill(counts: Record<number, number>): number[] {
  const points = Array.from({ length: 24 }, () => 0);
  for (const [point, count] of Object.entries(counts)) points[Number(point) - 1] = count;
  return points;
}

describe('backgammon', () => {
  const [ada, bea] = players();
  const names = [ada, bea];

  it('opens with 15 checkers on each side and white to play', () => {
    const state = createBackgammonState(names);
    assert.equal(state.turn, 'light');
    assert.equal(state.sides[ada.id], 'light');
    assert.equal(state.sides[bea.id], 'dark');
    assert.equal(pipCount(state, 'light'), 167);
    assert.equal(pipCount(state, 'dark'), 167);
    assert.equal(legalMoves(state).length, 0);
  });

  it('plays the larger die when only one number can be used', () => {
    const state = position(names, fill({ 1: 1, 12: -15 }), { off: { light: 14, dark: 0 } });
    const rolled = rollDice(state, names, [2, 1]);
    assert.ok(rolled);
    assert.deepEqual(
      legalMoves(rolled).map((move) => [move.from, move.to, move.die]),
      [[1, 'off', 2]],
    );
  });

  it('requires the order that uses both dice', () => {
    const state = position(names, fill({ 6: 1, 5: -2, 12: -13 }), { off: { light: 14, dark: 0 } });
    const rolled = rollDice(state, names, [2, 1]);
    assert.ok(rolled);
    assert.deepEqual(
      legalMoves(rolled).map((move) => [move.from, move.to]),
      [[6, 4]],
    );
    const played = playMove(rolled, names, { from: 6, to: 4 });
    assert.ok(played);
    assert.deepEqual(
      legalMoves(played).map((move) => [move.from, move.to]),
      [[4, 3]],
    );
    const done = playMove(played, names, { from: 4, to: 3 });
    assert.ok(done);
    assert.equal(done.turn, 'dark');
    assert.equal(done.dice, null);
  });

  it('hits a blot, blocks a stack, and makes a checker enter before moving', () => {
    const blot = position(names, fill({ 8: 1, 5: -1, 12: -14 }), { off: { light: 14, dark: 0 } });
    const rolled = rollDice(blot, names, [3, 1]);
    assert.ok(rolled);
    const hit = legalMoves(rolled).find((move) => move.to === 5);
    assert.ok(hit?.hit);
    const afterHit = playMove(rolled, names, { from: 8, to: 5 });
    assert.ok(afterHit);
    assert.equal(afterHit.points[4], 1);
    assert.equal(afterHit.bar.dark, 1);

    const stacked = position(names, fill({ 8: 1, 5: -2, 12: -13 }), { off: { light: 14, dark: 0 } });
    const blocked = rollDice(stacked, names, [3, 2]);
    assert.ok(blocked);
    assert.equal(
      legalMoves(blocked).some((move) => move.to === 5),
      false,
    );

    const onBar = position(names, fill({ 6: 14, 24: -2, 12: -13 }), {
      bar: { light: 1, dark: 0 },
      off: { light: 0, dark: 0 },
    });
    const entering = rollDice(onBar, names, [1, 3]);
    assert.ok(entering);
    assert.deepEqual(
      legalMoves(entering).map((move) => [move.from, move.to]),
      [['bar', 22]],
    );
  });

  it('bears off an exact point, or the farthest checker with a larger die', () => {
    const home = position(names, fill({ 6: 10, 4: 5, 12: -15 }));
    const exact = rollDice(home, names, [6, 2]);
    assert.ok(exact);
    assert.equal(
      legalMoves(exact).some((move) => move.from === 6 && move.to === 'off'),
      true,
    );
    assert.equal(
      legalMoves(exact).some((move) => move.from === 4 && move.to === 'off'),
      false,
    );

    const low = position(names, fill({ 4: 1, 19: -15 }), { off: { light: 14, dark: 0 } });
    const larger = rollDice(low, names, [6, 5]);
    assert.ok(larger);
    assert.deepEqual(
      legalMoves(larger).map((move) => [move.from, move.to, move.die]),
      [[4, 'off', 6]],
    );

    const outside = position(names, fill({ 8: 1, 12: -15 }), { off: { light: 14, dark: 0 } });
    const early = rollDice(outside, names, [6, 1]);
    assert.ok(early);
    assert.equal(
      legalMoves(early).some((move) => move.to === 'off'),
      false,
    );
  });

  it('scores a single, a gammon, and a backgammon', () => {
    const ready = (dark: Record<number, number>, barDark = 0, offDark = 0) =>
      position(names, fill({ 1: 1, ...dark }), {
        off: { light: 14, dark: offDark },
        bar: { light: 0, dark: barDark },
      });

    const single = playMove(rollDice(ready({ 12: -14 }, 0, 1), names, [1, 2])!, names, { from: 1, to: 'off' });
    assert.ok(single);
    assert.equal(single.winnerSide, 'light');
    assert.equal(single.winKind, 1);
    assert.equal(borneOff(single, ada.id), CHECKERS_PER_SIDE);

    const gammon = playMove(rollDice(ready({ 12: -15 }), names, [1, 2])!, names, { from: 1, to: 'off' });
    assert.equal(gammon?.winKind, 2);

    const back = playMove(rollDice(ready({ 2: -1, 12: -14 }), names, [1, 2])!, names, { from: 1, to: 'off' });
    assert.equal(back?.winKind, 3);
    assert.equal(stake(back!), 3);
  });

  it('offers the cube, takes, or drops', () => {
    const state = createBackgammonState(names);
    const offered = offerDouble(state, names);
    assert.ok(offered);
    assert.equal(offered.offer, 'light');
    assert.equal(rollDice(offered, names, [3, 1]), null);

    const taken = answerDouble(offered, names, true);
    assert.ok(taken);
    assert.equal(taken.cube, 2);
    assert.equal(taken.cubeOwner, 'dark');
    assert.equal(taken.turn, 'light');
    assert.equal(offerDouble(taken, names), null);

    const dropped = answerDouble(offered, names, false);
    assert.ok(dropped);
    assert.equal(dropped.winnerSide, 'light');
    assert.equal(dropped.winKind, 1);
    assert.equal(stake(dropped), 1);
  });

  it('undoes a move and passes a roll with no play', () => {
    const state = position(names, fill({ 6: 1, 5: -2, 4: -2, 1: -11 }), { off: { light: 14, dark: 0 } });
    const rolled = rollDice(state, names, [1, 2]);
    assert.ok(rolled);
    assert.equal(legalMoves(rolled).length, 0);
    const passed = endTurn(rolled, names);
    assert.ok(passed);
    assert.equal(passed.turn, 'dark');

    const open = position(names, fill({ 8: 1, 12: -15 }), { off: { light: 14, dark: 0 } });
    const moving = rollDice(open, names, [3, 1]);
    assert.ok(moving);
    const played = playMove(moving, names, { from: 8, to: 5 });
    assert.ok(played);
    const undone = undoMove(played, names);
    assert.ok(undone);
    assert.equal(undone.points[7], 1);
    assert.deepEqual(undone.remaining, [3, 1]);
    assert.equal(undone.turn, 'light');
  });

  it('resigns for the current cube', () => {
    const doubled = answerDouble(offerDouble(createBackgammonState(names), names)!, names, true);
    assert.ok(doubled);
    const resigned = resign(doubled, names);
    assert.ok(resigned);
    assert.equal(resigned.winnerSide, 'dark');
    assert.equal(stake(resigned), 2);
  });
});
