import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { panForWheel, panForZoom } from './monopolyZoom';

const viewport = 100;
const track = 10 / 11;

function visible(pan: { x: number; y: number }, zoom: number) {
  const span = viewport * zoom;
  return {
    x0: -pan.x / span,
    x1: (-pan.x + viewport) / span,
    y0: -pan.y / span,
    y1: (-pan.y + viewport) / span,
  };
}

function seesTrack(pan: { x: number; y: number }, zoom: number) {
  const view = visible(pan, zoom);
  const x = view.x0 <= track && view.x1 >= 1;
  const y = view.y0 <= track && view.y1 >= 1;
  const top = view.y0 <= 0 && view.y1 >= 1 / 11;
  const left = view.x0 <= 0 && view.x1 >= 1 / 11;
  return x || y || top || left;
}

describe('monopoly zoom', () => {
  it('keeps the corner spaces on screen while zooming in from the phone view', () => {
    let zoom = 2;
    let pan = { x: -viewport, y: -viewport };
    for (const next of [2.5, 3, 3.5]) {
      pan = panForZoom(pan, zoom, next, viewport);
      zoom = next;
      const view = visible(pan, zoom);
      assert.ok(view.x1 > 0.99 && view.y1 > 0.99, `corner left the screen at ${zoom}`);
      assert.ok(view.x0 < track && view.y0 < track, `track left the screen at ${zoom}`);
    }
  });

  it('zooms back out to the same corner', () => {
    let zoom = 3.5;
    let pan = { x: viewport * (1 - zoom), y: viewport * (1 - zoom) };
    for (const next of [3, 2.5, 2, 1.5, 1]) {
      pan = panForZoom(pan, zoom, next, viewport);
      zoom = next;
    }
    assert.deepEqual(pan, { x: 0, y: 0 });
  });

  it('brings an edge back when the view is lost in the center', () => {
    const pan = panForZoom({ x: -90, y: -70 }, 2.5, 3, viewport);
    assert.ok(seesTrack(pan, 3));
  });

  it('holds a space that is already in the middle of the view', () => {
    const zoom = 6;
    const span = viewport * zoom;
    const fraction = { x: 0.91, y: 0.5 };
    const pan = { x: viewport / 2 - fraction.x * span, y: viewport / 2 - fraction.y * span };
    const next = panForZoom(pan, zoom, 6.5, viewport);
    const spanNext = viewport * 6.5;
    const mid = {
      x: (-next.x + viewport / 2) / spanNext,
      y: (-next.y + viewport / 2) / spanNext,
    };
    assert.ok(Math.abs(mid.x - fraction.x) < 0.001);
    assert.ok(Math.abs(mid.y - fraction.y) < 0.001);
  });

  it('pans the board with the mouse wheel and ignores ctrl-wheel', () => {
    const start = { x: -40, y: -40 };
    assert.deepEqual(panForWheel(start, { deltaX: 25, deltaY: 0, deltaMode: 0 }, 2, viewport), { x: -65, y: -40 });
    assert.deepEqual(panForWheel(start, { deltaX: 0, deltaY: 30, deltaMode: 0 }, 2, viewport), { x: -40, y: -70 });
    assert.deepEqual(panForWheel(start, { deltaX: -10, deltaY: 2, deltaMode: 0 }, 2, viewport), { x: -30, y: -42 });
    assert.deepEqual(panForWheel(start, { deltaX: 0, deltaY: 1, deltaMode: 1 }, 2, viewport), { x: -40, y: -80 });
    assert.equal(panForWheel(start, { deltaX: 0, deltaY: 30, deltaMode: 0, ctrlKey: true }, 2, viewport), null);
    assert.equal(panForWheel(start, { deltaX: 0, deltaY: 0, deltaMode: 0 }, 2, viewport), null);
  });
});
