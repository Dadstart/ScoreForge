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

export function randomId(): string {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID();
  }
  return loadExpoCrypto().randomUUID();
}
