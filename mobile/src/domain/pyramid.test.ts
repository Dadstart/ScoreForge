import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import { createGame, createPlayer } from './models';
import {
  cardCode,
  cardFace,
  clearedCount,
  createPyramidState,
  drawStock,
  ensurePyramidState,
  hasMove,
  hint,
  isFree,
  layoutPyramid,
  packPyramid,
  play,
  undo,
  unpackPyramid,
  type PyramidState,
  type Suit,
} from './pyramid';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function orderedDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, false));
  }
  return cards;
}

function blankRows(): (string | null)[][] {
  return Array.from({ length: 7 }, (_, row) => Array.from({ length: row + 1 }, () => null));
}

function remaining(state: PyramidState): number {
  const pyramid = state.rows.reduce((sum, row) => sum + row.filter((card) => card != null).length, 0);
  return pyramid + state.stock.length + state.waste.length;
}

describe('pyramid deal', () => {
  it('deals 28 face-up cards and a 24-card stock', () => {
    const deck = orderedDeck();
    const state = createPyramidState(deck);
    assert.equal(state.rows.length, 7);
    assert.equal(state.rows[0]?.[0], 'AS');
    assert.equal(state.rows[6]?.length, 7);
    assert.equal(state.rows[6]?.[4], 'KH');
    assert.equal(state.stock.length, 24);
    assert.equal(state.waste.length, 0);
    assert.equal(remaining(state), 52);
    assert.equal(clearedCount(state), 0);
    assert.equal(isFree(state, { pile: 'pyramid', row: 0, index: 0 }), false);
    assert.equal(isFree(state, { pile: 'pyramid', row: 6, index: 4 }), true);
    assert.equal(cardFace(state.stock[23])?.up, false);
  });

  it('keeps a legal deal and replaces a broken one', () => {
    const game = {
      ...createGame({ name: 'Pyramid', templateId: 'pyramid', players: [createPlayer('Ada')] }),
      pyramid: createPyramidState(orderedDeck()),
    };
    assert.equal(ensurePyramidState(game), game);
    const broken = ensurePyramidState({
      ...game,
      pyramid: layoutPyramid({ stock: ['zz'] }),
    });
    assert.equal(broken.pyramid?.won, false);
    assert.equal(remaining(broken.pyramid!), 52);
    assert.notEqual(broken.pyramid, game.pyramid);
    assert.equal(ensurePyramidState({ ...game, templateId: 'klondike' }).pyramid, game.pyramid);
  });

  it('packs rows as a map and reads them back', () => {
    const state = createPyramidState(orderedDeck());
    const stored = packPyramid(state);
    assert.ok(!Array.isArray(stored.rows));
    assert.deepEqual(unpackPyramid(stored)?.rows[0], ['AS']);
    assert.equal(unpackPyramid(stored)?.stock.length, 24);
  });
});

describe('pyramid moves', () => {
  it('removes a free king, then puts it back', () => {
    const state = createPyramidState(orderedDeck());
    const king = { pile: 'pyramid' as const, row: 6, index: 4 };
    const removed = play(state, king);
    assert.ok(removed);
    assert.equal(removed.rows[6]?.[4], null);
    assert.equal(removed.removed.at(-1), 'KH');
    assert.equal(remaining(removed) + removed.removed.length, 52);
    assert.equal(removed.moves, 1);
    assert.equal(clearedCount(removed), 1);
    const kept = ensurePyramidState({
      ...createGame({ name: 'Pyramid', templateId: 'pyramid', players: [createPlayer('Ada')] }),
      pyramid: removed,
    });
    assert.equal(kept.pyramid, removed);
    assert.equal(play(state, { pile: 'pyramid', row: 5, index: 0 }), null);

    const back = undo(removed);
    assert.equal(back?.rows[6]?.[4], 'KH');
    assert.equal(back?.moves, 0);
    assert.equal(back?.undo.length, 0);
  });

  it('frees the card above once both covers are paired', () => {
    const rows = blankRows();
    rows[5][0] = cardCode(6, 'S', true);
    rows[6][0] = cardCode(7, 'H', true);
    rows[6][1] = cardCode(6, 'H', true);
    const state = layoutPyramid({
      rows,
      waste: [cardCode(7, 'D', true)],
    });
    const covered = { pile: 'pyramid' as const, row: 5, index: 0 };
    assert.equal(isFree(state, covered), false);
    assert.equal(play(state, covered, { pile: 'waste' }), null);

    const opened = play(
      state,
      { pile: 'pyramid', row: 6, index: 0 },
      { pile: 'pyramid', row: 6, index: 1 },
    );
    assert.ok(opened);
    assert.equal(isFree(opened, covered), true);
    const paired = play(opened, covered, { pile: 'waste' });
    assert.ok(paired);
    assert.equal(paired.rows[5]?.[0], null);
    assert.equal(paired.waste.length, 0);
    assert.equal(paired.won, true);
    assert.match(opened.lastAction, /7 of hearts/);
  });

  it('draws one card, then turns a spent stock so the old bottom shows', () => {
    const deck = orderedDeck();
    const dealt = createPyramidState(deck);
    const drawn = drawStock(dealt);
    assert.ok(drawn);
    assert.equal(drawn.stock.length, 23);
    assert.equal(drawn.waste[0], cardCode(cardFace(deck[28])!.rank, cardFace(deck[28])!.suit, true));

    const rows = blankRows();
    rows[6][0] = cardCode(9, 'C', true);
    const turned = drawStock(
      layoutPyramid({
        rows,
        waste: [cardCode(1, 'S', true), cardCode(2, 'S', true), cardCode(3, 'S', true)],
      }),
    );
    assert.equal(cardFace(turned?.waste[0] ?? '')?.rank, 1);
    assert.equal(turned?.stock.length, 2);
    const next = drawStock(turned!);
    assert.equal(cardFace(next?.waste.at(-1) ?? '')?.rank, 2);
  });

  it('wins when the pyramid is empty, even with stock left', () => {
    const rows = blankRows();
    rows[6][0] = cardCode(13, 'C', true);
    const state = layoutPyramid({ rows, stock: [cardCode(2, 'D', false)] });
    const won = play(state, { pile: 'pyramid', row: 6, index: 0 });
    assert.ok(won);
    assert.equal(won.won, true);
    assert.equal(won.stock.length, 1);
    assert.equal(clearedCount(won), 28);
    assert.equal(drawStock(won), null);
    assert.equal(hasMove(won), false);
    assert.equal(won.lastAction, 'The pyramid is clear');

    const player = createPlayer('Ada');
    const template = getTemplate('pyramid');
    assert.ok(template);
    const snapshot = calculate(
      {
        ...createGame({ name: 'Pyramid', templateId: 'pyramid', players: [player] }),
        pyramid: won,
      },
      template,
    );
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
    assert.equal(snapshot.standings[0]?.total, 28);
  });

  it('stops when nothing adds to 13', () => {
    const rows = blankRows();
    rows[6][0] = cardCode(5, 'H', true);
    const stuck = layoutPyramid({ rows, waste: [cardCode(5, 'S', true)] });
    assert.equal(hasMove(stuck), false);
    assert.equal(hint(stuck), 'No moves left');
    assert.equal(
      play(stuck, { pile: 'pyramid', row: 6, index: 0 }, { pile: 'waste' }),
      null,
    );
  });

  it('names a king before a pair or a draw', () => {
    const state = createPyramidState(orderedDeck());
    assert.match(hint(state) ?? '', /king of hearts/);
    const rows = blankRows();
    rows[6][0] = cardCode(6, 'S', true);
    rows[6][1] = cardCode(7, 'H', true);
    assert.match(hint(layoutPyramid({ rows })) ?? '', /6 of spades/);
  });
});
