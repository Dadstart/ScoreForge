import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellBox, layoutSharedTokens, spaceToCell } from './monopolyBoard';

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
