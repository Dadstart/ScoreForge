type RandomBuffer = Uint8Array | Uint32Array;

type ExpoCrypto = typeof import('expo-crypto');

function loadExpoCrypto(): ExpoCrypto {
  // Loaded only when Web Crypto is missing, so Node tests never touch the native module.
  return require('expo-crypto') as ExpoCrypto;
}

/** Fill `buffer` from Web Crypto, or from the system CSPRNG on Hermes. */
export function fillRandom(buffer: RandomBuffer): void {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues(buffer as Uint8Array<ArrayBuffer>);
    return;
  }
  loadExpoCrypto().getRandomValues(buffer);
}

/** RFC 4122 UUID v4 from `getRandomValues`. Avoids `expo-crypto.randomUUID`, which only forwards to `crypto.randomUUID`. */
function uuidV4(): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomId(): string {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID();
  }
  return uuidV4();
}
