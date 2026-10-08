import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFireworkShow, FIREWORK_SPARK_CAP } from './fireworksShow';

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('fireworks show', () => {
  it('opens with a burst and keeps celebrating without overflowing', () => {
    const show = createFireworkShow(390, 844, mulberry32(7));
    let maxSparks = 0;
    let lateStreaks = 0;

    for (let frame = 0; frame < 10 * 60; frame++) {
      const scene = show.step(1 / 60);
      maxSparks = Math.max(maxSparks, show.sparkCount());
      assert.ok(show.sparkCount() <= FIREWORK_SPARK_CAP);
      for (const streak of scene.streaks) {
        assert.equal(streak.d.includes('NaN'), false);
        assert.ok(streak.opacity > 0 && streak.opacity <= 1);
        assert.ok(streak.width > 0);
        assert.ok(streak.d.length > 0);
      }
      for (const flash of scene.flashes) {
        assert.ok(Number.isFinite(flash.x) && Number.isFinite(flash.y));
        assert.ok(flash.ringOpacity >= 0 && flash.ringOpacity <= 1);
      }
      if (frame === 8 * 60) lateStreaks = scene.streaks.length;
      if (frame === 6) {
        assert.ok(scene.streaks.length > 3);
        assert.ok(show.sparkCount() > 40);
        assert.ok(new Set(scene.streaks.map((streak) => streak.color)).size >= 3);
      }
    }

    assert.ok(maxSparks > 80);
    assert.ok(lateStreaks > 0);
  });

  it('keeps drawing after the view resizes', () => {
    const show = createFireworkShow(390, 844, mulberry32(3));
    show.step(0.5);
    show.resize(844, 390);
    const scene = show.step(1 / 60);
    assert.ok(scene.streaks.length > 0);
    assert.ok(scene.stars.every((star) => star.x >= 0 && star.x <= 844 && star.y >= 0 && star.y <= 390));
  });
});
