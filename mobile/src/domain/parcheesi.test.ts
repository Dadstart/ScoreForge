import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withAddedPlayer } from './addPlayer';
import { createGame, createPlayer } from './models';
import {
  createParcheesiState,
  ensureParcheesiState,
  homeCount,
  legalMoves,
  passTurn,
  playMove,
  rollDice,
  type ParcheesiSpot,
  type ParcheesiState,
} from './parcheesi';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';

const ada = { id: 'ada', name: 'Ada' };
const bea = { id: 'bea', name: 'Bea' };
const seats = [ada, bea];

function put(state: ParcheesiState, playerId: string, pawn: number, spot: ParcheesiSpot): ParcheesiState {
  return {
    ...state,
    pawns: {
      ...state.pawns,
      [playerId]: state.pawns[playerId].map((current, index) => (index === pawn ? spot : current)),
    },
  };
}

describe('parcheesi', () => {
  it('seats two players on opposite colors and leaves every pawn in the nest', () => {
    const state = createParcheesiState(seats);
    assert.equal(state.colors.ada, 0);
    assert.equal(state.colors.bea, 2);
    assert.equal(homeCount(state, 'ada'), 0);
    assert.equal(state.pawns.ada.every((spot) => spot.zone === 'nest'), true);
  });

  it('enters on a 5 and then moves that pawn with the other die', () => {
    const rolled = rollDice(createParcheesiState(seats), seats, [5, 2]);
    assert.ok(rolled);
    const enter = legalMoves(rolled, seats).find((move) => move.type === 'enter');
    assert.ok(enter);
    const out = playMove(rolled, seats, enter);
    assert.ok(out);
    assert.deepEqual(out.pawns.ada[enter.pawn], { zone: 'track', index: 0 });
    assert.deepEqual(out.remaining, [2]);
    const step = legalMoves(out, seats).find((move) => move.type === 'run' && move.die === 2);
    assert.ok(step);
    const moved = playMove(out, seats, step);
    assert.ok(moved);
    assert.deepEqual(moved.pawns.ada[step.pawn], { zone: 'track', index: 2 });
    assert.equal(moved.currentPlayerId, 'bea');
  });

  it('plays the larger die when both numbers fit but not together', () => {
    let state = put(createParcheesiState(seats), 'ada', 0, { zone: 'track', index: 0 });
    state = put(state, 'bea', 0, { zone: 'track', index: 6 });
    state = put(state, 'bea', 1, { zone: 'track', index: 6 });
    const rolled = rollDice(state, seats, [3, 4]);
    assert.ok(rolled);
    const moves = legalMoves(rolled, seats);
    assert.deepEqual(
      moves.map((move) => move.type === 'bonus' ? null : move.die),
      [4],
    );
  });

  it('refuses to pass a blockade and captures a single pawn for a bonus of 20', () => {
    let state = put(createParcheesiState(seats), 'ada', 0, { zone: 'track', index: 0 });
    state = put(state, 'bea', 0, { zone: 'track', index: 4 });
    state = put(state, 'bea', 1, { zone: 'track', index: 4 });
    const blocked = rollDice(state, seats, [6, 1]);
    assert.ok(blocked);
    assert.equal(legalMoves(blocked, seats).some((move) => move.type === 'run' && move.die === 6), false);

    let open = put(createParcheesiState(seats), 'ada', 0, { zone: 'track', index: 0 });
    open = put(open, 'bea', 0, { zone: 'track', index: 3 });
    const rolled = rollDice(open, seats, [3, 1]);
    assert.ok(rolled);
    const hit = legalMoves(rolled, seats).find((move) => move.type === 'run' && move.die === 3);
    assert.ok(hit);
    const captured = playMove(rolled, seats, hit);
    assert.ok(captured);
    assert.equal(captured.pawns.bea[0]?.zone, 'nest');
    assert.equal(captured.bonus?.kind, 'capture');
    const bonus = legalMoves(captured, seats).find((move) => move.type === 'bonus');
    assert.ok(bonus);
    const after = playMove(captured, seats, bonus);
    assert.ok(after);
    assert.deepEqual(after.pawns.ada[0], { zone: 'track', index: 23 });
    assert.match(after.lastAction ?? '', /extra 20/);
  });

  it('leaves a pawn on a safe space and will not capture it', () => {
    let state = put(createParcheesiState(seats), 'ada', 0, { zone: 'track', index: 14 });
    state = put(state, 'bea', 0, { zone: 'track', index: 17 });
    const rolled = rollDice(state, seats, [3, 1]);
    assert.ok(rolled);
    assert.equal(legalMoves(rolled, seats).some((move) => move.type === 'run' && move.die === 3), false);
  });

  it('needs an exact count to reach the center', () => {
    const state = put(createParcheesiState(seats), 'ada', 0, { zone: 'lane', index: 6 });
    const rolled = rollDice(state, seats, [1, 2]);
    assert.ok(rolled);
    const moves = legalMoves(rolled, seats);
    assert.equal(moves.length, 1);
    assert.equal(moves[0]?.type === 'run' && moves[0].die === 1, true);
    const home = moves[0] ? playMove(rolled, seats, moves[0]) : null;
    assert.ok(home);
    assert.equal(home.pawns.ada[0]?.zone, 'home');
    assert.equal(home.winnerId, null);
    assert.equal(legalMoves(home, seats).length, 0);
    const passed = passTurn(home, seats);
    assert.equal(passed?.currentPlayerId, 'bea');
  });

  it('wins when the fourth pawn reaches the center without spending the other die', () => {
    let state = createParcheesiState(seats);
    state = put(state, 'ada', 0, { zone: 'lane', index: 6 });
    state = put(state, 'ada', 1, { zone: 'home' });
    state = put(state, 'ada', 2, { zone: 'home' });
    state = put(state, 'ada', 3, { zone: 'home' });
    const rolled = rollDice(state, seats, [1, 6]);
    assert.ok(rolled);
    const move = legalMoves(rolled, seats)[0];
    assert.ok(move);
    const won = playMove(rolled, seats, move);
    assert.ok(won);
    assert.equal(won.winnerId, 'ada');
    assert.equal(homeCount(won, 'ada'), 4);
    const template = getTemplate('parcheesi');
    assert.ok(template);
    const game = {
      ...createGame({ name: 'Race', templateId: 'parcheesi', players: [createPlayer('Ada'), createPlayer('Bea')] }),
      players: [ada, bea],
      parcheesi: won,
    };
    const snapshot = calculate(game, template);
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
  });

  it('rolls again after doubles and sends the leader home on the third double', () => {
    const rolled = rollDice(createParcheesiState(seats), seats, [5, 5]);
    assert.ok(rolled);
    assert.equal(rolled.doublesStreak, 1);
    const first = legalMoves(rolled, seats).find((move) => move.type === 'enter');
    assert.ok(first);
    const entered = playMove(rolled, seats, first);
    assert.ok(entered);
    const second = legalMoves(entered, seats).find((move) => move.type === 'enter' && move.pawn !== first.pawn);
    assert.ok(second);
    const both = playMove(entered, seats, second);
    assert.ok(both);
    assert.equal(both.dice, null);
    assert.equal(both.currentPlayerId, 'ada');
    assert.match(both.lastAction ?? '', /Doubles/);

    let state = put(createParcheesiState(seats), 'ada', 0, { zone: 'track', index: 30 });
    state = { ...state, doublesStreak: 2 };
    const penalty = rollDice(state, seats, [4, 4]);
    assert.ok(penalty);
    assert.equal(penalty.pawns.ada[0]?.zone, 'nest');
    assert.equal(penalty.currentPlayerId, 'bea');
    assert.equal(penalty.doublesStreak, 0);
  });

  it('passes the turn when neither die can move', () => {
    const rolled = rollDice(createParcheesiState(seats), seats, [2, 3]);
    assert.ok(rolled);
    assert.equal(rolled.dice, null);
    assert.equal(rolled.currentPlayerId, 'bea');
    assert.match(rolled.lastAction ?? '', /cannot move/);
    const stuck = {
      ...createParcheesiState(seats),
      dice: [2, 3],
      remaining: [2, 3],
    };
    assert.equal(legalMoves(stuck, seats).length, 0);
    assert.equal(passTurn(stuck, seats)?.currentPlayerId, 'bea');
  });

  it('keeps a healthy game and gives a new seat the opposite color before anyone moves', () => {
    const players = [createPlayer('Ada')];
    const game = {
      ...createGame({ name: 'Race', templateId: 'parcheesi', players }),
      parcheesi: createParcheesiState(players),
    };
    assert.equal(ensureParcheesiState(game), game);
    const added = withAddedPlayer(game, 'Bea', 4);
    const beaId = added.players[1]?.id;
    assert.ok(beaId);
    assert.equal(added.parcheesi?.colors[players[0].id], 0);
    assert.equal(added.parcheesi?.colors[beaId], 2);
    assert.equal(added.parcheesi?.pawns[beaId]?.length, 4);
    assert.equal(ensureParcheesiState(added), added);
  });
});
