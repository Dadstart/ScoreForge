import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { createGame, createPlayer, type Game } from './models';
import {
  buildFoundation,
  cardCode,
  createKlondikeState,
  drawStock,
  ensureKlondikeState,
  finish,
  foundationCount,
  hasMove,
  layoutKlondike,
  packKlondike,
  play,
  undo,
  unpackKlondike,
  type KlondikeState,
  type Suit,
} from './klondike';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function orderedDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, false));
  }
  return cards;
}

function size(state: KlondikeState): number {
  return (
    state.stock.length +
    state.waste.length +
    state.foundations.reduce((sum, pile) => sum + pile.length, 0) +
    state.tableau.reduce((sum, pile) => sum + pile.length, 0)
  );
}

function suited(suit: Suit, ranks: number[]): string[] {
  return ranks.map((rank) => cardCode(rank, suit, true));
}

describe('klondike deal', () => {
  it('deals 28 tableau cards and a 24-card stock', () => {
    const state = createKlondikeState(1, orderedDeck());
    assert.equal(size(state), 52);
    assert.equal(state.stock.length, 24);
    assert.equal(state.waste.length, 0);
    assert.deepEqual(
      state.tableau.map((pile) => pile.length),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(state.tableau[0][0], 'AS');
    for (const pile of state.tableau) {
      const top = pile[pile.length - 1];
      assert.equal(top[1], top[1].toUpperCase());
      for (const card of pile.slice(0, -1)) assert.equal(card[1], card[1].toLowerCase());
    }
    for (const card of state.stock) assert.equal(card[1], card[1].toLowerCase());
    assert.equal(state.stock[state.stock.length - 1], '3d');
    const packed = packKlondike(state);
    assert.ok(!Array.isArray(packed.tableau));
    assert.deepEqual(packed.tableau['6'], state.tableau[6]);
    assert.deepEqual(unpackKlondike(packed), state);
  });

  it('keeps a legal deal and replaces a broken one', () => {
    const game = {
      ...createGame({ name: 'Klondike', templateId: 'klondike', players: [createPlayer('Ada')] }),
      klondike: createKlondikeState(3, orderedDeck()),
    };
    assert.equal(ensureKlondikeState(game), game);
    const broken = ensureKlondikeState({
      ...game,
      klondike: layoutKlondike({ stock: ['zz'], drawCount: 3 }),
    });
    assert.equal(broken.klondike?.drawCount, 3);
    assert.equal(size(broken.klondike!), 52);
    assert.notEqual(broken.klondike, game.klondike);
  });
});

describe('klondike moves', () => {
  it('draws three with the old top underneath, then turns the waste over', () => {
    const state = layoutKlondike({
      drawCount: 3,
      stock: ['5s', '4s', '3s', '2s', 'As'],
    });
    const drawn = drawStock(state);
    assert.ok(drawn);
    assert.deepEqual(drawn.waste, ['AS', '2S', '3S']);
    assert.deepEqual(drawn.stock, ['5s', '4s']);
    const recycled = drawStock({ ...drawn, stock: [] });
    assert.ok(recycled);
    assert.deepEqual(recycled.stock, ['3s', '2s', 'As']);
    assert.deepEqual(recycled.waste, []);
    const back = undo(drawn);
    assert.ok(back);
    assert.deepEqual(back.stock, state.stock);
    assert.equal(back.moves, 0);
    assert.equal(back.lastAction, 'Undid the last move');
  });

  it('builds foundations in suit order and columns in alternating colors', () => {
    const aces = layoutKlondike({ waste: ['AS'] });
    const ace = play(aces, { pile: 'waste' }, { pile: 'foundation', index: 0 });
    assert.ok(ace);
    assert.deepEqual(ace.foundations[0], ['AS']);

    const wrong = layoutKlondike({ waste: ['2H'], foundations: [['AS']] });
    assert.equal(play(wrong, { pile: 'waste' }, { pile: 'foundation', index: 0 }), null);
    const two = layoutKlondike({ waste: ['2S'], foundations: [['AS']] });
    const built = play(two, { pile: 'waste' }, { pile: 'foundation', index: 0 });
    assert.ok(built);
    assert.deepEqual(built.foundations[0], ['AS', '2S']);

    const queen = layoutKlondike({ waste: ['QH'], tableau: [[], ['KH']] });
    assert.equal(play(queen, { pile: 'waste' }, { pile: 'tableau', index: 1 }), null);
    assert.equal(play(queen, { pile: 'waste' }, { pile: 'tableau', index: 0 }), null);
    const hearts = layoutKlondike({ waste: ['QH'], tableau: [[], ['KS']] });
    const onKing = play(hearts, { pile: 'waste' }, { pile: 'tableau', index: 1 });
    assert.ok(onKing);
    assert.deepEqual(onKing.tableau[1], ['KS', 'QH']);

    const ontoNine = layoutKlondike({
      tableau: [['9S'], [], ['8D', '7S', '6H']],
    });
    const moved = play(ontoNine, { pile: 'tableau', index: 2, at: 0 }, { pile: 'tableau', index: 0 });
    assert.ok(moved);
    assert.deepEqual(moved.tableau[0], ['9S', '8D', '7S', '6H']);
    assert.equal(play(ontoNine, { pile: 'tableau', index: 2, at: 1 }, { pile: 'tableau', index: 0 }), null);
  });

  it('turns the card uncovered by a move and sends a second tap home', () => {
    const state = layoutKlondike({
      tableau: [['5s', 'KS'], []],
    });
    const moved = play(state, { pile: 'tableau', index: 0, at: 1 }, { pile: 'tableau', index: 1 });
    assert.ok(moved);
    assert.deepEqual(moved.tableau[0], ['5S']);
    assert.deepEqual(moved.tableau[1], ['KS']);

    const ace = layoutKlondike({ waste: ['AS'] });
    const built = buildFoundation(ace, { pile: 'waste' });
    assert.ok(built);
    assert.deepEqual(built.foundations[0], ['AS']);
    assert.equal(built.waste.length, 0);
  });

  it('finishes an open layout and completes the game on the last card', () => {
    const open = layoutKlondike({
      waste: ['AS'],
      tableau: [['2H']],
    });
    assert.equal(hasMove(open), true);
    const done = finish(open);
    assert.ok(done);
    assert.deepEqual(done.waste, []);
    assert.deepEqual(done.foundations[0], ['AS']);
    assert.deepEqual(done.tableau[0], ['2H']);
    const back = undo(done);
    assert.ok(back);
    assert.deepEqual(back.waste, ['AS']);

    const foundations = SUITS.map((suit, index) => suited(suit, index === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
    const winning = layoutKlondike({ waste: ['KS'], foundations, tableau: [[], [], [], [], [], [], []] });
    const last = play(winning, { pile: 'waste' }, { pile: 'foundation', index: 0 });
    assert.ok(last);
    assert.equal(last.won, true);
    assert.equal(foundationCount(last), 52);
    assert.equal(play(last, { pile: 'waste' }, { pile: 'foundation', index: 1 }), null);
  });

  it('scores foundations and names the player who finishes', () => {
    const template = getTemplate('klondike');
    assert.ok(template);
    const player = createPlayer('Ada');
    const foundations = SUITS.map((suit) => suited(suit, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
    const game: Game = {
      ...createGame({ name: 'Klondike', templateId: 'klondike', players: [player] }),
      klondike: layoutKlondike({ foundations, tableau: Array.from({ length: 7 }, () => []) }),
    };
    const snap = calculate(game, template);
    assert.equal(snap.isComplete, true);
    assert.equal(snap.winnerName, 'Ada');
    assert.equal(snap.standings[0]?.total, 52);
  });
});
