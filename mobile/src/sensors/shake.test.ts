import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accelInGs, freshShakeWatch, noteAcceleration, type Accel } from './shake';

const rest: Accel = { x: 0, y: 0, z: 1 };
const G = 9.80665;

function feed(samples: { a: Accel; t: number }[], unit: 'g' | 'mps2' | null = 'g') {
  let watch = freshShakeWatch();
  let locked = unit;
  const shakes: number[] = [];
  for (const sample of samples) {
    const normalized = accelInGs(sample.a, locked);
    if (!normalized) continue;
    locked = normalized.unit;
    const next = noteAcceleration(watch, normalized.accel, sample.t);
    watch = next.watch;
    if (next.shook) shakes.push(sample.t);
  }
  return shakes;
}

function hold(from: number, to: number, sample: Accel) {
  const frames: { a: Accel; t: number }[] = [];
  for (let t = from; t <= to; t += 50) frames.push({ a: sample, t });
  return frames;
}

describe('shake', () => {
  it('rolls on two jolts and ignores a slow tilt', () => {
    const shake = [
      ...hold(0, 200, rest),
      { a: { x: 4, y: 0, z: 1 }, t: 250 },
      { a: rest, t: 320 },
      { a: { x: -4, y: 0, z: 1 }, t: 380 },
    ];
    assert.deepEqual(feed(shake), [380]);

    const tilt: { a: Accel; t: number }[] = [];
    for (let step = 0; step <= 20; step += 1) {
      const blend = step / 20;
      tilt.push({
        a: { x: blend, y: 0, z: 1 - blend },
        t: step * 80,
      });
    }
    assert.deepEqual(feed(tilt), []);
  });

  it('needs a second jolt inside the burst window', () => {
    const one = [...hold(0, 200, rest), { a: { x: 4, y: 0, z: 1 }, t: 250 }, ...hold(300, 500, rest)];
    assert.deepEqual(feed(one), []);

    const late = [
      ...hold(0, 200, rest),
      { a: { x: 4, y: 0, z: 1 }, t: 250 },
      { a: rest, t: 320 },
      { a: { x: -4, y: 0, z: 1 }, t: 900 },
    ];
    assert.deepEqual(feed(late), []);
  });

  it('treats one gesture as one shake, then accepts another', () => {
    const first = [
      ...hold(0, 200, rest),
      { a: { x: 4, y: 0, z: 1 }, t: 250 },
      { a: rest, t: 320 },
      { a: { x: -4, y: 0, z: 1 }, t: 380 },
      { a: rest, t: 450 },
      { a: { x: 4, y: 0, z: 1 }, t: 520 },
      { a: rest, t: 600 },
      { a: { x: -4, y: 0, z: 1 }, t: 680 },
    ];
    assert.deepEqual(feed(first), [380]);

    const again = [
      ...first,
      ...hold(1300, 1500, rest),
      { a: { x: 4, y: 0, z: 1 }, t: 1560 },
      { a: rest, t: 1640 },
      { a: { x: -4, y: 0, z: 1 }, t: 1720 },
    ];
    assert.deepEqual(feed(again), [380, 1720]);
  });

  it('reads a shake reported in meters per second squared', () => {
    const scale = (sample: Accel): Accel => ({
      x: sample.x * G,
      y: sample.y * G,
      z: sample.z * G,
    });
    const shake = [
      ...hold(0, 200, scale(rest)),
      { a: scale({ x: 4, y: 0, z: 1 }), t: 250 },
      { a: scale(rest), t: 320 },
      { a: scale({ x: -4, y: 0, z: 1 }), t: 380 },
    ];
    assert.deepEqual(feed(shake, null), [380]);
  });
});
