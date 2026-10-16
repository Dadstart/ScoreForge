import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiceRoll } from './opolyDice';
import {
  buildHouse,
  buyProperty,
  canBuild,
  createOpolyPlay,
  declineProperty,
  cashSplashes,
  moneyFromSquare,
  mortgageProperty,
  acceptCard,
  landedPropertyId,
  normalizeOpolyPlay,
  payDue,
  rentDue,
  resolveRoll,
  skipBankruptTurn,
  turnPrompt,
  undoOpoly,
  useJailCard,
  withoutOpolyPlayer,
  type OpolyPlay,
  type PlayPlayer,
} from './opolyPlay';
import { CHANCE_CARD_IDS, CHEST_CARD_IDS, cardCopy } from './opolyCards';
import { backwardSpaces, forwardSpaces } from './opolyBoard';
import { createScoreEvent } from './models';

const players: PlayPlayer[] = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

function offeredProperty(play: OpolyPlay | undefined): string | undefined {
  return play?.pending?.kind === 'buy' ? play.pending.propertyId : undefined;
}

function roll(first: number, second: number): DiceRoll {
  return { faces: [first, second], total: first + second, doubles: first === second };
}

function table(partial: Partial<OpolyPlay> = {}): OpolyPlay {
  return { ...createOpolyPlay(['ada', 'bea'], () => 0), undo: null, ...partial };
}

describe('monopoly play', () => {
  it('offers an unowned property and collects salary for passing Go', () => {
    const moved = resolveRoll(table(), { ada: 39 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 1);
    assert.equal(offeredProperty(moved.play), 'mediterranean');
    assert.equal(moved.events.reduce((sum, event) => sum + event.points, 0), 200);
    assert.match(moved.note, /passing GO/);
    assert.match(moved.note, /can buy A for/);
    assert.deepEqual(moved.route?.spaces, [39, 0, 1]);

    const bought = buyProperty(moved.play, moved.tokens, players, 1700);
    assert.ok(!('error' in bought));
    if ('error' in bought) return;
    assert.equal(bought.play.owned.mediterranean, 'ada');
    assert.equal(bought.play.pending, null);
    assert.equal(bought.events[0]?.points, -60);
    assert.match(bought.note, /Roll again/);
    assert.equal(moneyFromSquare(moved.play, bought), 1);
    assert.deepEqual(cashSplashes(moved.events, moved.tokens, moved.route), [
      { playerId: 'ada', space: 0, amount: 200, flow: 'receive', wait: false },
    ]);
    assert.deepEqual(cashSplashes(bought.events, bought.tokens, bought.route), [
      { playerId: 'ada', space: 1, amount: 60, flow: 'pay', wait: false },
    ]);
  });

  it('charges rent, doubles it for a monopoly, and scales railroads', () => {
    const play = table({
      owned: { mediterranean: 'bea', baltic: 'bea', reading: 'bea', 'pennsylvania-rr': 'bea' },
    });
    assert.equal(rentDue(play, 'mediterranean', 7), 4);
    assert.equal(rentDue(play, 'reading', 7), 50);
    const landed = resolveRoll(play, { ada: 0 }, players, roll(1, 2));
    assert.equal(landed.tokens.ada, 3);
    assert.equal(landed.events.length, 0);
    assert.equal(landed.play.turn, 'ada');
    assert.equal(landed.play.pending?.kind, 'pay');
    if (landed.play.pending?.kind !== 'pay') return;
    assert.equal(landed.play.pending.amount, 8);
    const paid = payDue(landed.play, landed.tokens, players);
    assert.ok(!('error' in paid));
    if ('error' in paid) return;
    assert.equal(paid.events.find((event) => event.playerId === 'ada')?.points, -8);
    assert.equal(paid.events.find((event) => event.playerId === 'bea')?.points, 8);
    assert.equal(paid.play.turn, 'bea');
    assert.equal(paid.play.pending, null);
    assert.equal(moneyFromSquare(landed.play, paid), 3);
    assert.deepEqual(cashSplashes(paid.events, { ada: 3, bea: 1 }, paid.route), [
      { playerId: 'ada', space: 3, amount: 8, flow: 'pay', wait: false },
      { playerId: 'bea', space: 1, amount: 8, flow: 'receive', wait: false },
    ]);
  });

  it('gives another roll after doubles and jails the third doubles', () => {
    const owned = table({ owned: { baltic: 'ada' } });
    const again = resolveRoll(owned, { ada: 1 }, players, roll(1, 1));
    assert.equal(again.tokens.ada, 3);
    assert.equal(again.play.doubles, 1);
    assert.equal(again.play.turn, 'ada');
    assert.equal(again.play.pending, null);
    assert.match(again.note, /Roll again/);

    const second = resolveRoll(again.play, again.tokens, players, roll(1, 1));
    assert.equal(second.play.doubles, 2);
    assert.equal(second.play.pending?.kind, 'buy');
    const passed = declineProperty(second.play, second.tokens, players);
    assert.ok(!('error' in passed));
    if ('error' in passed) return;
    assert.equal(passed.play.turn, 'ada');
    assert.equal(passed.play.doubles, 2);
    assert.match(passed.note, /Roll again/);

    const third = resolveRoll(passed.play, passed.tokens, players, roll(1, 1));
    assert.equal(third.tokens.ada, 10);
    assert.equal(third.play.jail.ada, 0);
    assert.equal(third.play.doubles, 0);
    assert.equal(third.play.turn, 'bea');
    assert.equal(third.events.length, 0);
    assert.match(third.note, /Do not pass GO/);
  });

  it('sends the player to jail on the third doubles without moving there', () => {
    const play = table({ doubles: 2 });
    const jailed = resolveRoll(play, { ada: 0 }, players, roll(3, 3));
    assert.equal(jailed.tokens.ada, 10);
    assert.equal(jailed.play.jail.ada, 0);
    assert.equal(jailed.play.turn, 'bea');
    assert.match(jailed.note, /jail/);
    assert.match(jailed.note, /Do not pass GO/);
    assert.deepEqual(jailed.route?.spaces, [0, 10]);
  });

  it('jails the third doubles without collecting salary when the roll would pass Go', () => {
    const play = table({ doubles: 2 });
    // From 38, 4+4 would land on 6 and collect $200 if the move were played out.
    const jailed = resolveRoll(play, { ada: 38 }, players, roll(4, 4), []);
    assert.equal(jailed.tokens.ada, 10);
    assert.equal(jailed.play.jail.ada, 0);
    assert.equal(jailed.play.turn, 'bea');
    assert.equal(jailed.events.length, 0);
    assert.deepEqual(jailed.route?.spaces, [38, 10]);
    assert.equal(jailed.route?.spaces.includes(0), false);
  });

  it('sends a player who lands on Go to Jail straight to jail', () => {
    const jailed = resolveRoll(table(), { ada: 28 }, players, roll(1, 1));
    assert.equal(jailed.tokens.ada, 10);
    assert.equal(jailed.play.jail.ada, 0);
    assert.equal(jailed.play.doubles, 0);
    assert.equal(jailed.play.turn, 'bea');
    assert.equal(jailed.events.length, 0);
    assert.deepEqual(jailed.route?.spaces, [30, 10]);
    assert.match(jailed.note, /Do not pass GO/);
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
    assert.deepEqual(cashSplashes(stuck.events, stuck.tokens, stuck.route), [
      { playerId: 'ada', space: 10, amount: 50, flow: 'pay', wait: false },
    ]);
  });

  it('follows a Chance card onto a property', () => {
    const play = table({ chance: ['boardwalk', 'go'], owned: { boardwalk: 'bea' } });
    const drawn = resolveRoll(play, { ada: 5 }, players, roll(1, 1));
    assert.equal(drawn.tokens.ada, 7);
    assert.deepEqual(drawn.drawn, [{ deck: 'chance', id: 'boardwalk', space: 7 }]);
    const accepted = acceptCard(drawn.play, drawn.tokens, players);
    assert.ok(!('error' in accepted));
    if ('error' in accepted) return;
    assert.equal(accepted.tokens.ada, 39);
    assert.equal(accepted.play.pending?.kind, 'pay');
    if (accepted.play.pending?.kind !== 'pay') return;
    assert.equal(accepted.play.pending.amount, 50);
    const paid = payDue(accepted.play, accepted.tokens, players);
    assert.ok(!('error' in paid));
    if ('error' in paid) return;
    assert.equal(paid.events.find((event) => event.playerId === 'ada')?.points, -50);
    assert.match(accepted.note, /Advance to V/);
    assert.equal(accepted.route?.spaces[0], 7);
    assert.equal(accepted.route?.spaces.at(-1), 39);
    assert.ok((accepted.route?.spaces.length ?? 0) > 12);
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
    assert.deepEqual(cashSplashes(built.events, built.tokens), [
      { playerId: 'ada', space: 1, amount: 50, flow: 'pay', wait: false },
    ]);

    const mortgaged = mortgageProperty(table({ owned: { reading: 'ada' } }), {}, players, 'reading');
    assert.ok(!('error' in mortgaged));
    if ('error' in mortgaged) return;
    assert.equal(rentDue(mortgaged.play, 'reading', 4), 0);

    const moved = resolveRoll(table(), { ada: 39 }, players, roll(1, 1));
    const bought = buyProperty(moved.play, moved.tokens, players, 1700);
    assert.ok(!('error' in bought));
    if ('error' in bought) return;
    const undoneBuy = undoOpoly(bought.play, [...moved.events, ...bought.events]);
    assert.ok(undoneBuy);
    assert.equal(undoneBuy?.play.owned.mediterranean, undefined);
    assert.equal(offeredProperty(undoneBuy?.play), 'mediterranean');
    assert.equal(undoneBuy?.events.length, moved.events.length);
    const chained = undoOpoly(undoneBuy!.play, undoneBuy!.events);
    assert.equal(chained?.tokens.ada, 39);
    assert.equal(chained?.play.pending, null);
    assert.equal(chained?.events.length, 0);

    const undoneRoll = undoOpoly(moved.play, moved.events);
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
    const taxed = resolveRoll(play, { ada: 0 }, players, roll(1, 3));
    assert.equal(taxed.tokens.ada, 4);
    assert.equal(taxed.play.pending?.kind, 'pay');
    assert.equal(moneyFromSquare(play, taxed), null);
    const paid = payDue(taxed.play, taxed.tokens, players);
    assert.ok(!('error' in paid));
    if ('error' in paid) return;
    assert.equal(moneyFromSquare(taxed.play, paid), 4);
    assert.equal(paid.play.turn, 'bea');
  });

  it('holds a Chance card until it is accepted', () => {
    const play = table({ chance: ['back-3', 'go'] });
    const moved = resolveRoll(play, { ada: 5 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 7);
    assert.equal(moved.play.pending?.kind, 'card');
    assert.equal(moved.events.length, 0);
    assert.deepEqual(moved.drawn, [{ deck: 'chance', id: 'back-3', space: 7 }]);
    const accepted = acceptCard(moved.play, moved.tokens, players);
    assert.ok(!('error' in accepted));
    if ('error' in accepted) return;
    assert.equal(accepted.tokens.ada, 4);
    assert.deepEqual(accepted.route?.spaces, [7, 6, 5, 4]);
    assert.equal(accepted.play.pending?.kind, 'pay');
    if (accepted.play.pending?.kind !== 'pay') return;
    assert.equal(accepted.play.pending.amount, 200);
    assert.equal(accepted.play.pending.label, 'Income Tax');
  });

  it('waits to draw the next card until the first one is accepted', () => {
    const play = table({ chance: ['back-3', 'go'], chest: ['doctor', 'go'] });
    const moved = resolveRoll(play, { ada: 34 }, players, roll(1, 1));
    assert.equal(moved.tokens.ada, 36);
    assert.equal(moved.events.some((event) => event.points === -50), false);
    const stepped = acceptCard(moved.play, moved.tokens, players);
    assert.ok(!('error' in stepped));
    if ('error' in stepped) return;
    assert.equal(stepped.tokens.ada, 33);
    assert.equal(stepped.play.pending?.kind, 'card');
    if (stepped.play.pending?.kind !== 'card') return;
    assert.equal(stepped.play.pending.id, 'doctor');
    assert.equal(stepped.events.some((event) => event.points === -50), false);
    const paid = acceptCard(stepped.play, stepped.tokens, players);
    assert.ok(!('error' in paid));
    if ('error' in paid) return;
    assert.equal(paid.events.some((event) => event.points === -50), true);
    assert.equal(paid.play.pending, null);
  });

  it('collects the bank dividend only after the card is accepted', () => {
    const play = table({ chance: ['bank-50', 'go'] });
    const moved = resolveRoll(play, { ada: 0 }, players, roll(3, 4));
    assert.equal(moved.tokens.ada, 7);
    assert.equal(moved.events.length, 0);
    const accepted = acceptCard(moved.play, moved.tokens, players);
    assert.ok(!('error' in accepted));
    if ('error' in accepted) return;
    assert.equal(accepted.events.find((event) => event.playerId === 'ada')?.points, 50);
    assert.equal(accepted.play.turn, 'bea');
    assert.deepEqual(cashSplashes(accepted.events, accepted.tokens, accepted.route), [
      { playerId: 'ada', space: 7, amount: 50, flow: 'receive', wait: false },
    ]);
  });

  it('keeps a Get Out of Jail Free card when it is accepted', () => {
    const play = table({ chest: ['jail-free', 'go'] });
    const moved = resolveRoll(play, { ada: 0 }, players, roll(1, 1));
    assert.equal(moved.play.chestFree.ada, undefined);
    const accepted = acceptCard(moved.play, moved.tokens, players);
    assert.ok(!('error' in accepted));
    if ('error' in accepted) return;
    assert.equal(accepted.play.chestFree.ada, 1);
    assert.equal(accepted.play.chest.includes('jail-free'), false);
  });

  it('has wording for every Chance and Chest card', () => {
    for (const id of CHANCE_CARD_IDS) assert.ok(cardCopy('chance', id).text.length > 8);
    for (const id of CHEST_CARD_IDS) assert.ok(cardCopy('chest', id).text.length > 8);
    assert.equal(cardCopy('chance', 'boardwalk').name, 'Chance');
    assert.equal(cardCopy('chest', 'birthday').name, 'Chest');
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

  it('puts the piece before the player name', () => {
    const marked = [{ id: 'ada', name: 'Ada', token: 'car' }];
    const play = table({ turn: 'ada' });
    assert.equal(turnPrompt(play, marked), "🚗 Ada's turn. Roll the dice.");
    const jailed = table({ turn: 'ada', jail: { ada: 0 } });
    assert.match(turnPrompt(jailed, marked), /^🚗 Ada is in jail/);
  });

  it('passes on a property and gives the turn to the next player', () => {
    const moved = resolveRoll(table(), { ada: 0 }, players, roll(2, 3));
    assert.equal(offeredProperty(moved.play), 'reading');
    const passed = declineProperty(moved.play, moved.tokens, players);
    assert.ok(!('error' in passed));
    if ('error' in passed) return;
    assert.equal(passed.play.pending, null);
    assert.equal(passed.play.owned.reading, undefined);
    assert.equal(passed.play.turn, 'bea');
  });

  it('ends the turn after buying or passing when the undo history is very deep', () => {
    let prior: OpolyPlay['undo'] = null;
    for (let step = 0; step < 40; step += 1) {
      prior = {
        turn: 'ada',
        doubles: 0,
        jail: {},
        owned: {},
        houses: {},
        mortgaged: [],
        chance: ['go'],
        chest: ['go'],
        chanceFree: {},
        chestFree: {},
        pending: null,
        tokens: { ada: 0 },
        events: 0,
        prior,
      };
    }
    const loaded = normalizeOpolyPlay(table({ undo: prior }), ['ada', 'bea']);
    assert.ok(loaded);
    if (!loaded) return;
    assert.ok(nestingDepth({ monopoly: loaded }) <= 20);
    const moved = resolveRoll(loaded, { ada: 0 }, players, roll(2, 3));
    const passed = declineProperty(moved.play, moved.tokens, players);
    const bought = buyProperty(moved.play, moved.tokens, players, 1500);
    assert.ok(!('error' in passed));
    assert.ok(!('error' in bought));
    if ('error' in passed || 'error' in bought) return;
    assert.equal(passed.play.turn, 'bea');
    assert.equal(bought.play.turn, 'bea');
    assert.equal(passed.play.pending, null);
    assert.equal(bought.play.pending, null);
    assert.ok(nestingDepth({ monopoly: passed.play }) <= 20);
    assert.ok(nestingDepth({ monopoly: bought.play }) <= 20);
  });

  it('skips bankrupt players when the turn moves on', () => {
    const seated = [...players, { id: 'cal', name: 'Cal' }];
    const broke = [createScoreEvent('bea', -1500)];
    const moved = resolveRoll(table(), { ada: 15 }, seated, roll(2, 3), broke);
    assert.equal(moved.tokens.ada, 20);
    assert.equal(moved.play.turn, 'cal');
    assert.match(moved.note, /Bea is bankrupt/);

    const stayed = resolveRoll(table(), { ada: 15 }, players, roll(2, 3), broke);
    assert.equal(stayed.play.turn, 'ada');
    assert.match(stayed.note, /Bea is bankrupt/);
  });

  it('ends a doubles turn when the payment leaves the player bankrupt', () => {
    const broke = [createScoreEvent('ada', -1400)];
    const taxed = resolveRoll(table(), { ada: 36 }, players, roll(1, 1), broke);
    assert.equal(taxed.play.pending?.kind, 'pay');
    assert.equal(taxed.play.doubles, 1);
    const paid = payDue(taxed.play, taxed.tokens, players, broke);
    assert.ok(!('error' in paid));
    if ('error' in paid) return;
    assert.equal(paid.play.turn, 'bea');
    assert.equal(paid.play.doubles, 0);
    assert.match(paid.note, /Ada is bankrupt/);
    assert.doesNotMatch(paid.note, /Roll again/);
  });

  it('moves off a bankrupt player before they roll', () => {
    const seated = [...players, { id: 'cal', name: 'Cal' }];
    const broke = [createScoreEvent('bea', -1500), createScoreEvent('cal', -1600)];
    const skipped = skipBankruptTurn(table({ turn: 'bea' }), { bea: 4 }, seated, broke);
    assert.ok(skipped);
    assert.equal(skipped?.play.turn, 'ada');
    assert.match(skipped?.note ?? '', /Bea is bankrupt/);
    assert.match(skipped?.note ?? '', /Cal is bankrupt/);
    assert.equal(
      skipBankruptTurn(table(), {}, players, [createScoreEvent('ada', -1500), createScoreEvent('bea', -1500)]),
      null,
    );
    assert.equal(turnPrompt(table(), players, [createScoreEvent('ada', -1500)]), 'Ada is bankrupt.');
    const left = withoutOpolyPlayer(table({ turn: 'ada' }), 'ada', seated, [createScoreEvent('bea', -1500)]);
    assert.equal(left.turn, 'cal');
  });

  it('moves the token to the square named on an accepted card', () => {
    const moved = (
      deck: 'chance' | 'chest',
      id: string,
      space: number,
      partial: Partial<OpolyPlay> = {},
    ) => {
      const result = acceptCard(
        table({ pending: { kind: 'card', deck, id, space }, ...partial }),
        { ada: space },
        players,
        [],
        () => 0,
      );
      assert.ok(!('error' in result));
      if ('error' in result) throw new Error(result.error);
      return result;
    };
    const collected = (result: { events: { playerId: string; points: number }[] }, id = 'ada') =>
      result.events.filter((event) => event.playerId === id).reduce((sum, event) => sum + event.points, 0);

    const go = moved('chance', 'go', 7);
    assert.equal(go.tokens.ada, 0);
    assert.equal(collected(go), 200);
    assert.deepEqual(go.route?.spaces, forwardSpaces(7, 0));

    const boardwalk = moved('chance', 'boardwalk', 7);
    assert.equal(boardwalk.tokens.ada, 39);
    assert.equal(collected(boardwalk), 0);
    assert.deepEqual(boardwalk.route?.spaces, forwardSpaces(7, 39));
    assert.equal(boardwalk.play.pending?.kind, 'buy');

    const illinois = moved('chance', 'illinois', 36);
    assert.equal(illinois.tokens.ada, 24);
    assert.equal(collected(illinois), 200);
    assert.deepEqual(illinois.route?.spaces, forwardSpaces(36, 24));

    const charles = moved('chance', 'st-charles', 7);
    assert.equal(charles.tokens.ada, 11);
    assert.equal(collected(charles), 0);
    const charlesLap = moved('chance', 'st-charles', 22);
    assert.equal(charlesLap.tokens.ada, 11);
    assert.equal(collected(charlesLap), 200);

    const reading = moved('chance', 'reading', 7);
    assert.equal(reading.tokens.ada, 5);
    assert.equal(collected(reading), 200);
    assert.deepEqual(reading.route?.spaces, forwardSpaces(7, 5));

    const railroad = moved('chance', 'railroad-a', 7);
    assert.equal(railroad.tokens.ada, 15);
    assert.equal(railroad.play.pending?.kind, 'buy');
    const railroadOwned = moved('chance', 'railroad-b', 22, { owned: { bo: 'bea' } });
    assert.equal(railroadOwned.tokens.ada, 25);
    assert.equal(railroadOwned.play.pending?.kind, 'pay');
    if (railroadOwned.play.pending?.kind === 'pay') assert.equal(railroadOwned.play.pending.amount, 50);
    const railroadLap = moved('chance', 'railroad-a', 36, { owned: { reading: 'bea' } });
    assert.equal(railroadLap.tokens.ada, 5);
    assert.equal(collected(railroadLap), 200);
    if (railroadLap.play.pending?.kind === 'pay') assert.equal(railroadLap.play.pending.amount, 50);

    const utility = moved('chance', 'utility', 7);
    assert.equal(utility.tokens.ada, 12);
    assert.equal(utility.play.pending?.kind, 'buy');
    const utilityOwned = moved('chance', 'utility', 22, { owned: { water: 'bea' } });
    assert.equal(utilityOwned.tokens.ada, 28);
    assert.equal(utilityOwned.play.pending?.kind, 'pay');
    if (utilityOwned.play.pending?.kind === 'pay') assert.equal(utilityOwned.play.pending.amount, 20);

    const back = moved('chance', 'back-3', 7);
    assert.equal(back.tokens.ada, 4);
    assert.deepEqual(back.route?.spaces, backwardSpaces(7, 4));

    const jail = moved('chance', 'go-jail', 36);
    assert.equal(jail.tokens.ada, 10);
    assert.equal(jail.play.jail.ada, 0);
    assert.equal(collected(jail), 0);
    assert.deepEqual(jail.route?.spaces, [36, 10]);

    const chestGo = moved('chest', 'go', 33);
    assert.equal(chestGo.tokens.ada, 0);
    assert.equal(collected(chestGo), 200);
    assert.deepEqual(chestGo.route?.spaces, forwardSpaces(33, 0));
    const chestJail = moved('chest', 'go-jail', 2);
    assert.equal(chestJail.tokens.ada, 10);
    assert.equal(chestJail.play.jail.ada, 0);
    assert.equal(collected(chestJail), 0);
  });

  it('collects or pays a money card without moving the token', () => {
    const stayed = (deck: 'chance' | 'chest', id: string, partial: Partial<OpolyPlay> = {}) => {
      const result = acceptCard(
        table({ pending: { kind: 'card', deck, id, space: 7 }, ...partial }),
        { ada: 7 },
        players,
      );
      assert.ok(!('error' in result));
      if ('error' in result) throw new Error(result.error);
      assert.equal(result.tokens.ada, 7);
      assert.equal(result.route, null);
      return result;
    };
    const collected = (result: { events: { playerId: string; points: number }[] }, id = 'ada') =>
      result.events.filter((event) => event.playerId === id).reduce((sum, event) => sum + event.points, 0);

    assert.equal(collected(stayed('chance', 'bank-50')), 50);
    assert.equal(collected(stayed('chance', 'loan')), 150);
    assert.equal(collected(stayed('chance', 'poor-tax')), -15);
    assert.equal(collected(stayed('chest', 'bank-error')), 200);
    assert.equal(collected(stayed('chest', 'stock')), 50);
    assert.equal(collected(stayed('chest', 'holiday')), 100);
    assert.equal(collected(stayed('chest', 'refund')), 20);
    assert.equal(collected(stayed('chest', 'life')), 100);
    assert.equal(collected(stayed('chest', 'doctor')), -50);
    assert.equal(collected(stayed('chest', 'hospital')), -100);
    assert.equal(collected(stayed('chest', 'school')), -50);
    assert.equal(collected(stayed('chest', 'consultancy')), 25);
    assert.equal(collected(stayed('chest', 'beauty')), 10);
    assert.equal(collected(stayed('chest', 'inherit')), 100);

    const chair = stayed('chance', 'chairman');
    assert.equal(collected(chair, 'ada'), -50);
    assert.equal(collected(chair, 'bea'), 50);
    const birthday = stayed('chest', 'birthday');
    assert.equal(collected(birthday, 'ada'), 10);
    assert.equal(collected(birthday, 'bea'), -10);
    assert.equal(
      collected(stayed('chance', 'repairs', { owned: { mediterranean: 'ada' }, houses: { mediterranean: 2 } })),
      -50,
    );
    assert.equal(
      collected(stayed('chest', 'repairs', { owned: { mediterranean: 'ada' }, houses: { mediterranean: 5 } })),
      -115,
    );
    const kept = stayed('chance', 'jail-free');
    assert.equal(kept.play.chanceFree.ada, 1);
    assert.equal(kept.tokens.ada, 7);
  });
});

function nestingDepth(value: unknown, depth = 0): number {
  if (value == null || typeof value !== 'object') return depth;
  const next = depth + 1;
  if (Array.isArray(value)) return value.reduce((max, item) => Math.max(max, nestingDepth(item, next)), next);
  return Object.values(value).reduce((max, item) => Math.max(max, nestingDepth(item, next)), next);
}
