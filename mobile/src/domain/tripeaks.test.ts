import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardCode } from './klondike';
import { calculate } from './scoreCalculator';
import { createGame, createPlayer } from './models';
import { getTemplate } from './templates';
import {
  PEAK_BONUS,
  clearedCount,
  createTriPeaksState,
  drawStock,
  ensureTriPeaksState,
  hasMove,
  hint,
  isFree,
  layoutTriPeaks,
  packTriPeaks,
  play,
  playableSpots,
  undo,
  unpackTriPeaks,
  wasteCard,
  type Suit,
  type TriPeaksState,
} from './tripeaks';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function orderedDeck(): string[] {
  const cards: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push(cardCode(rank, suit, false));
  }
  return cards;
}

function blanks(): (string | null)[][] {
  return [Array(3).fill(null), Array(6).fill(null), Array(9).fill(null), Array(10).fill(null)];
}

function size(state: TriPeaksState): number {
  const tableau = state.rows.reduce((sum, row) => sum + row.filter((card) => card != null).length, 0);
  return tableau + state.stock.length + state.waste.length;
}

describe('tripeaks deal', () => {
  it('deals three peaks, a face-up row, and one waste card', () => {
    const state = createTriPeaksState(orderedDeck());
    assert.equal(state.rows[3]?.join(''), 'AS2S3S4S5S6S7S8S9STS');
    assert.equal(state.rows[0]?.[0], 'Kh');
    assert.equal(state.rows[2]?.[0], 'Js');
    assert.equal(isFree(state, { row: 3, index: 0 }), true);
    assert.equal(isFree(state, { row: 2, index: 0 }), false);
    assert.equal(isFree(state, { row: 0, index: 0 }), false);
    assert.equal(wasteCard(state)?.code, '3D');
    assert.equal(state.stock.length, 23);
    assert.equal(state.stock[22], '4d');
    assert.equal(size(state), 52);
    assert.equal(clearedCount(state), 0);
    assert.equal(state.score, 0);
    assert.deepEqual(
      playableSpots(state).map((spot) => state.rows[spot.row]?.[spot.index]),
      ['2S', '4S'],
    );
  });

  it('keeps a legal deal and replaces a broken one', () => {
    const game = {
      ...createGame({ name: 'TriPeaks', templateId: 'tripeaks', players: [createPlayer('Ada')] }),
      tripeaks: createTriPeaksState(orderedDeck()),
    };
    assert.equal(ensureTriPeaksState(game), game);
    const broken = ensureTriPeaksState({
      ...game,
      tripeaks: layoutTriPeaks({ stock: ['zz'] }),
    });
    assert.equal(broken.tripeaks?.won, false);
    assert.equal(size(broken.tripeaks!), 52);
    assert.notEqual(broken.tripeaks, game.tripeaks);
    assert.equal(ensureTriPeaksState({ ...game, templateId: 'klondike' }).tripeaks, game.tripeaks);
  });

  it('packs rows as a map and reads them back', () => {
    const state = createTriPeaksState(orderedDeck());
    const stored = packTriPeaks(state);
    assert.ok(!Array.isArray(stored.rows));
    assert.equal(unpackTriPeaks(stored)?.rows[3]?.[0], 'AS');
    assert.equal(unpackTriPeaks(stored)?.waste[0], '3D');
    assert.equal(unpackTriPeaks({ ...stored, stock: ['zz'] }), null);
  });
});

describe('tripeaks moves', () => {
  it('plays one rank away, uncovers, and scores the streak', () => {
    const dealt = createTriPeaksState(orderedDeck());
    const first = play(dealt, { row: 3, index: 1 });
    assert.ok(first);
    assert.equal(first.rows[3]?.[1], null);
    assert.equal(wasteCard(first)?.code, '2S');
    assert.equal(first.streak, 1);
    assert.equal(first.score, 1);
    assert.equal(first.rows[2]?.[0], 'Js');
    const second = play(first, { row: 3, index: 0 });
    assert.ok(second);
    assert.equal(second.rows[2]?.[0], 'JS');
    assert.equal(second.streak, 2);
    assert.equal(second.score, 3);
    assert.equal(isFree(second, { row: 2, index: 0 }), true);
    const drawn = drawStock(second);
    assert.ok(drawn);
    assert.equal(drawn.streak, 0);
    assert.equal(drawn.score, 3);
    assert.equal(wasteCard(drawn)?.code, '4D');
    assert.equal(hint(drawn), 'Play the 3 of spades');
  });

  it('refuses a covered card, the same rank, and a king on an ace', () => {
    const dealt = createTriPeaksState(orderedDeck());
    assert.equal(play(dealt, { row: 2, index: 0 }), null);
    assert.equal(play(dealt, { row: 3, index: 2 }), null);
    const rows = blanks();
    rows[3][0] = cardCode(13, 'S', true);
    const blocked = layoutTriPeaks({ rows, waste: [cardCode(1, 'H', true)] });
    assert.equal(play(blocked, { row: 3, index: 0 }), null);
    assert.match(hint(blocked) ?? '', /No moves left/);
    assert.equal(hasMove(blocked), false);
  });

  it('adds 15 for a peak and wins when the tableau is empty', () => {
    const rows = blanks();
    rows[0][1] = cardCode(12, 'D', false);
    const ready = layoutTriPeaks({
      rows,
      waste: [cardCode(11, 'C', true)],
      stock: [cardCode(1, 'S', false)],
    });
    assert.equal(ready.rows[0]?.[1], 'QD');
    const won = play(ready, { row: 0, index: 1 });
    assert.ok(won);
    assert.equal(won.won, true);
    assert.equal(won.score, 1 + PEAK_BONUS);
    assert.equal(won.lastAction, 'The peaks are clear');
    assert.equal(hasMove(won), false);
    assert.equal(drawStock(won), null);
    const back = undo(won);
    assert.equal(back?.won, false);
    assert.equal(back?.score, 0);
    assert.equal(back?.rows[0]?.[1], 'QD');
  });

  it('scores a win for the player who clears the peaks', () => {
    const player = createPlayer('Ada');
    const rows = blanks();
    rows[3][4] = cardCode(8, 'C', true);
    const state = layoutTriPeaks({ rows, waste: [cardCode(7, 'H', true)] });
    const won = play(state, { row: 3, index: 4 });
    assert.ok(won?.won);
    const template = getTemplate('tripeaks');
    assert.ok(template);
    const snapshot = calculate(
      {
        ...createGame({ name: 'TriPeaks', templateId: 'tripeaks', players: [player] }),
        tripeaks: won,
        status: 'Completed',
      },
      template,
    );
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
    assert.equal(snapshot.standings[0]?.total, 1);
  });
});
