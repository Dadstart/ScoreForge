import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openingPlayer, withAddedPlayer, withoutPlayer } from './addPlayer';
import { findLocalPlayerId, nextRoundForPlayer } from './localPlayer';
import { createGame, createPlayer, createScoreEvent, normalizeShareCode } from './models';
import { gameScreenForTemplate } from '../navigation/types';
import { preferNewerGame } from './revisions';

function fresh(templateId = 'rounds') {
  return createGame({
    name: 'Test',
    templateId,
    players: [createPlayer('Ada')],
  });
}

describe('players', () => {
  it('adds a unique name and refuses a full table or a blank name', () => {
    const game = fresh();
    const added = withAddedPlayer(game, ' Bea ', 4);
    assert.deepEqual(added.players.map((player) => player.name), ['Ada', 'Bea']);
    assert.throws(() => withAddedPlayer(added, 'bea', 4), /already in the game/);
    assert.throws(() => withAddedPlayer(added, '  ', 4), /player name/);
    const full = withAddedPlayer(withAddedPlayer(added, 'Cy', 4), 'Di', 4);
    assert.throws(() => withAddedPlayer(full, 'Ed', 4), /maximum of 4/);
  });

  it('gives the Monopoly host the first piece', () => {
    assert.equal(openingPlayer('monopoly', 'Ada').token, 'car');
    assert.equal(openingPlayer('rounds', 'Ada').token, undefined);
  });

  it('gives a new Monopoly player the first free token', () => {
    const game = fresh('monopoly');
    const host = game.players[0];
    assert.ok(host);
    host.token = 'car';
    const added = withAddedPlayer(game, 'Bea', 8);
    assert.equal(added.players[1]?.token, 'dog');
    assert.equal(added.events.length, 0);
    host.token = '🚗';
    assert.equal(withAddedPlayer(game, 'Cy', 8).players[1]?.token, 'dog');
  });

  it('removes a player and that player’s scores, and keeps the last one', () => {
    const game = fresh();
    const added = withAddedPlayer(game, 'Bea', 4);
    const bea = added.players[1];
    assert.ok(bea);
    const scored = {
      ...added,
      events: [createScoreEvent(game.players[0].id, 3), createScoreEvent(bea.id, 5)],
      tokenSpaces: { [bea.id]: 4 },
    };
    const left = withoutPlayer(scored, bea.id);
    assert.deepEqual(left.players.map((player) => player.name), ['Ada']);
    assert.equal(left.events.length, 1);
    assert.equal(left.tokenSpaces?.[bea.id], undefined);
    assert.throws(() => withoutPlayer(left, left.players[0].id), /at least one player/);
  });

  it('matches the local name and counts that player’s next round', () => {
    const game = fresh();
    const ada = game.players[0];
    assert.equal(findLocalPlayerId(game, ' ada '), ada.id);
    assert.equal(findLocalPlayerId(game, 'Bea'), null);
    const played = { ...game, events: [createScoreEvent(ada.id, 4, 2)] };
    assert.equal(nextRoundForPlayer(played, ada.id), 3);
    assert.equal(nextRoundForPlayer(played, 'missing'), 1);
  });
});

describe('navigation and sync', () => {
  it('sends each template to its screen', () => {
    assert.equal(gameScreenForTemplate('klondike'), 'Klondike');
    assert.equal(gameScreenForTemplate('spider'), 'Spider');
    assert.equal(gameScreenForTemplate('tripeaks'), 'TriPeaks');
    assert.equal(gameScreenForTemplate('backgammon'), 'Backgammon');
    assert.equal(gameScreenForTemplate('chinese-checkers'), 'ChineseCheckers');
    assert.equal(gameScreenForTemplate('free-play'), 'Board');
    assert.equal(gameScreenForTemplate('rounds'), 'Board');
  });

  it('keeps the newer revision when two copies arrive', () => {
    const older = fresh();
    const newer = { ...older, revision: older.revision + 1, name: 'Later' };
    assert.equal(preferNewerGame(older, newer).name, 'Later');
    assert.equal(preferNewerGame(newer, older).name, newer.name);
    assert.equal(preferNewerGame(null, older), older);
  });

  it('normalizes a spoken share code', () => {
    assert.equal(normalizeShareCode(' k7m-2qx '), 'K7M2QX');
    assert.equal(normalizeShareCode('oi-01'), '');
  });
});
