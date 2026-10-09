import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactPropertyLabel, fitBoardLabel, textWidth } from './monopolyLabel';

function fits(name: string, shortName: string, width: number, height: number, start = 28) {
  const fitted = fitBoardLabel(name, shortName, { width, height }, start);
  for (const line of fitted.lines) {
    assert.ok(textWidth(line, fitted.fontSize) <= width, `${line} is wider than ${width} at ${fitted.fontSize}px`);
    assert.equal(line.includes('\n'), false);
  }
  return fitted;
}

describe('monopoly property labels', () => {
  it('keeps a name on one line when the line fits', () => {
    const tennessee = fits('Tennessee Avenue', 'Tenn', 168, 80);
    assert.deepEqual(tennessee.lines, ['Tennessee Ave.']);
    const park = fits('Park Place', 'Park Pl', 200, 40, 16);
    assert.deepEqual(park.lines, ['Park Place']);
    const kentucky = fits('Kentucky Avenue', 'Kent', 120, 140);
    assert.deepEqual(kentucky.lines, ['Kentucky Ave.']);
  });

  it('wraps on words when one line does not fit', () => {
    const fitted = fits('North Carolina Avenue', 'N. Car', 100, 80, 18);
    assert.deepEqual(fitted.lines, ['North Carolina', 'Ave.']);
  });

  it('turns a name sideways when a zoomed-out property is too narrow', () => {
    // A phone-width top property: about 25px across and 42px of name along the depth.
    const boardwalk = compactPropertyLabel('Boardwalk', 'Boardwalk', 25, 42);
    assert.ok(boardwalk);
    if (!boardwalk) return;
    assert.equal(boardwalk.text, 'Boardwalk');
    assert.equal(boardwalk.vertical, true);
    assert.ok(boardwalk.fontSize >= 7);
    assert.ok(textWidth(boardwalk.text, boardwalk.fontSize) <= 42);

    const penn = compactPropertyLabel('Pennsylvania Avenue', 'Penn Av', 25, 42);
    assert.ok(penn);
    if (!penn) return;
    assert.equal(penn.vertical, true);
    assert.ok(penn.fontSize >= 8);

    const side = compactPropertyLabel('Illinois Avenue', 'Illinois', 48, 26);
    assert.ok(side);
    if (!side) return;
    assert.equal(side.vertical, false);
    assert.ok(textWidth(side.text, side.fontSize) <= 48);
  });

  it('abbreviates instead of breaking a word', () => {
    const mediterranean = fits('Mediterranean Avenue', 'Med', 64, 100, 18);
    assert.equal(mediterranean.lines.length, 1);
    assert.ok(['Medit.', 'Med'].includes(mediterranean.lines[0]));
    const connecticut = fits('Connecticut Avenue', 'Conn', 52, 80, 16);
    assert.equal(connecticut.lines.length, 1);
    assert.equal(connecticut.lines[0], 'Conn.');
    const charles = fits('St. Charles Place', 'St. Ch', 72, 70, 20);
    assert.ok(charles.lines.every((line) => !line.endsWith('...')));
    assert.ok(charles.lines.join(' ').startsWith('St. Charles') || charles.lines[0] === 'St. Ch');
  });
});
