import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withAddedPlayer } from './addPlayer';
import { createDangerState, ensureDangerState, homeCount, legalMoves, passTurn, playMove, rollDie, type DangerSpot, type DangerState } from './danger';
import { createGame, createPlayer } from './models';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';

const ada = { id: 'ada', name: 'Ada' };
const bea = { id: 'bea', name: 'Bea' };
const seats = [ada, bea];

function put(state: DangerState, playerId: string, peg: number, spot: DangerSpot): DangerState {
  return {
    ...state,
    pegs: {
      ...state.pegs,
      [playerId]: state.pegs[playerId].map((current, index) => (index === peg ? spot : current)),
    },
  };
}

describe('danger', () => {
  it('seats two players on opposite colors and leaves every peg at home', () => {
    const state = createDangerState(seats);
    assert.equal(state.colors.ada, 0);
    assert.equal(state.colors.bea, 2);
    assert.equal(state.pegs.ada.every((spot) => spot.zone === 'nest'), true);
    assert.equal(homeCount(state, 'ada'), 0);
  });

  it('brings a peg out on a 6 and lets that player roll again', () => {
    const rolled = rollDie(createDangerState(seats), seats, 6);
    assert.ok(rolled);
    const enter = legalMoves(rolled, seats).find((move) => move.type === 'enter');
    assert.ok(enter);
    const out = playMove(rolled, seats, enter);
    assert.ok(out);
    assert.deepEqual(out.pegs.ada[enter.peg], { zone: 'track', index: 0 });
    assert.equal(out.die, null);
    assert.equal(out.again, true);
    assert.equal(out.currentPlayerId, 'ada');
    assert.match(out.lastAction ?? '', /Roll again/);
  });

  it('passes the turn when the roll cannot leave home', () => {
    const rolled = rollDie(createDangerState(seats), seats, 3);
    assert.ok(rolled);
    assert.equal(rolled.die, 3);
    assert.equal(legalMoves(rolled, seats).length, 0);
    const passed = passTurn(rolled, seats);
    assert.equal(passed?.die, null);
    assert.equal(passed?.currentPlayerId, 'bea');
    assert.match(passed?.lastAction ?? '', /cannot move/);
  });

  it('sends an opponent home on a landing and passes over everyone else', () => {
    let state = put(createDangerState(seats), 'ada', 0, { zone: 'track', index: 0 });
    state = put(state, 'bea', 0, { zone: 'track', index: 2 });
    state = put(state, 'bea', 1, { zone: 'track', index: 4 });
    const passed = rollDie(state, seats, 3);
    assert.ok(passed);
    const move = legalMoves(passed, seats).find((entry) => entry.peg === 0);
    assert.ok(move);
    const landed = playMove(passed, seats, move);
    assert.ok(landed);
    assert.deepEqual(landed.pegs.ada[0], { zone: 'track', index: 3 });
    assert.equal(landed.pegs.bea[0]?.zone, 'track');
    const capture = rollDie({ ...landed, currentPlayerId: 'ada', die: null, again: false }, seats, 1);
    assert.ok(capture);
    const hit = legalMoves(capture, seats).find((entry) => entry.peg === 0);
    assert.ok(hit);
    const taken = playMove(capture, seats, hit);
    assert.ok(taken);
    assert.equal(taken.pegs.bea[1]?.zone, 'nest');
    assert.match(taken.lastAction ?? '', /goes back home/);
  });

  it('will not land on your own peg', () => {
    let state = put(createDangerState(seats), 'ada', 0, { zone: 'track', index: 0 });
    state = put(state, 'ada', 1, { zone: 'track', index: 2 });
    const rolled = rollDie(state, seats, 2);
    assert.ok(rolled);
    assert.equal(legalMoves(rolled, seats).some((move) => move.peg === 0), false);
    assert.equal(legalMoves(rolled, seats).some((move) => move.peg === 1), true);
  });

  it('bumps the peg sitting on your start when a 6 comes out', () => {
    const blocked = put(createDangerState(seats), 'bea', 0, { zone: 'track', index: 0 });
    const rolled = rollDie(blocked, seats, 6);
    assert.ok(rolled);
    const enter = legalMoves(rolled, seats).find((move) => move.type === 'enter');
    assert.ok(enter);
    const out = playMove(rolled, seats, enter);
    assert.ok(out);
    assert.equal(out.pegs.bea[0]?.zone, 'nest');
    assert.deepEqual(out.pegs.ada[enter.peg], { zone: 'track', index: 0 });
  });

  it('needs an exact count to finish and passes a 6 that only overshoots', () => {
    let near = put(createDangerState(seats), 'ada', 0, { zone: 'lane', index: 2 });
    const exact = rollDie(near, seats, 1);
    assert.ok(exact);
    const step = legalMoves(exact, seats).find((move) => move.peg === 0);
    assert.ok(step);
    const home = playMove(exact, seats, step);
    assert.equal(home?.pegs.ada[0]?.zone, 'home');

    near = put(near, 'ada', 1, { zone: 'track', index: 26 });
    near = put(near, 'ada', 2, { zone: 'track', index: 27 });
    near = put(near, 'ada', 3, { zone: 'lane', index: 0 });
    near = put(near, 'ada', 0, { zone: 'lane', index: 1 });
    const stuck = rollDie(near, seats, 6);
    assert.ok(stuck);
    assert.equal(stuck.die, 6);
    assert.equal(legalMoves(stuck, seats).length, 0);
    const passed = passTurn(stuck, seats);
    assert.equal(passed?.currentPlayerId, 'bea');
    assert.equal(passed?.again, false);
  });

  it('wins when the fourth peg reaches the finish', () => {
    let state = put(createDangerState(seats), 'ada', 0, { zone: 'lane', index: 2 });
    state = put(state, 'ada', 1, { zone: 'home' });
    state = put(state, 'ada', 2, { zone: 'home' });
    state = put(state, 'ada', 3, { zone: 'home' });
    const rolled = rollDie(state, seats, 1);
    assert.ok(rolled);
    const move = legalMoves(rolled, seats)[0];
    assert.ok(move);
    const won = playMove(rolled, seats, move);
    assert.ok(won);
    assert.equal(won.winnerId, 'ada');
    assert.equal(won.again, false);
    assert.equal(homeCount(won, 'ada'), 4);
    const template = getTemplate('danger');
    assert.ok(template);
    const game = {
      ...createGame({ name: 'Race', templateId: 'danger', players: [createPlayer('Ada'), createPlayer('Bea')] }),
      players: [ada, bea],
      danger: won,
    };
    const snapshot = calculate(game, template);
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
  });

  it('keeps a healthy game and gives a new seat the opposite color before anyone moves', () => {
    const players = [createPlayer('Ada')];
    const game = {
      ...createGame({ name: 'Race', templateId: 'danger', players }),
      danger: createDangerState(players),
    };
    assert.equal(ensureDangerState(game), game);
    const added = withAddedPlayer(game, 'Bea', 4);
    const beaId = added.players[1]?.id;
    assert.ok(beaId);
    assert.equal(added.danger?.colors[players[0].id], 0);
    assert.equal(added.danger?.colors[beaId], 2);
    assert.equal(added.danger?.pegs[beaId]?.length, 4);
    assert.equal(ensureDangerState(added), added);
  });
});
