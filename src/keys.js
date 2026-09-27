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

export async function deriveKeys(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw new Error('Empty code');
  const sk = await pbkdf2Async(sha256, normalized, SALT, { c: ITERATIONS, dkLen: 32 });
  const pk = getPublicKey(sk);
  const convKey = nip44.utils.getConversationKey(sk, pk);
  return { code: normalized, sk, pk, convKey };
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
