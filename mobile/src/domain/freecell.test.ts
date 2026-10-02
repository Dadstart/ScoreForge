import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { createGame, createPlayer, type Game } from './models';
import {
  buildFoundation,
  canFinish,
  cardCode,
  createFreecellState,
  dropTarget,
  ensureFreecellState,
  finish,
  foundationCount,
  hasMove,
  hint,
  layoutFreecell,
  packFreecell,
  play,
  undo,
  unpackFreecell,
  type FreecellState,
  type Suit,
} from './freecell';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function dealOrder(state: FreecellState): string[] {
  const height = Math.max(...state.tableau.map((pile) => pile.length));
  const cards: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < 8; column++) {
      const card = state.tableau[column]?.[row];
      if (card) cards.push(card);
    }
  }
  return cards;
}

function size(state: FreecellState): number {
  return (
    state.cells.filter((cell) => cell !== '').length +
    state.foundations.reduce((sum, pile) => sum + pile.length, 0) +
    state.tableau.reduce((sum, pile) => sum + pile.length, 0)
  );
}

function suited(suit: Suit, ranks: number[]): string[] {
  return ranks.map((rank) => cardCode(rank, suit, true));
}

describe('freecell drop target', () => {
  const card = 40;
  const gap = 6;
  const height = 50;
  const row = 14;

  it('hits a free cell, a foundation, or a column, and misses the gaps', () => {
    assert.deepEqual(dropTarget(10, 10, card, height, gap, row), { pile: 'cell', index: 0 });
    assert.deepEqual(dropTarget(4 * (card + gap) + 8, 10, card, height, gap, row), {
      pile: 'foundation',
      index: 0,
    });
    assert.equal(dropTarget(card + 2, 10, card, height, gap, row), null);
    assert.deepEqual(dropTarget(10, height + row + 4, card, height, gap, row), { pile: 'tableau', index: 0 });
    assert.equal(dropTarget(10, height + 4, card, height, gap, row), null);
    assert.equal(dropTarget(-1, 10, card, height, gap, row), null);
  });
});

describe('freecell deal', () => {
  it('deals Microsoft game 1 and game 617 face up', () => {
    const game1 = createFreecellState(1);
    assert.equal(size(game1), 52);
    assert.equal(game1.deal, 1);
    assert.deepEqual(game1.cells, ['', '', '', '']);
    assert.deepEqual(dealOrder(game1).slice(0, 16), [
      'JD', '2D', '9H', 'JC', '5D', '7H', '7C', '5H',
      'KD', 'KC', '9S', '5S', 'AD', 'QC', 'KH', '3H',
    ]);
    assert.equal(game1.tableau[0]?.at(-1), '6S');
    assert.equal(game1.tableau.every((pile) => pile.every((card) => card[1] === card[1].toUpperCase())), true);

    const game617 = createFreecellState(617);
    assert.deepEqual(dealOrder(game617).slice(0, 8), ['7D', 'AD', '5C', '3S', '5S', '8C', '2D', 'AH']);
    assert.notEqual(dealOrder(game1).join(''), dealOrder(game617).join(''));
  });

  it('packs a map of piles and repairs a broken layout with the same deal', () => {
    const state = createFreecellState(1);
    const packed = packFreecell(state);
    assert.deepEqual(unpackFreecell(packed), state);
    assert.ok(packed.tableau['0']?.includes('JD'));

    const game = {
      ...createGame({ name: 'Freecell', templateId: 'freecell', players: [createPlayer('Ada')] }),
      freecell: state,
    };
    assert.equal(ensureFreecellState(game), game);
    const broken = ensureFreecellState({
      ...game,
      freecell: layoutFreecell({ deal: 617, cells: ['zz'] }),
    });
    assert.equal(broken.freecell?.deal, 617);
    assert.equal(size(broken.freecell!), 52);
    assert.equal(broken.freecell?.tableau[0]?.[0], '7D');
    assert.notEqual(broken.freecell, game.freecell);
    assert.equal(ensureFreecellState({ ...game, templateId: 'klondike' }).freecell, state);
  });
});

describe('freecell moves', () => {
  it('builds foundations in suit order and columns in alternating colors', () => {
    const aces = layoutFreecell({ cells: ['AS'] });
    const ace = play(aces, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 0 });
    assert.ok(ace);
    assert.deepEqual(ace.foundations[0], ['AS']);
    assert.equal(ace.cells[0], '');

    const wrong = layoutFreecell({ cells: ['2H'], foundations: [['AS']] });
    assert.equal(play(wrong, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 0 }), null);
    const two = layoutFreecell({ cells: ['2S'], foundations: [['AS']] });
    const built = play(two, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 0 });
    assert.ok(built);
    assert.deepEqual(built.foundations[0], ['AS', '2S']);

    const queen = layoutFreecell({ cells: ['QH'], tableau: [[], ['KH']] });
    assert.equal(play(queen, { pile: 'cell', index: 0 }, { pile: 'tableau', index: 1 }), null);
    const hearts = layoutFreecell({ cells: ['QH'], tableau: [[], ['KS']] });
    const onKing = play(hearts, { pile: 'cell', index: 0 }, { pile: 'tableau', index: 1 });
    assert.ok(onKing);
    assert.deepEqual(onKing.tableau[1], ['KS', 'QH']);

    const anywhere = layoutFreecell({ cells: ['5D'], tableau: [[]] });
    const parked = play(anywhere, { pile: 'cell', index: 0 }, { pile: 'tableau', index: 0 });
    assert.ok(parked);
    assert.deepEqual(parked.tableau[0], ['5D']);
  });

  it('moves a run only when the free cells and empty columns can hold it', () => {
    const blocked = layoutFreecell({
      cells: ['AS', 'AH', 'AD', 'AC'],
      tableau: [['KS', 'QH'], [], ['2C'], ['3C'], ['4C'], ['5C'], ['6C'], ['7C']],
    });
    assert.equal(play(blocked, { pile: 'tableau', index: 0, at: 0 }, { pile: 'tableau', index: 1 }), null);
    const one = play(blocked, { pile: 'tableau', index: 0, at: 1 }, { pile: 'tableau', index: 1 });
    assert.ok(one);
    assert.deepEqual(one.tableau[1], ['QH']);

    const open = layoutFreecell({
      cells: ['AS', 'AH', 'AD', ''],
      tableau: [['KS', 'QH'], [], ['2C'], ['3C'], ['4C'], ['5C'], ['6C'], ['7C']],
    });
    const both = play(open, { pile: 'tableau', index: 0, at: 0 }, { pile: 'tableau', index: 1 });
    assert.ok(both);
    assert.deepEqual(both.tableau[1], ['KS', 'QH']);
    assert.equal(play(open, { pile: 'tableau', index: 0, at: 0 }, { pile: 'cell', index: 3 }), null);

    const spare = layoutFreecell({
      cells: ['AS', 'AH', 'AD', 'AC'],
      tableau: [['KS', 'QH'], [], [], ['3C'], ['4C'], ['5C'], ['6C'], ['7C']],
    });
    const usingColumn = play(spare, { pile: 'tableau', index: 0, at: 0 }, { pile: 'tableau', index: 1 });
    assert.ok(usingColumn);
    assert.deepEqual(usingColumn.tableau[1], ['KS', 'QH']);

    const sameColor = layoutFreecell({ tableau: [['KS', 'QS'], []] });
    assert.equal(play(sameColor, { pile: 'tableau', index: 0, at: 0 }, { pile: 'tableau', index: 1 }), null);
  });

  it('sends a second tap home, undoes, and finishes only the safe cards', () => {
    const ace = layoutFreecell({ cells: ['AS'] });
    const built = buildFoundation(ace, { pile: 'cell', index: 0 });
    assert.ok(built);
    assert.deepEqual(built.foundations[0], ['AS']);
    const back = undo(built);
    assert.ok(back);
    assert.equal(back.cells[0], 'AS');
    assert.equal(back.moves, 0);
    assert.equal(back.lastAction, 'Undid the last move');

    const early = layoutFreecell({ cells: ['AS', '2H'] });
    assert.equal(canFinish(early), false);
    assert.equal(finish(early), null);
    assert.equal(hint(early), 'Build the ace of spades');
    const partial = buildFoundation(early, { pile: 'cell', index: 0 });
    assert.ok(partial);
    assert.deepEqual(partial.foundations[0], ['AS']);
    assert.equal(partial.cells[1], '2H');

    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const unsafe = layoutFreecell({
      cells: ['2H'],
      foundations: [[], ['AH'], suited('D', ranks), suited('C', ranks)],
      tableau: [[...suited('S', ranks), ...suited('H', ranks.slice(2))]],
    });
    assert.equal(canFinish(unsafe), false);
    assert.equal(finish(unsafe), null);
    const forced = play(unsafe, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 1 });
    assert.ok(forced);
    assert.deepEqual(forced.foundations[1], ['AH', '2H']);

    const open = layoutFreecell({
      foundations: [[], suited('H', ranks), suited('D', ranks), suited('C', ranks)],
      tableau: [suited('S', [...ranks].reverse())],
    });
    assert.equal(canFinish(open), true);
    const homed = finish(open);
    assert.ok(homed);
    assert.equal(homed.won, true);
    assert.equal(homed.undo.length, 1);
    const restored = undo(homed);
    assert.ok(restored);
    assert.equal(restored.tableau[0]?.at(-1), 'AS');
    assert.equal(restored.won, false);
  });

  it('completes the layout on the last card and scores it for the player', () => {
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const foundations = SUITS.map((suit, index) => suited(suit, index === 0 ? ranks.slice(0, 12) : ranks));
    const winning = layoutFreecell({
      cells: ['KS'],
      foundations,
      tableau: [[], [], [], [], [], [], [], []],
    });
    assert.equal(hasMove(winning), true);
    const last = play(winning, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 0 });
    assert.ok(last);
    assert.equal(last.won, true);
    assert.equal(foundationCount(last), 52);
    assert.equal(play(last, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 1 }), null);
    assert.equal(hint(last), null);

    const template = getTemplate('freecell');
    assert.ok(template);
    const player = createPlayer('Ada');
    const game: Game = {
      ...createGame({ name: 'Freecell', templateId: 'freecell', players: [player] }),
      freecell: layoutFreecell({
        foundations: SUITS.map((suit) => suited(suit, ranks)),
        tableau: [[], [], [], [], [], [], [], []],
      }),
    };
    const snap = calculate(game, template);
    assert.equal(snap.isComplete, true);
    assert.equal(snap.winnerName, 'Ada');
    assert.equal(snap.standings[0]?.total, 52);

    const opening = {
      ...createGame({ name: 'Freecell', templateId: 'freecell', players: [player] }),
      freecell: createFreecellState(1),
    };
    const start = calculate(opening, template);
    assert.equal(start.isComplete, false);
    assert.equal(start.standings[0]?.total, 0);
  });
});
