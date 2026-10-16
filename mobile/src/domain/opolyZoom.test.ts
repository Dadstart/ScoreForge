import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardTurnForSpace } from './opolyBoard';
import { centeredZoomShift, frameToken, panForWheel, panForZoom, pieceScreen, readingZoom, spaceScreen, stepZoom, twistStep } from './opolyZoom';

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
    for (const next of [3]) {
      pan = panForZoom(pan, zoom, next, viewport);
      zoom = next;
      const view = visible(pan, zoom);
      assert.ok(view.x1 > 0.99 && view.y1 > 0.99, `corner left the screen at ${zoom}`);
      assert.ok(view.x0 < track && view.y0 < track, `track left the screen at ${zoom}`);
    }
  });

  it('zooms back out to the same corner', () => {
    let zoom = 3;
    let pan = { x: viewport * (1 - zoom), y: viewport * (1 - zoom) };
    for (const next of [2, 1]) {
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

  it('starts at page width and zooms out twice', () => {
    assert.equal(stepZoom(1, 1), 1);
    assert.equal(stepZoom(1, -1), 0.75);
    assert.equal(stepZoom(0.75, -1), 0.5);
    assert.equal(stepZoom(0.5, -1), 0.5);
    assert.equal(stepZoom(0.5, 1), 0.75);
    assert.equal(stepZoom(0.75, 1), 1);
  });

  it('opens a phone-width board close enough to read property names', () => {
    const phone = 390;
    const zoom = readingZoom(phone);
    assert.ok(zoom > 2);
    const board = phone * zoom;
    const corner = board * 0.16;
    const side = (board * (1 - 2 * 0.16)) / 9;
    assert.ok(corner >= 96);
    assert.ok(side >= 70);
    assert.equal(stepZoom(1, 1, phone), zoom);
    assert.equal(stepZoom(zoom, -1, phone), 1);
    assert.equal(stepZoom(zoom, 1, phone), zoom);
    assert.equal(readingZoom(1100), 1);
  });
});

describe('pinch preview', () => {
  it('scales a fixed board around its center without moving that center', () => {
    const viewport = 400;
    const layoutZoom = 1;
    const zoom = 2;
    const logical = { x: -200, y: -200 };
    const shift = centeredZoomShift(layoutZoom, zoom, viewport);
    assert.equal(shift, 200);
    const visual = { x: logical.x + shift, y: logical.y + shift };
    const layout = viewport * layoutZoom;
    const edge = {
      x: visual.x + (layout * (1 - zoom / layoutZoom)) / 2,
      y: visual.y + (layout * (1 - zoom / layoutZoom)) / 2,
    };
    assert.deepEqual(edge, logical);
    assert.equal(centeredZoomShift(layoutZoom, layoutZoom, viewport), 0);
  });
});

describe('two-finger twist', () => {
  it('turns clockwise and counter-clockwise, including across the wrap', () => {
    assert.equal(twistStep(0, 20), 20);
    assert.equal(twistStep(20, 0), -20);
    assert.equal(twistStep(170, -170), 20);
    assert.equal(twistStep(-170, 170), -20);
    assert.equal(twistStep(0, 0), 0);
    assert.equal(twistStep(10, 190), 180);
  });
});

describe('token camera', () => {
  const phone = 390;

  function inside(space: number, turn: number, pan: { x: number; y: number }, zoom: number) {
    const at = spaceScreen(space, turn, pan, zoom, phone);
    return at.x >= -1 && at.x <= phone + 1 && at.y >= -1 && at.y <= phone + 1;
  }

  it('turns a zoomed-out board toward the piece and does not slide it', () => {
    const framed = frameToken({ space: 15, turn: 0, pan: { x: 0, y: 0 }, zoom: 1, viewport: phone });
    assert.equal(framed.turn, boardTurnForSpace(15));
    assert.deepEqual(framed.pan, { x: 0, y: 0 });
    assert.ok(inside(15, framed.turn, framed.pan, 1));
  });

  it('leaves a piece that is already in view', () => {
    const zoom = 2;
    const framed = frameToken({ space: 5, turn: 0, pan: { x: 0, y: 0 }, zoom, viewport: phone });
    const again = frameToken({ space: 5, turn: framed.turn, pan: framed.pan, zoom, viewport: phone });
    assert.equal(again.turn, framed.turn);
    assert.deepEqual(again.pan, framed.pan);
    assert.ok(inside(5, again.turn, again.pan, zoom));
  });

  it('slides a zoomed board until an off-screen piece is in view', () => {
    const zoom = 2.4;
    const lost = frameToken({
      space: 0,
      turn: 0,
      pan: { x: 0, y: 0 },
      zoom,
      viewport: phone,
    });
    assert.ok(inside(0, lost.turn, lost.pan, zoom));
    const at = spaceScreen(0, lost.turn, lost.pan, zoom, phone);
    assert.ok(at.x > phone * 0.12 && at.x < phone * 0.88);
    assert.ok(at.y > phone * 0.08 && at.y < phone * 0.9);
  });

  it('keeps the piece on screen for every space of a lap', () => {
    const zoom = readingZoom(phone);
    let turn = 0;
    let pan = { x: 0, y: 0 };
    for (let space = 0; space < 40; space += 1) {
      const from = space;
      const to = (space + 1) % 40;
      const start = frameToken({ space: from, turn, pan, zoom, viewport: phone });
      turn = start.turn;
      pan = start.pan;
      const end = frameToken({ space: to, turn, pan, zoom, viewport: phone });
      const shot = {
        fromSpace: from,
        toSpace: to,
        startTurn: turn,
        endTurn: end.turn,
        startPan: pan,
        endPan: end.pan,
        zoom,
        viewport: phone,
      };
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const at = pieceScreen(shot, t);
        assert.ok(at.x >= -1.5 && at.x <= phone + 1.5, `space ${from}->${to} t=${t} x=${at.x}`);
        assert.ok(at.y >= -1.5 && at.y <= phone + 1.5, `space ${from}->${to} t=${t} y=${at.y}`);
      }
      turn = end.turn;
      pan = end.pan;
    }
  });
});
