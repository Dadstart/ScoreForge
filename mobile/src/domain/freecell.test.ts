import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardCode, type Suit } from './klondike';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { createGame, createPlayer } from './models';
import {
  buildFoundation,
  createFreecellState,
  dropTarget,
  ensureFreecellState,
  finish,
  hasMove,
  homeCount,
  layoutFreecell,
  packFreecell,
  play,
  undo,
  unpackFreecell,
  type FreecellState,
} from './freecell';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function up(rank: number, suit: Suit): string {
  return cardCode(rank, suit, true);
}

function orderedDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(up(rank, suit));
  }
  return cards;
}

function size(state: FreecellState): number {
  return (
    state.cells.filter((card) => card != null).length +
    homeCount(state) +
    state.cascades.reduce((sum, pile) => sum + pile.length, 0)
  );
}

describe('freecell deal', () => {
  it('deals four columns of seven and four of six, all face up', () => {
    const dealt = createFreecellState(orderedDeck());
    assert.equal(size(dealt), 52);
    assert.deepEqual(
      dealt.cascades.map((pile) => pile.length),
      [7, 7, 7, 7, 6, 6, 6, 6],
    );
    assert.equal(dealt.cascades[0][0], up(1, 'S'));
    assert.equal(dealt.cascades[7][5], up(9, 'C'));
    assert.ok(dealt.cascades.every((pile) => pile.every((card) => card[1] === card[1].toUpperCase())));
    assert.equal(homeCount(dealt), 0);
  });

  it('packs the columns as a map and reads them back', () => {
    const dealt = createFreecellState(orderedDeck());
    const stored = unpackFreecell(packFreecell(dealt));
    assert.ok(stored);
    assert.deepEqual(stored.cascades, dealt.cascades);
    assert.equal(ensureFreecellState({ ...createGame({ name: 'FreeCell', templateId: 'klondike', players: [createPlayer('Ada')] }), freecell: dealt }).freecell, dealt);
  });

  it('replaces a broken deal', () => {
    const game = createGame({ name: 'FreeCell', templateId: 'freecell', players: [createPlayer('Ada')] });
    const repaired = ensureFreecellState({ ...game, freecell: layoutFreecell({ cascades: [['zz']] }) });
    assert.equal(size(repaired.freecell!), 52);
  });
});

describe('freecell moves', () => {
  const filled = [up(3, 'C'), up(3, 'S'), up(3, 'H'), up(3, 'D'), up(4, 'C'), up(4, 'S')];

  it('builds an ace and refuses a card that does not follow the suit', () => {
    const state = layoutFreecell({
      cells: [up(1, 'H'), null, null, null],
      cascades: [[up(2, 'S')], ...filled.map((card) => [card])],
    });
    const built = play(state, { pile: 'cell', index: 0 }, { pile: 'foundation', index: 0 });
    assert.ok(built);
    assert.deepEqual(built.foundations[0], [up(1, 'H')]);
    assert.equal(play(built, { pile: 'cascade', index: 0, at: 0 }, { pile: 'foundation', index: 0 }), null);
    const undone = undo(built);
    assert.equal(undone?.cells[0], up(1, 'H'));
    assert.equal(homeCount(undone!), 0);
  });

  it('builds down in alternating colors and lets any card fill an empty column', () => {
    const state = layoutFreecell({
      cascades: [
        [up(8, 'S'), up(7, 'H')],
        [up(8, 'C')],
        [up(8, 'H')],
        ...filled.slice(0, 4).map((card) => [card]),
        [],
      ],
    });
    const built = play(state, { pile: 'cascade', index: 0, at: 1 }, { pile: 'cascade', index: 1 });
    assert.deepEqual(built?.cascades[1], [up(8, 'C'), up(7, 'H')]);
    assert.equal(play(state, { pile: 'cascade', index: 0, at: 1 }, { pile: 'cascade', index: 2 }), null);
    const parked = play(state, { pile: 'cascade', index: 0, at: 1 }, { pile: 'cell', index: 0 });
    assert.equal(parked?.cells[0], up(7, 'H'));
    const filledColumn = play(state, { pile: 'cascade', index: 3, at: 0 }, { pile: 'cascade', index: 7 });
    assert.deepEqual(filledColumn?.cascades[7], [up(3, 'C')]);
  });

  it('moves a run only when a free cell or an empty column can carry it', () => {
    const blocked = layoutFreecell({
      cells: [up(9, 'C'), up(9, 'S'), up(9, 'H'), up(9, 'D')],
      cascades: [
        [up(13, 'D'), up(12, 'S'), up(11, 'H')],
        [up(13, 'H')],
        [up(4, 'C')],
        [up(4, 'S')],
        [up(4, 'H')],
        [up(4, 'D')],
        [up(5, 'C')],
        [up(5, 'S')],
      ],
    });
    const run: { pile: 'cascade'; index: number; at: number } = { pile: 'cascade', index: 0, at: 1 };
    assert.equal(play(blocked, run, { pile: 'cascade', index: 1 }), null);
    const open = layoutFreecell({ ...blocked, cells: [null, up(9, 'S'), up(9, 'H'), up(9, 'D')] });
    const moved = play(open, run, { pile: 'cascade', index: 1 });
    assert.deepEqual(moved?.cascades[1], [up(13, 'H'), up(12, 'S'), up(11, 'H')]);
  });

  it('does not count the destination when a run moves into an empty column', () => {
    const state = layoutFreecell({
      cells: [up(9, 'C'), up(9, 'S'), up(9, 'H'), up(9, 'D')],
      cascades: [
        [up(13, 'D'), up(12, 'S')],
        [],
        [up(4, 'C')],
        [up(4, 'S')],
        [up(4, 'H')],
        [up(4, 'D')],
        [up(5, 'C')],
        [up(5, 'S')],
      ],
    });
    const run: { pile: 'cascade'; index: number; at: number } = { pile: 'cascade', index: 0, at: 0 };
    assert.equal(play(state, run, { pile: 'cascade', index: 1 }), null);
    const single = play(state, { pile: 'cascade', index: 0, at: 1 }, { pile: 'cascade', index: 1 });
    assert.deepEqual(single?.cascades[1], [up(12, 'S')]);
  });

  it('sends home an ace or a two, and holds a three until both opposite twos are up', () => {
    const state = layoutFreecell({
      cells: [up(1, 'H'), up(2, 'D'), null, null],
      foundations: [[up(1, 'D')]],
      cascades: [[up(3, 'H')], ...Array.from({ length: 7 }, () => [up(8, 'C')])],
    });
    const sent = finish(state);
    assert.ok(sent);
    assert.equal(homeCount(sent), 3);
    assert.equal(sent.cascades[0][0], up(3, 'H'));
    assert.equal(undo(sent)?.cells[0], up(1, 'H'));
    const ready = layoutFreecell({
      foundations: [
        [up(1, 'S'), up(2, 'S')],
        [up(1, 'C'), up(2, 'C')],
        [up(1, 'H'), up(2, 'H')],
        [up(1, 'D'), up(2, 'D')],
      ],
      cascades: [[up(3, 'D')], ...Array.from({ length: 7 }, () => [up(8, 'C')])],
    });
    const three = finish(ready);
    assert.equal(three && homeCount(three), 9);
  });

  it('builds the selected card on a second tap', () => {
    const state = layoutFreecell({ cells: [up(1, 'S'), null, null, null] });
    const built = buildFoundation(state, { pile: 'cell', index: 0 });
    assert.deepEqual(built?.foundations[0], [up(1, 'S')]);
  });

  it('names a win when every card is home', () => {
    const won = layoutFreecell({
      foundations: SUITS.map((suit) => Array.from({ length: 13 }, (_, rank) => up(rank + 1, suit))),
    });
    assert.equal(won.won, true);
    assert.equal(hasMove(won), false);
    const template = getTemplate('freecell');
    assert.ok(template);
    const player = createPlayer('Ada');
    const snap = calculate(
      { ...createGame({ name: 'FreeCell', templateId: 'freecell', players: [player] }), freecell: won, status: 'Completed' },
      template,
    );
    assert.equal(snap.isComplete, true);
    assert.equal(snap.winnerName, 'Ada');
    assert.equal(snap.standings[0]?.total, 52);
  });

  it('finds the free cells on the top row and the cascades below', () => {
    assert.deepEqual(dropTarget(2, 4, 40, 56, 4, 14), { pile: 'cell', index: 0 });
    assert.deepEqual(dropTarget(44 * 4 + 2, 4, 40, 56, 4, 14), { pile: 'foundation', index: 0 });
    assert.deepEqual(dropTarget(44 * 7 + 2, 80, 40, 56, 4, 14), { pile: 'cascade', index: 7 });
    assert.equal(dropTarget(42, 4, 40, 56, 4, 14), null);
  });
});
