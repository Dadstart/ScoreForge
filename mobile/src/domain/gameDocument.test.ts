import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { GAME_DOCUMENT_KEYS } from './gameDocument';

function quotedList(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, marker);
  const start = source.indexOf('[', at);
  const end = source.indexOf(']', start);
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '');
}

describe('game document keys', () => {
  it('matches the keys Firestore rules allow on a game', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const allowed = quotedList(rules, 'function isValidGame');
    assert.deepEqual([...allowed].sort(), [...GAME_DOCUMENT_KEYS].sort());
    assert.match(rules, /allow delete: if isSignedIn\(\) && isShareCode\(shareCode\) && hostMayDelete\(\)/);
  });
});
