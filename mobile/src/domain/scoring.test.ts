import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateShareCode, isShareCode, type Game, type Player, type ScoreEvent } from './models';
import { nextSavedRevision, StaleGameError } from './revisions';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { yahtzeeBonusCount } from './yahtzee';

function player(id: string, name: string): Player {
  return { id, name };
}

function event(partial: Pick<ScoreEvent, 'id' | 'playerId' | 'points'> & Partial<ScoreEvent>): ScoreEvent {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function game(partial: Pick<Game, 'templateId' | 'players' | 'events'> & Partial<Game>): Game {
  return {
    id: 'ABCDEF',
    shareCode: 'ABCDEF',
    name: 'Test',
    status: 'InProgress',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('share codes', () => {
  it('accepts only 6 unambiguous characters', () => {
    assert.equal(isShareCode('K7M2QX'), true);
    assert.equal(isShareCode('K7M2'), false);
    assert.equal(isShareCode('K7M2QO'), false);
    assert.equal(isShareCode('k7m2qx'), false);
  });

  it('draws codes from the share alphabet', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const code = generateShareCode();
      assert.equal(isShareCode(code), true);
      codes.add(code);
    }
    assert.ok(codes.size > 1);
  });
});

describe('revisions', () => {
  it('advances when the edit is based on the server revision', () => {
    assert.equal(nextSavedRevision(4, 4), 5);
  });

  it('rejects a stale edit', () => {
    assert.throws(() => nextSavedRevision(4, 5), StaleGameError);
  });
});

describe('calculate', () => {
  it('does not finish golf until every player has entered the last hole', () => {
    const template = getTemplate('golf');
    assert.ok(template);
    const snapshot = calculate(
      game({
        templateId: 'golf',
        maxRounds: 18,
        players: [player('a', 'Ada'), player('b', 'Bea')],
        events: [
          event({ id: '1', playerId: 'a', points: 4, roundNumber: 18, timestamp: '2026-01-01T00:00:01.000Z' }),
          event({ id: '2', playerId: 'b', points: 5, roundNumber: 1, timestamp: '2026-01-01T00:00:02.000Z' }),
        ],
      }),
      template,
    );
    assert.equal(snapshot.isComplete, false);
  });

  it('finishes golf once every player has reached the last hole', () => {
    const template = getTemplate('golf');
    assert.ok(template);
    const snapshot = calculate(
      game({
        templateId: 'golf',
        maxRounds: 18,
        players: [player('a', 'Ada'), player('b', 'Bea')],
        events: [
          event({ id: '1', playerId: 'a', points: 4, roundNumber: 18 }),
          event({ id: '2', playerId: 'b', points: 5, roundNumber: 18 }),
        ],
      }),
      template,
    );
    assert.equal(snapshot.isComplete, true);
  });

  it('ignores a target of zero', () => {
    const template = getTemplate('cribbage');
    assert.ok(template);
    const snapshot = calculate(
      game({
        templateId: 'cribbage',
        targetScore: 0,
        players: [player('a', 'Ada')],
        events: [event({ id: '1', playerId: 'a', points: 1 })],
      }),
      template,
    );
    assert.equal(snapshot.isComplete, false);
  });

  it('awards first-to-target to the first player who crossed, not the higher total', () => {
    const template = getTemplate('cribbage');
    assert.ok(template);
    const snapshot = calculate(
      game({
        templateId: 'cribbage',
        targetScore: 15,
        players: [player('a', 'Ada'), player('b', 'Bea')],
        events: [
          event({ id: '1', playerId: 'a', points: 10, timestamp: '2026-01-01T00:00:01.000Z' }),
          event({ id: '2', playerId: 'a', points: 10, timestamp: '2026-01-01T00:00:02.000Z' }),
          event({ id: '3', playerId: 'b', points: 40, timestamp: '2026-01-01T00:00:03.000Z' }),
        ],
      }),
      template,
    );
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.standings.find((row) => row.playerId === 'a')?.isWinner, true);
    assert.equal(snapshot.standings.find((row) => row.playerId === 'b')?.isWinner, false);
  });
});

describe('yahtzee bonuses', () => {
  it('does not count a five-of-a-kind scored before the Yahtzee box', () => {
    const events = [
      event({ id: '1', playerId: 'a', points: 5, box: 'aces', timestamp: '2026-01-01T00:00:01.000Z' }),
      event({ id: '2', playerId: 'a', points: 50, box: 'yahtzee', timestamp: '2026-01-01T00:00:02.000Z' }),
    ];
    assert.equal(yahtzeeBonusCount(events, 'a'), 0);
  });

  it('counts a five-of-a-kind scored after the Yahtzee box', () => {
    const events = [
      event({ id: '1', playerId: 'a', points: 50, box: 'yahtzee', timestamp: '2026-01-01T00:00:01.000Z' }),
      event({ id: '2', playerId: 'a', points: 30, box: 'chance', timestamp: '2026-01-01T00:00:02.000Z' }),
    ];
    assert.equal(yahtzeeBonusCount(events, 'a'), 1);
  });
});
