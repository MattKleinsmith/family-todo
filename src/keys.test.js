import { describe, it, expect } from 'vitest';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { cachedKeys, deriveKeys, forgetKeys } from './keys.js';

function memoryStorage() {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

describe('deriveKeys', () => {
  it('gives the same keys as before (native PBKDF2 matches the JS one), and keeps them', async () => {
    const storage = memoryStorage();
    const keys = await deriveKeys('Test-Code-1234', storage);
    const expected = await pbkdf2Async(sha256, keys.code, 'family-todo:v1', { c: 120_000, dkLen: 32 });
    expect(Buffer.from(keys.sk).equals(Buffer.from(expected))).toBe(true);
    // Next time it comes straight from the phone, identical.
    const again = cachedKeys('Test-Code-1234', storage);
    expect(again.pk).toBe(keys.pk);
    expect(Buffer.from(again.sk).equals(Buffer.from(keys.sk))).toBe(true);
    expect(Buffer.from(again.convKey).equals(Buffer.from(keys.convKey))).toBe(true);
    expect((await deriveKeys('Test-Code-1234', storage)).pk).toBe(keys.pk);
    // Leaving forgets them; another code never reads them.
    expect(cachedKeys('Other-Code-9999', storage)).toBeNull();
    forgetKeys('Test-Code-1234', storage);
    expect(cachedKeys('Test-Code-1234', storage)).toBeNull();
  });
});
