import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextMonopolyToken, playersFromMonopolySeats, type MonopolySeat } from './addPlayer';

const seat = (name: string, token: string, emojiText = ''): MonopolySeat => ({ name, token, emojiText });

describe('playersFromMonopolySeats', () => {
  it('keeps each name and chosen piece', () => {
    const result = playersFromMonopolySeats([seat('Alex', 'car'), seat('Bob', 'dog')], 8);
    assert.ok('players' in result);
    if (!('players' in result)) return;
    assert.deepEqual(
      result.players.map((player) => ({ name: player.name, token: player.token })),
      [
        { name: 'Alex', token: 'car' },
        { name: 'Bob', token: 'dog' },
      ],
    );
  });

  it('rejects a shared name or piece', () => {
    const sameName = playersFromMonopolySeats([seat('Alex', 'car'), seat('alex', 'hat')], 8);
    assert.equal('error' in sameName && sameName.error, 'Each player needs a different name.');
    const samePiece = playersFromMonopolySeats([seat('Alex', 'car'), seat('Bob', 'car')], 8);
    assert.equal('error' in samePiece && samePiece.error, '🚗 Bob needs a different piece.');
  });

  it('accepts one custom emoji and rejects a sentence', () => {
    const custom = playersFromMonopolySeats([seat('Alex', 'car'), seat('Bob', 'dog', '🦄')], 8);
    assert.ok('players' in custom);
    if (!('players' in custom)) return;
    assert.equal(custom.players[1].token, '🦄');
    const words = playersFromMonopolySeats([seat('Alex', 'car', 'hat please')], 8);
    assert.equal('error' in words && words.error, 'Enter one emoji for Alex.');
  });
});

describe('nextMonopolyToken', () => {
  it('skips pieces already chosen', () => {
    assert.equal(nextMonopolyToken(['car', '🐶']), 'hat');
  });
});
