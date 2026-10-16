import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectDie, projectTiltedPoint, type DiePose } from './dieProjection';

const resting: DiePose = {
  x: 0,
  y: 0,
  hop: 0,
  spinX: 0,
  spinY: 0,
  spinZ: 0,
  turn: 0,
  size: 40,
  face: 5,
};

describe('tilted board camera', () => {
  it('lifts a point toward the top of the screen', () => {
    const board = 800;
    const flat = projectTiltedPoint(0, 0, 0, board);
    const high = projectTiltedPoint(0, 0, 40, board);
    assert.ok(high.y < flat.y);
    assert.ok(projectTiltedPoint(80, 0, 0, board).x > 0);
    assert.ok(projectTiltedPoint(0, 80, 0, board).y > flat.y);
  });
});

describe('projected die', () => {
  it('shows the top and the near side of a resting die', () => {
    const mesh = projectDie(resting, 800);
    const values = new Set(mesh.faces.map((face) => face.value));
    assert.equal(values.has(5), true);
    assert.equal(values.has(3), true);
    assert.equal(values.has(1), false);
    assert.equal(values.has(2), false);
    assert.equal(mesh.faces.find((face) => face.value === 5)?.pips.length, 5);
    assert.equal(mesh.faces.find((face) => face.value === 3)?.pips.length, 3);
  });

  it('draws the opposite face when a roll turns it toward the camera', () => {
    const tumbling: DiePose = {
      ...resting,
      hop: 46,
      spinX: -90,
      spinY: 180,
      spinZ: -90,
    };
    const mesh = projectDie(tumbling, 800);
    const opposite = mesh.faces.find((face) => face.value === 2);
    assert.ok(opposite, 'the face opposite 5 is visible mid-roll');
    assert.equal(opposite?.pips.length, 2);
    const xs = opposite?.points.map((point) => point.x) ?? [];
    const ys = opposite?.points.map((point) => point.y) ?? [];
    const span = Math.max(...xs) - Math.min(...xs);
    const rise = Math.max(...ys) - Math.min(...ys);
    assert.ok(span > 8 && rise > 8, 'the opposite face has area, so it cannot read as an empty side');
  });
});
