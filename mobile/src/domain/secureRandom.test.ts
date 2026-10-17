import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomId } from './secureRandom';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('randomId', () => {
  it('returns a UUID v4 from crypto.randomUUID when it exists', () => {
    assert.match(randomId(), UUID_V4);
  });

  it('builds a UUID v4 when crypto.randomUUID is missing', () => {
    const saved = globalThis.crypto;
    const stub = {
      getRandomValues(buffer: Uint8Array) {
        for (let i = 0; i < buffer.length; i++) buffer[i] = i + 1;
        return buffer;
      },
    };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: stub });
    try {
      assert.equal(randomId(), '01020304-0506-4708-890a-0b0c0d0e0f10');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: saved });
    }
  });
});
