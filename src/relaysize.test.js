import { describe, it, expect } from 'vitest';
import { finalizeEvent } from 'nostr-tools/pure';
import { deriveKeys, encrypt } from './keys.js';
import { relaySizeOf, dTagFor } from './sync.js';

describe('relaySizeOf', () => {
  it('matches the real signed event to the byte', async () => {
    const keys = await deriveKeys('relay-size-test');
    for (const entity of [
      { id: 'a1b2c3d4e5f60718293a4b5c', type: 'item', listId: 'l', text: 'Milk', done: false, deleted: false, createdAt: 1, updatedAt: 2, updatedBy: 'Matt' },
      { id: 'a1b2c3d4e5f60718293a4b5c', type: 'list', name: 'Groceries with a much longer name to cross a padding boundary', emoji: 'icon:broccoli', createdAt: 1, updatedAt: 2 },
      { id: 'day:2026-06-01', type: 'summary', day: '2026-06-01', feeds: 7, sleeps: 4, sleepMs: 51_000_000, createdAt: 1, updatedAt: 2 },
    ]) {
      const ev = finalizeEvent({ kind: 30078, created_at: 1_700_000_000, tags: [['d', dTagFor(entity)]], content: encrypt(entity, keys.convKey) }, keys.sk);
      expect(relaySizeOf(entity)).toBe(JSON.stringify(ev).length);
    }
  });
});
