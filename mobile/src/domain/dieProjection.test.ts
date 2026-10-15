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
    assert.equal(mesh.faces.find((face) => face.value === 5)?.pips.length, 5);
    assert.equal(mesh.faces.find((face) => face.value === 3)?.pips.length, 3);
  });
});
