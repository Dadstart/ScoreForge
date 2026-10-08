import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BANK_PARTY_ID,
  cashFromDelta,
  emojiFieldValue,
  formatMoney,
  playerToken,
  quoteRent,
  singleEmoji,
  transferEvents,
  withoutLastCashAction,
} from './monopoly';
import { createScoreEvent } from './models';

describe('monopoly', () => {
  it('quotes street, railroad, and utility rent', () => {
    assert.deepEqual(quoteRent({
      propertyId: 'mediterranean',
      streetLevel: 0,
      railroadsOwned: 1,
      utilitiesOwned: 1,
      dice: 7,
    }), { amount: 2, summary: 'Mediterranean Avenue, no houses' });
    assert.equal(
      quoteRent({
        propertyId: 'mediterranean',
        streetLevel: 5,
        railroadsOwned: 1,
        utilitiesOwned: 1,
        dice: 7,
      })?.amount,
      250,
    );
    assert.equal(
      quoteRent({
        propertyId: 'mediterranean',
        streetLevel: 0,
        railroadsOwned: 1,
        utilitiesOwned: 1,
        dice: 7,
        purchase: true,
      })?.amount,
      60,
    );
    assert.equal(
      quoteRent({
        propertyId: 'reading',
        streetLevel: 0,
        railroadsOwned: 1,
        utilitiesOwned: 1,
        dice: 7,
      })?.amount,
      25,
    );
    assert.equal(
      quoteRent({
        propertyId: 'electric',
        streetLevel: 0,
        railroadsOwned: 1,
        utilitiesOwned: 1,
        dice: 7,
      })?.amount,
      28,
    );
    assert.equal(
      quoteRent({
        propertyId: 'electric',
        streetLevel: 0,
        railroadsOwned: 1,
        utilitiesOwned: 2,
        dice: 7,
      })?.amount,
      70,
    );
    assert.equal(
      quoteRent({
        propertyId: 'electric',
        streetLevel: 0,
        railroadsOwned: 1,
        utilitiesOwned: 1,
        dice: 1,
      }),
      null,
    );
  });

  it('records one side of a bank payment and both sides of a player payment', () => {
    const fromBank = transferEvents(BANK_PARTY_ID, 'ada', 200);
    assert.equal(fromBank.length, 1);
    assert.equal(fromBank[0]?.points, 200);
    const between = transferEvents('ada', 'bea', 50);
    assert.deepEqual(between.map((event) => event.points), [-50, 50]);
    assert.equal(transferEvents('ada', 'ada', 10).length, 0);
    assert.equal(cashFromDelta(-200), 1300);
    assert.equal(formatMoney(1500), '$1,500');
    assert.equal(formatMoney(-40), '-$40');
  });

  it('maps classic pieces and a single custom emoji', () => {
    assert.equal(playerToken('car')?.emoji, '🚗');
    assert.equal(playerToken('🚗')?.id, 'car');
    assert.equal(playerToken('🦄')?.emoji, '🦄');
    assert.equal(singleEmoji('🦄'), '🦄');
    assert.equal(singleEmoji('hi'), null);
    assert.equal(singleEmoji('🦄🐶'), null);
    assert.equal(emojiFieldValue('hi🦄'), '🦄');
    assert.equal(emojiFieldValue('boot'), 'boot');
  });

  it('undoes the latest payment, including both sides', () => {
    const older = { ...createScoreEvent('ada', 10), timestamp: '2026-01-01T00:00:00.000Z' };
    const paid = { ...createScoreEvent('ada', -50), timestamp: '2026-01-01T00:00:01.000Z' };
    const received = { ...createScoreEvent('bea', 50), timestamp: '2026-01-01T00:00:01.000Z' };
    assert.deepEqual(withoutLastCashAction([older, paid, received]), [older]);
  });
});
