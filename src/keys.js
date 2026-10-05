// Derive the family's keys from the shared code.
//  - secret key: PBKDF2(code) -> 32 bytes -> secp256k1 secret key used to sign relay events
//  - conversation key: NIP-44 key used to encrypt the content of every event
// Relays only ever see ciphertext plus the public key.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getPublicKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { normalizeCode } from './codes.js';

const SALT = 'family-todo:v1';
const ITERATIONS = 120_000;

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
const CACHE_PREFIX = 'ft:keys:v1:';

/** PBKDF2 through the browser's native crypto (several times faster), or in JS where it's missing. */
async function pbkdf2(code) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    try {
      const enc = new TextEncoder();
      const base = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS }, base, 256);
      return new Uint8Array(bits);
    } catch {
      /* fall through */
    }
  }
  return pbkdf2Async(sha256, code, SALT, { c: ITERATIONS, dkLen: 32 });
}

function fromKeyBytes(code, sk) {
  const pk = getPublicKey(sk);
  const convKey = nip44.utils.getConversationKey(sk, pk);
  return { code, sk, pk, convKey };
}

/**
 * The keys for a code, kept on this phone after the first time: deriving them
 * is deliberately slow (to make guessing codes expensive), and doing it on
 * every launch was most of the "Opening your family…" wait. The code itself is
 * already stored on the phone, so keeping what it derives to adds no exposure.
 */
export function cachedKeys(code, storage = globalThis.localStorage) {
  const normalized = normalizeCode(code);
  if (!normalized || !storage) return null;
  try {
    const raw = storage.getItem(CACHE_PREFIX + normalized);
    if (!raw) return null;
    const { sk, pk, convKey } = JSON.parse(raw);
    return { code: normalized, sk: fromHex(sk), pk, convKey: fromHex(convKey) };
  } catch {
    return null;
  }
}

export async function deriveKeys(code, storage = globalThis.localStorage) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new Error('Empty code');
  const cached = cachedKeys(normalized, storage);
  if (cached) return cached;
  const keys = fromKeyBytes(normalized, await pbkdf2(normalized));
  try {
    storage && storage.setItem(CACHE_PREFIX + normalized, JSON.stringify({ sk: toHex(keys.sk), pk: keys.pk, convKey: toHex(keys.convKey) }));
  } catch {
    /* no room: derive again next time */
  }
  return keys;
}

/** Forget the keys kept for a code (leaving the family). */
export function forgetKeys(code, storage = globalThis.localStorage) {
  try {
    storage && storage.removeItem(CACHE_PREFIX + normalizeCode(code));
  } catch {
    /* ignore */
  }
}

export function encrypt(obj, convKey) {
  return nip44.encrypt(JSON.stringify(obj), convKey);
}

export function decrypt(ciphertext, convKey) {
  return JSON.parse(nip44.decrypt(ciphertext, convKey));
}

/** Exact length of the NIP-44 ciphertext for a plaintext, without encrypting: base64(version + nonce + padded body + mac). */
export function ciphertextLength(plaintext) {
  const bytes = new TextEncoder().encode(plaintext).length;
  const padded = nip44.utils.calcPaddedLen(bytes);
  return 4 * Math.ceil((1 + 32 + 2 + padded + 32) / 3);
}
