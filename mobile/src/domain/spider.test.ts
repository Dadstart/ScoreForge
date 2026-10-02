import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { createGame, createPlayer } from './models';
import {
  canDeal,
  cardCode,
  cardFace,
  completedCount,
  createSpiderState,
  dealStock,
  dropTarget,
  ensureSpiderState,
  hasMove,
  hint,
  layoutSpider,
  packSpider,
  play,
  runFrom,
  undo,
  unpackSpider,
  type SpiderState,
  type Suit,
} from './spider';

function oneSuitDeck(): string[] {
  const cards: string[] = [];
  for (let copy = 0; copy < 8; copy++) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, 'S', false));
  }
  return cards;
}

function suitRun(suit: Suit): string[] {
  const cards: string[] = [];
  for (let rank = 13; rank >= 1; rank--) cards.push(cardCode(rank, suit, true));
  return cards;
}

function size(state: SpiderState): number {
  return state.stock.length + state.tableau.reduce((sum, column) => sum + column.length, 0) + state.completed.length * 13;
}

function countOf(state: SpiderState, rank: number, suit: Suit): number {
  const cards = [...state.stock, ...state.tableau.flat(), ...state.completed.flat()];
  return cards.filter((code) => {
    const face = cardFace(code);
    return face?.rank === rank && face.suit === suit;
  }).length;
}

describe('spider deal', () => {
  it('deals four columns of six, six columns of five, and a 50-card stock', () => {
    const state = createSpiderState(1, oneSuitDeck());
    assert.equal(state.tableau.length, 10);
    assert.deepEqual(
      state.tableau.map((column) => column.length),
      [6, 6, 6, 6, 5, 5, 5, 5, 5, 5],
    );
    assert.equal(state.stock.length, 50);
    assert.equal(size(state), 104);
    assert.equal(completedCount(state), 0);
    for (const column of state.tableau) {
      const up = column.filter((card) => cardFace(card)?.up);
      assert.equal(up.length, 1);
      assert.equal(cardFace(column[column.length - 1] ?? '')?.up, true);
    }
    assert.equal(countOf(state, 1, 'S'), 8);
    assert.equal(countOf(state, 1, 'H'), 0);
  });

  it('builds two-suit and four-suit decks from the right copies', () => {
    const two = createSpiderState(2, undefined);
    assert.equal(two.suits, 2);
    assert.equal(countOf(two, 1, 'S'), 4);
    assert.equal(countOf(two, 1, 'H'), 4);
    assert.equal(countOf(two, 1, 'D'), 0);
    const four = createSpiderState(4);
    assert.equal(countOf(four, 13, 'C'), 2);
    assert.equal(size(four), 104);
  });

  it('keeps a legal deal and replaces a broken one with the same suit count', () => {
    const state = createSpiderState(1, oneSuitDeck());
    const game = {
      ...createGame({ name: 'Spider', templateId: 'spider', players: [createPlayer('Ada')] }),
      spider: state,
    };
    assert.equal(ensureSpiderState(game), game);
    const broken = ensureSpiderState({
      ...game,
      spider: layoutSpider({ suits: 2, stock: ['zz'] }),
    });
    assert.equal(broken.spider?.suits, 2);
    assert.equal(size(broken.spider!), 104);
    assert.ok(countOf(broken.spider!, 1, 'H') > 0);
    assert.equal(ensureSpiderState({ ...game, templateId: 'klondike' }).spider, state);
  });

  it('packs columns as a map and reads them back', () => {
    const state = createSpiderState(1, oneSuitDeck());
    const stored = packSpider(state);
    assert.ok(!Array.isArray(stored.tableau));
    assert.equal(unpackSpider(stored)?.tableau[0]?.length, 6);
    assert.equal(unpackSpider(stored)?.stock.length, 50);
  });
});

describe('spider moves', () => {
  it('moves a same-suit run, and only the tail of a mixed run', () => {
    const mixed = layoutSpider({
      tableau: [
        [cardCode(8, 'S', true), cardCode(7, 'H', true)],
        [cardCode(8, 'D', true)],
      ],
    });
    assert.equal(runFrom(mixed, 0, 0), null);
    assert.equal(play(mixed, { column: 0, at: 0 }, 1), null);
    const tail = play(mixed, { column: 0, at: 1 }, 1);
    assert.deepEqual(tail?.tableau[1], [cardCode(8, 'D', true), cardCode(7, 'H', true)]);

    const suited = layoutSpider({
      tableau: [
        [cardCode(5, 'S', false), cardCode(9, 'S', true), cardCode(8, 'S', true), cardCode(7, 'S', true)],
        [cardCode(10, 'H', true)],
      ],
    });
    const moved = play(suited, { column: 0, at: 1 }, 1);
    assert.ok(moved);
    assert.deepEqual(moved.tableau[1], [
      cardCode(10, 'H', true),
      cardCode(9, 'S', true),
      cardCode(8, 'S', true),
      cardCode(7, 'S', true),
    ]);
    assert.equal(moved.tableau[0]?.[0], cardCode(5, 'S', true));
    assert.equal(play(suited, { column: 0, at: 1 }, 0), null);

    const back = undo(moved);
    assert.equal(back?.tableau[0]?.[0], cardCode(5, 'S', false));
    assert.equal(back?.moves, 0);
  });

  it('fills an empty column and deals a row only when every column has a card', () => {
    const state = layoutSpider({
      tableau: [[cardCode(4, 'S', true)]],
    });
    const parked = play(state, { column: 0, at: 0 }, 3);
    assert.deepEqual(parked?.tableau[3], [cardCode(4, 'S', true)]);
    assert.deepEqual(parked?.tableau[0], []);

    const stock = Array.from({ length: 10 }, (_, index) => cardCode((index % 13) + 1, 'S', false));
    const full = layoutSpider({
      stock,
      tableau: Array.from({ length: 10 }, () => [cardCode(13, 'H', true)]),
    });
    assert.equal(canDeal(full), true);
    const dealt = dealStock(full);
    assert.equal(dealt?.stock.length, 0);
    assert.equal(cardFace(dealt?.tableau[0]?.at(-1) ?? '')?.rank, 10);
    assert.equal(cardFace(dealt?.tableau[9]?.at(-1) ?? '')?.up, true);
    assert.equal(dealStock({ ...full, tableau: full.tableau.map((column, index) => (index === 2 ? [] : column)) }), null);
  });

  it('removes a same-suit king-to-ace run and turns the card under it', () => {
    const state = layoutSpider({
      tableau: [
        [cardCode(4, 'H', false), ...suitRun('S')],
        [cardCode(2, 'D', true)],
        [cardCode(1, 'D', true)],
      ],
    });
    const next = play(state, { column: 2, at: 0 }, 1);
    assert.ok(next);
    assert.equal(next.completed.length, 1);
    assert.equal(cardFace(next.completed[0]?.[0] ?? '')?.rank, 13);
    assert.equal(next.tableau[0]?.[0], cardCode(4, 'H', true));
    assert.equal(next.lastAction, 'Completed the spades');

    const mixed = [...suitRun('S')];
    mixed[1] = cardCode(12, 'H', true);
    const kept = play(
      layoutSpider({
        tableau: [mixed, [cardCode(2, 'D', true)], [cardCode(1, 'D', true)]],
      }),
      { column: 2, at: 0 },
      1,
    );
    assert.equal(kept?.completed.length, 0);
    assert.equal(kept?.tableau[0]?.length, 13);
  });

  it('wins when eight suits are home', () => {
    const won = layoutSpider({
      suits: 1,
      completed: Array.from({ length: 8 }, () => suitRun('S')),
    });
    assert.equal(won.won, true);
    assert.equal(completedCount(won), 8);
    assert.equal(hasMove(won), false);
    assert.equal(play(won, { column: 0, at: 0 }, 1), null);
    const player = createPlayer('Ada');
    const template = getTemplate('spider');
    assert.ok(template);
    const snapshot = calculate(
      {
        ...createGame({ name: 'Spider', templateId: 'spider', players: [player] }),
        spider: won,
      },
      template,
    );
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
    assert.equal(snapshot.standings[0]?.total, 8);
  });

  it('stops when nothing can move and names a run that can', () => {
    const stuck = layoutSpider({
      tableau: Array.from({ length: 10 }, () => [cardCode(13, 'S', true)]),
    });
    assert.equal(hasMove(stuck), false);
    assert.equal(hint(stuck), 'No moves left');

    const open = layoutSpider({
      tableau: [
        [cardCode(5, 'S', false), cardCode(8, 'S', true)],
        [cardCode(9, 'H', true)],
      ],
    });
    assert.match(hint(open) ?? '', /8 of spades/);
    assert.equal(dropTarget(0, 0, 40, 4), 0);
    assert.equal(dropTarget(42, 10, 40, 4), null);
    assert.equal(dropTarget(44, 10, 40, 4), 1);
  });
});
