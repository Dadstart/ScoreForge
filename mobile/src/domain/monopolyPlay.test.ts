import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiceRoll } from './monopolyDice';
import {
  buildHouse,
  buyProperty,
  canBuild,
  createMonopolyPlay,
  declineProperty,
  moneyFromSquare,
  mortgageProperty,
  landedPropertyId,
  rentDue,
  resolveRoll,
  undoMonopoly,
  useJailCard,
  type MonopolyPlay,
  type PlayPlayer,
} from './monopolyPlay';
import { CHANCE_CARD_IDS, CHEST_CARD_IDS, cardCopy } from './monopolyCards';

const players: PlayPlayer[] = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

function roll(first: number, second: number): DiceRoll {
  return { faces: [first, second], total: first + second, doubles: first === second };
}

function table(partial: Partial<MonopolyPlay> = {}): MonopolyPlay {
  return { ...createMonopolyPlay(['ada', 'bea'], () => 0), undo: null, ...partial };
}

describe('monopoly play', () => {
  it('offers an unowned property and collects salary for passing Go', () => {
    const moved = resolveRoll(table(), { ada: 39 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 1);
    assert.equal(moved.play.pending?.propertyId, 'mediterranean');
    assert.equal(moved.events.reduce((sum, event) => sum + event.points, 0), 200);
    assert.match(moved.note, /passing GO/);
    assert.match(moved.note, /Mediterranean Avenue/);
    assert.deepEqual(moved.route?.spaces, [39, 0, 1]);

    const bought = buyProperty(moved.play, moved.tokens, players, 1700);
    assert.ok(!('error' in bought));
    if ('error' in bought) return;
    assert.equal(bought.play.owned.mediterranean, 'ada');
    assert.equal(bought.play.pending, null);
    assert.equal(bought.events[0]?.points, -60);
    assert.match(bought.note, /Roll again/);
    assert.equal(moneyFromSquare(moved.play, bought), 1);
  });

  it('charges rent, doubles it for a monopoly, and scales railroads', () => {
    const play = table({
      owned: { mediterranean: 'bea', baltic: 'bea', reading: 'bea', 'pennsylvania-rr': 'bea' },
    });
    assert.equal(rentDue(play, 'mediterranean', 7), 4);
    assert.equal(rentDue(play, 'reading', 7), 50);
    const landed = resolveRoll(play, { ada: 0 }, players, roll(1, 2));
    assert.equal(landed.tokens.ada, 3);
    assert.equal(landed.events.find((event) => event.playerId === 'ada')?.points, -8);
    assert.equal(landed.events.find((event) => event.playerId === 'bea')?.points, 8);
    assert.equal(landed.play.turn, 'bea');
    assert.equal(moneyFromSquare(play, landed), 3);
  });

  it('sends the player to jail on the third doubles without moving there', () => {
    const play = table({ doubles: 2 });
    const jailed = resolveRoll(play, { ada: 0 }, players, roll(3, 3));
    assert.equal(jailed.tokens.ada, 10);
    assert.equal(jailed.play.jail.ada, 0);
    assert.equal(jailed.play.turn, 'bea');
    assert.match(jailed.note, /jail/);
    assert.deepEqual(jailed.route?.spaces, [0, 10]);
  });

  it('lets doubles out of jail and makes the third miss pay $50', () => {
    const freed = resolveRoll(table({ jail: { ada: 0 }, turn: 'ada' }), { ada: 10 }, players, roll(5, 5));
    assert.equal(freed.play.jail.ada, undefined);
    assert.equal(freed.tokens.ada, 20);
    assert.equal(freed.play.doubles, 0);
    assert.equal(freed.play.turn, 'bea');

    const stuck = resolveRoll(table({ jail: { ada: 2 } }), { ada: 10 }, players, roll(2, 3));
    assert.equal(stuck.play.jail.ada, undefined);
    assert.equal(stuck.events.some((event) => event.points === -50), true);
    assert.equal(stuck.tokens.ada, 15);
  });

  it('follows a Chance card onto a property', () => {
    const play = table({ chance: ['boardwalk', 'go'], owned: { boardwalk: 'bea' } });
    const drawn = resolveRoll(play, { ada: 5 }, players, roll(1, 1));
    assert.equal(drawn.tokens.ada, 39);
    assert.equal(drawn.events.find((event) => event.playerId === 'ada')?.points, -50);
    assert.match(drawn.note, /Boardwalk/);
    assert.equal(drawn.route?.spaces[0], 5);
    assert.equal(drawn.route?.spaces.at(-1), 39);
    assert.equal(drawn.route?.spaces.includes(7), true);
    assert.ok((drawn.route?.spaces.length ?? 0) > 12);
    assert.deepEqual(drawn.drawn, [{ deck: 'chance', id: 'boardwalk', space: 7 }]);
  });

  it('builds evenly, then undoes the purchase and the move', () => {
    const owned = table({ owned: { mediterranean: 'ada', baltic: 'ada' } });
    assert.equal(canBuild(owned, 'mediterranean'), true);
    const built = buildHouse(owned, { ada: 1 }, players, 'mediterranean', 1500);
    assert.ok(!('error' in built));
    if ('error' in built) return;
    assert.equal(built.play.houses.mediterranean, 1);
    assert.equal(canBuild(built.play, 'mediterranean'), false);
    assert.equal(rentDue(built.play, 'mediterranean', 4), 10);
    assert.equal(moneyFromSquare(owned, built), null);

    const mortgaged = mortgageProperty(table({ owned: { reading: 'ada' } }), {}, players, 'reading');
    assert.ok(!('error' in mortgaged));
    if ('error' in mortgaged) return;
    assert.equal(rentDue(mortgaged.play, 'reading', 4), 0);

    const moved = resolveRoll(table(), { ada: 39 }, players, roll(1, 1));
    const bought = buyProperty(moved.play, moved.tokens, players, 1700);
    assert.ok(!('error' in bought));
    if ('error' in bought) return;
    const undoneBuy = undoMonopoly(bought.play, [...moved.events, ...bought.events]);
    assert.ok(undoneBuy);
    assert.equal(undoneBuy?.play.owned.mediterranean, undefined);
    assert.equal(undoneBuy?.play.pending?.propertyId, 'mediterranean');
    assert.equal(undoneBuy?.events.length, moved.events.length);
    const chained = undoMonopoly(undoneBuy!.play, undoneBuy!.events);
    assert.equal(chained?.tokens.ada, 39);
    assert.equal(chained?.play.pending, null);
    assert.equal(chained?.events.length, 0);

    const undoneRoll = undoMonopoly(moved.play, moved.events);
    assert.equal(undoneRoll?.tokens.ada, 39);
    assert.equal(undoneRoll?.events.length, 0);
  });

  it('remembers the property from the latest landing', () => {
    const baltic = resolveRoll(table(), { ada: 0 }, players, roll(1, 2));
    assert.equal(landedPropertyId(baltic.play, baltic.tokens), 'baltic');

    const bought = buyProperty(baltic.play, baltic.tokens, players, 1500);
    assert.ok(!('error' in bought));
    if ('error' in bought) return;
    assert.equal(landedPropertyId(bought.play, bought.tokens), 'baltic');

    const tax = resolveRoll(table(), { ada: 0 }, players, roll(2, 2));
    assert.equal(landedPropertyId(tax.play, tax.tokens), null);
    assert.equal(landedPropertyId(table(), { ada: 0 }), null);
  });

  it('sends bills from a tax square', () => {
    const play = table();
    const taxed = resolveRoll(play, { ada: 0 }, players, roll(2, 2));
    assert.equal(taxed.tokens.ada, 4);
    assert.equal(moneyFromSquare(play, taxed), 4);
  });

  it('walks back three spaces after landing on Chance', () => {
    const play = table({ chance: ['back-3', 'go'] });
    const moved = resolveRoll(play, { ada: 5 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 4);
    assert.deepEqual(moved.route?.spaces, [5, 6, 7, 6, 5, 4]);
    assert.deepEqual(moved.drawn, [{ deck: 'chance', id: 'back-3', space: 7 }]);
  });

  it('draws a second card when Chance sends the token onto Community Chest', () => {
    const play = table({ chance: ['back-3', 'go'], chest: ['doctor', 'go'] });
    const moved = resolveRoll(play, { ada: 34 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 33);
    assert.deepEqual(moved.drawn, [
      { deck: 'chance', id: 'back-3', space: 36 },
      { deck: 'chest', id: 'doctor', space: 33 },
    ]);
    assert.equal(moved.events.some((event) => event.points === -50), true);
  });

  it('has wording for every Chance and Community Chest card', () => {
    for (const id of CHANCE_CARD_IDS) assert.ok(cardCopy('chance', id).text.length > 8);
    for (const id of CHEST_CARD_IDS) assert.ok(cardCopy('chest', id).text.length > 8);
    assert.equal(cardCopy('chance', 'boardwalk').name, 'Chance');
    assert.equal(cardCopy('chest', 'birthday').name, 'Community Chest');
  });

  it('returns a kept jail card to the deck when it is used', () => {
    const play = table({ jail: { ada: 1 }, chanceFree: { ada: 1 }, chance: ['go'] });
    const used = useJailCard(play, { ada: 10 }, players);
    assert.ok(!('error' in used));
    if ('error' in used) return;
    assert.equal(used.play.jail.ada, undefined);
    assert.equal(used.play.chanceFree.ada, 0);
    assert.equal(used.play.chance.at(-1), 'jail-free');
  });

  it('passes on a property and gives the turn to the next player', () => {
    const moved = resolveRoll(table(), { ada: 0 }, players, roll(2, 3));
    assert.equal(moved.play.pending?.propertyId, 'reading');
    const passed = declineProperty(moved.play, moved.tokens, players);
    assert.ok(!('error' in passed));
    if ('error' in passed) return;
    assert.equal(passed.play.pending, null);
    assert.equal(passed.play.owned.reading, undefined);
    assert.equal(passed.play.turn, 'bea');
  });
});
