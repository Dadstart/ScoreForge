import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPlayer, type Player } from './models';
import { slidePoint } from './sorryBoard';
import {
  createSorryState,
  drawCard,
  drawFromDeck,
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

  it('discards an unusable card and draws the next one from the deck', () => {
    const state = { ...createSorryState(players), deck: [1, 3], discard: [], drawn: null };
    const first = drawFromDeck(state, players);
    assert.ok(first);
    assert.equal(first.drawn, 3);
    assert.equal(legalMoves(first, players).length, 0);
    assert.equal(drawCard(first), null);
    const second = drawFromDeck(first, players);
    assert.ok(second);
    assert.equal(second.drawn, 1);
    assert.equal(second.currentPlayerId, bea.id);
    assert.deepEqual(second.discard, [3]);
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
    assert.deepEqual(played.pawnTravels, [
      {
        playerId: ada.id,
        pawn: 0,
        delay: 0,
        stops: [{ zone: 'start' }, { zone: 'track', index: startExit(0) }],
      },
    ]);
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
    assert.deepEqual(played.pawnTravels, [
      {
        playerId: ada.id,
        pawn: sorry.pawn,
        delay: 0,
        stops: [{ zone: 'start' }, { zone: 'track', index: 20 }],
      },
      {
        playerId: bea.id,
        pawn: sorry.targetPawn,
        delay: 0,
        stops: [{ zone: 'track', index: 20 }, { zone: 'start' }],
      },
    ]);
  });

  it('does not slide on its own color', () => {
    const state = {
      ...createSorryState(players),
      currentPlayerId: bea.id,
      drawn: 1 as const,
      pawns: {
        [ada.id]: [{ zone: 'track', index: 26 } as PawnSpot, ...atStart().slice(1)],
        [bea.id]: [{ zone: 'track', index: 23 } as PawnSpot, ...atStart().slice(1)],
      },
    };
    const move = legalMoves(state, players).find(
      (item) => item.type === 'forward' && item.pawn === 0 && item.steps === 1,
    );
    assert.ok(move);
    const played = playMove(state, players, move, 4);
    assert.ok(played);
    assert.deepEqual(played.pawns[bea.id]?.[0], { zone: 'track', index: 24 });
    assert.deepEqual(played.pawns[ada.id]?.[0], { zone: 'track', index: 26 });
    assert.deepEqual(played.pawnSlides, []);
    assert.deepEqual(played.pawnTravels, [
      {
        playerId: bea.id,
        pawn: 0,
        delay: 0,
        stops: [
          { zone: 'track', index: 23 },
          { zone: 'track', index: 24 },
        ],
      },
    ]);
  });

  it('slides forward 4 on another color and bumps pawns on it', () => {
    const state = {
      ...createSorryState(players),
      drawn: 1 as const,
      pawns: {
        [ada.id]: [
          { zone: 'track', index: 23 } as PawnSpot,
          { zone: 'track', index: 27 } as PawnSpot,
          ...atStart().slice(2),
        ],
        [bea.id]: [{ zone: 'track', index: 25 } as PawnSpot, ...atStart().slice(1)],
      },
    };
    const move = legalMoves(state, players).find(
      (item) => item.type === 'forward' && item.pawn === 0 && item.steps === 1,
    );
    assert.ok(move);
    const played = playMove(state, players, move, 4);
    assert.ok(played);
    assert.deepEqual(played.pawns[ada.id]?.[0], { zone: 'track', index: 28 });
    assert.deepEqual(played.pawns[ada.id]?.[1], { zone: 'start' });
    assert.deepEqual(played.pawns[bea.id]?.[0], { zone: 'start' });
    assert.deepEqual(played.pawnSlides, [{ playerId: ada.id, pawn: 0, start: 24, end: 28 }]);
    assert.deepEqual(played.pawnTravels, [
      {
        playerId: ada.id,
        pawn: 0,
        delay: 0,
        stops: [23, 24, 25, 26, 27, 28].map((index) => ({ zone: 'track', index })),
      },
      {
        playerId: ada.id,
        pawn: 1,
        delay: 4,
        stops: [
          { zone: 'track', index: 27 },
          { zone: 'start' },
        ],
      },
      {
        playerId: bea.id,
        pawn: 0,
        delay: 2,
        stops: [
          { zone: 'track', index: 25 },
          { zone: 'start' },
        ],
      },
    ]);
  });

  it('walks a pawn backward, into safety, and home', () => {
    const backwardState = {
      ...createSorryState(players),
      drawn: 4 as const,
      pawns: {
        [ada.id]: [{ zone: 'track', index: 10 } as PawnSpot, ...atStart().slice(1)],
        [bea.id]: atStart(),
      },
    };
    const backward = legalMoves(backwardState, players).find((move) => move.type === 'backward');
    assert.ok(backward);
    const backed = playMove(backwardState, players, backward, 4);
    assert.ok(backed);
    assert.deepEqual(backed.pawns[ada.id]?.[0], { zone: 'track', index: 6 });
    assert.deepEqual(
      backed.pawnTravels[0]?.stops.map((stop) => (stop.zone === 'track' ? stop.index : stop.zone)),
      [10, 9, 8, 7, 6],
    );

    const safetyState = {
      ...createSorryState(players),
      drawn: 3 as const,
      pawns: {
        [ada.id]: [{ zone: 'track', index: 0 } as PawnSpot, ...atStart().slice(1)],
        [bea.id]: atStart(),
      },
    };
    const forward = legalMoves(safetyState, players).find((move) => move.type === 'forward');
    assert.ok(forward);
    const entered = playMove(safetyState, players, forward, 4);
    assert.ok(entered);
    assert.deepEqual(entered.pawns[ada.id]?.[0], { zone: 'safety', index: 1 });
    assert.deepEqual(entered.pawnTravels[0]?.stops, [
      { zone: 'track', index: 0 },
      { zone: 'track', index: 1 },
      { zone: 'track', index: 2 },
      { zone: 'safety', index: 0 },
      { zone: 'safety', index: 1 },
    ]);

    const homeState = {
      ...createSorryState(players),
      drawn: 1 as const,
      pawns: {
        [ada.id]: [{ zone: 'safety', index: 4 } as PawnSpot, ...atStart().slice(1)],
        [bea.id]: atStart(),
      },
    };
    const finish = legalMoves(homeState, players).find((move) => move.type === 'forward');
    assert.ok(finish);
    const home = playMove(homeState, players, finish, 4);
    assert.ok(home);
    assert.deepEqual(home.pawns[ada.id]?.[0], { zone: 'home' });
    assert.deepEqual(home.pawnTravels[0]?.stops, [
      { zone: 'safety', index: 4 },
      { zone: 'home' },
    ]);
  });

  it('moves the second pawn of a split after the first arrives', () => {
    const state = {
      ...createSorryState(players),
      drawn: 7 as const,
      pawns: {
        [ada.id]: [
          { zone: 'track', index: 5 } as PawnSpot,
          { zone: 'track', index: 20 } as PawnSpot,
          ...atStart().slice(2),
        ],
        [bea.id]: atStart(),
      },
    };
    const split = legalMoves(state, players).find(
      (move) => move.type === 'split' && move.pawn === 0 && move.steps === 4 && move.pawn2 === 1 && move.steps2 === 3,
    );
    assert.ok(split && split.type === 'split');
    const played = playMove(state, players, split, 4);
    assert.ok(played);
    assert.deepEqual(played.pawns[ada.id]?.[0], { zone: 'track', index: 9 });
    assert.deepEqual(played.pawns[ada.id]?.[1], { zone: 'track', index: 23 });
    assert.equal(played.pawnTravels[0]?.delay, 0);
    assert.equal(played.pawnTravels[0]?.stops.length, 5);
    assert.equal(played.pawnTravels[1]?.delay, 4);
    assert.deepEqual(played.pawnTravels[1]?.stops[0], { zone: 'track', index: 20 });
    assert.deepEqual(played.pawnTravels[1]?.stops.at(-1), { zone: 'track', index: 23 });
  });

  it('walks a slide from the triangle to the end', () => {
    assert.deepEqual(slidePoint(16, 19, 0), { x: 15, y: 14 });
    assert.deepEqual(slidePoint(16, 19, 1), { x: 15, y: 11 });
    const mid = slidePoint(16, 19, 0.5);
    assert.equal(mid.x, 15);
    assert.ok(mid.y < 14 && mid.y > 11);
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
