// Family codes: the one secret both phones share. Everything (encryption key,
// relay identity) is derived from it, so whoever has the code has full
// read/write access to the family's lists. That's the intended model.
import { wordlist } from '@scure/bip39/wordlists/english.js';

const WORDS = 4;

function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** Generate a fresh, unguessable, easy-to-type family code like "lucky-river-cabin-orbit". */
export function generateCode() {
  const words = [];
  for (let i = 0; i < WORDS; i++) words.push(wordlist[randomInt(wordlist.length)]);
  return words.join('-');
}

/** Normalize user input so "Lucky River Cabin Orbit" and "lucky-river-cabin-orbit" are the same family. */
export function normalizeCode(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Rough strength check used only to warn about weak custom codes. */
export function isWeakCode(code) {
  const c = normalizeCode(code);
  return c.length < 12;
}
