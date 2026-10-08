import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cellBox,
  centerTitleBounds,
  DECK_TILT,
  deckPileLayout,
  deckVisualBox,
  diceHopPoints,
  diceRollCurves,
  jailCell,
  layoutJailedTokens,
  layoutSharedTokens,
  layoutVisitingTokens,
  monopolyDieSize,
  ownerMarkPlacement,
  spaceToCell,
  TRACK_DEPTH,
} from './monopolyBoard';

function boxesClear(a: { x: number; y: number; piece: number }, b: { x: number; y: number; piece: number }) {
  return (
    a.x + a.piece + 0.9 <= b.x ||
    b.x + b.piece + 0.9 <= a.x ||
    a.y + a.piece + 0.9 <= b.y ||
    b.y + b.piece + 0.9 <= a.y
  );
}

function staysOffColorBar(
  spot: { x: number; y: number; piece: number },
  row: number,
  col: number,
  width: number,
  height: number,
) {
  const corner = (row === 0 || row === 10) && (col === 0 || col === 10);
  if (corner) return true;
  if (row === 10) return spot.y + spot.piece <= height * 0.65;
  if (row === 0) return spot.y >= height * 0.35;
  if (col === 0) return spot.x >= width * 0.35;
  return spot.x + spot.piece <= width * 0.65;
}

describe('layoutSharedTokens', () => {
  for (const board of [320, 720, 1100]) {
    for (const count of [1, 2, 3, 4, 5, 8]) {
      it(`packs ${count} tokens on a ${board}px board`, () => {
        for (let index = 0; index < 40; index += 1) {
          const { row, col } = spaceToCell(index);
          const cell = cellBox(row, col);
          const width = cell.w * board;
          const height = cell.h * board;
          const spots = layoutSharedTokens(width, height, row, col, count);
          assert.equal(spots.length, count);
          for (const spot of spots) {
            assert.ok(spot.piece > 0, `space ${index} piece`);
            assert.ok(spot.x >= -0.01, `space ${index} left`);
            assert.ok(spot.y >= -0.01, `space ${index} top`);
            assert.ok(spot.x + spot.piece <= width + 0.01, `space ${index} right`);
            assert.ok(spot.y + spot.piece <= height + 0.01, `space ${index} bottom`);
            assert.ok(staysOffColorBar(spot, row, col, width, height), `space ${index} covers the color bar`);
          }
          for (let i = 0; i < spots.length; i += 1) {
            for (let j = i + 1; j < spots.length; j += 1) {
              assert.ok(boxesClear(spots[i], spots[j]), `space ${index}: token ${i} overlaps ${j}`);
            }
          }
        }
      });
    }
  }
});

function overlaps(a: { x: number; y: number; piece: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.piece > b.x && a.y < b.y + b.height && a.y + a.piece > b.y;
}

describe('jail tokens', () => {
  for (const board of [320, 720, 1100]) {
    const cell = board * 0.16;

    it(`keeps jailed tokens inside the bars on a ${board}px board`, () => {
      const box = jailCell(cell);
      for (const count of [1, 2, 4]) {
        const spots = layoutJailedTokens(cell, count);
        assert.equal(spots.length, count);
        for (const spot of spots) {
          assert.ok(spot.x >= box.x - 0.01, 'left of the jail');
          assert.ok(spot.y >= box.y - 0.01, 'above the jail');
          assert.ok(spot.x + spot.piece <= box.x + box.width + 0.01, 'right of the jail');
          assert.ok(spot.y + spot.piece <= box.y + box.height + 0.01, 'below the jail');
          assert.ok(spot.y + spot.piece / 2 >= box.y + box.height * 0.36, 'covers the In Jail label');
        }
        for (let i = 0; i < spots.length; i += 1) {
          for (let j = i + 1; j < spots.length; j += 1) {
            assert.ok(boxesClear(spots[i], spots[j]), `jailed ${i} overlaps ${j}`);
          }
        }
      }
    });

    it(`keeps visitors out of the jail on a ${board}px board`, () => {
      const box = jailCell(cell);
      for (const count of [1, 2, 4]) {
        const spots = layoutVisitingTokens(cell, count);
        for (const spot of spots) {
          assert.ok(spot.x >= -0.01);
          assert.ok(spot.y >= -0.01);
          assert.ok(spot.x + spot.piece <= cell + 0.01);
          assert.ok(spot.y + spot.piece <= cell + 0.01);
          assert.equal(overlaps(spot, box), false);
        }
      }
    });
  }
});

function boxesMiss(a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }, gap: number) {
  return a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top;
}

describe('deckPileLayout', () => {
  for (const board of [280, 360, 480, 720, 851, 1100, 1277, 1702, 2200]) {
    it(`keeps both decks off the title on a ${board}px board`, () => {
      const piles = deckPileLayout(board);
      const title = centerTitleBounds(board);
      assert.ok(piles.width > (board < 400 ? 12 : 36), `deck width ${piles.width}`);
      for (const pile of [
        { left: piles.chestLeft, top: piles.chestTop, tilt: -DECK_TILT },
        { left: piles.chanceLeft, top: piles.chanceTop, tilt: DECK_TILT },
      ]) {
        const box = deckVisualBox(pile.left, pile.top, piles.width, piles.height, pile.tilt);
        assert.ok(box.left >= -0.5, 'left of the green');
        assert.ok(box.top >= -0.5, 'above the green');
        assert.ok(box.right <= title.felt + 0.5, 'right of the green');
        assert.ok(box.bottom <= title.felt + 0.5, 'below the green');
        assert.ok(boxesMiss(box, title, 4), `covers MONOPOLY (${JSON.stringify(box)})`);
      }
    });
  }
});

describe('ownerMarkPlacement', () => {
  const board = 720;

  function place(index: number) {
    const { row, col } = spaceToCell(index);
    const cell = cellBox(row, col);
    return { row, col, ...ownerMarkPlacement(row, col, cell.w * board, cell.h * board), width: cell.w * board, height: cell.h * board };
  }

  it('sits above the card with feet pointing out along that side', () => {
    const bottom = place(1);
    const top = place(21);
    const left = place(11);
    const right = place(39);
    assert.equal(bottom.rotate, '0deg');
    assert.equal(top.rotate, '180deg');
    assert.equal(left.rotate, '-90deg');
    assert.equal(right.rotate, '90deg');
    assert.equal(bottom.flipX, false);
    assert.equal(top.flipX, false);
    assert.equal(left.flipX, true);
    assert.equal(right.flipX, true);
    assert.ok(bottom.y + bottom.size < 0);
    assert.ok(top.y > top.height);
    assert.ok(left.x > left.width);
    assert.ok(right.x + right.size < 0);
    for (const spot of [bottom, top, left, right]) {
      const along = spot.row === 0 || spot.row === 10 ? spot.width : spot.height;
      assert.ok(Math.abs(spot.size / along - 0.62) < 0.05);
    }
  });
});

function rollSample(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('dice landing', () => {
  for (const board of [480, 720, 1100]) {
    it(`stays on the green and varies the landing on a ${board}px board`, () => {
      const die = monopolyDieSize(board);
      const edge = TRACK_DEPTH * board;
      const sample = rollSample(board);
      const spots = new Set<string>();
      for (let roll = 0; roll < 24; roll += 1) {
        const curves = diceRollCurves(board, die, sample);
        const landings = curves.map((curve) => curve[3]);
        spots.add(`${Math.round(landings[0].x)}:${Math.round(landings[0].y)}`);
        assert.ok(Math.hypot(landings[0].x - landings[1].x, landings[0].y - landings[1].y) >= die * 0.9);
        for (const curve of curves) {
          for (const point of diceHopPoints(curve, board)) {
            assert.ok(point.x - die / 2 >= edge - 0.75);
            assert.ok(point.x + die / 2 <= board - edge + 0.75);
            assert.ok(point.y - die / 2 >= edge - 0.75);
            assert.ok(point.y + die / 2 <= board - edge + 0.75);
          }
        }
      }
      assert.ok(spots.size > 8);
    });
  }
});
