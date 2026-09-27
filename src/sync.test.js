import { describe, it, expect } from 'vitest';
import { finalizeEvent } from 'nostr-tools/pure';
import { createStore } from './store.js';
import { createSync, dTagFor } from './sync.js';
import { deriveKeys, encrypt } from './keys.js';

// ---- A tiny in-memory Nostr relay with replaceable-event semantics ----

function makeFakeRelays(urls, opts = {}) {
  const relays = new Map();
  for (const url of urls) {
    relays.set(url, { events: new Map(), sockets: new Set(), log: [] });
  }
  const matches = (ev, f) =>
    (!f.kinds || f.kinds.includes(ev.kind)) &&
    (!f.authors || f.authors.includes(ev.pubkey)) &&
    (f.since === undefined || ev.created_at >= f.since) &&
    (f.until === undefined || ev.created_at <= f.until);

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.relay = relays.get(url);
      this.readyState = 0;
      this.subs = new Map();
      setTimeout(() => {
        if (this.readyState !== 0) return;
        if (opts.down && opts.down.has(url)) {
          this.readyState = 3;
          this.onerror && this.onerror(new Event('error'));
          this.onclose && this.onclose();
          return;
        }
        this.readyState = 1;
        this.relay.sockets.add(this);
        this.onopen && this.onopen();
      }, 0);
    }
    deliver(msg) {
      setTimeout(() => this.readyState === 1 && this.onmessage && this.onmessage({ data: JSON.stringify(msg) }), 0);
    }
    send(raw) {
      const msg = JSON.parse(raw);
      this.relay.log.push(msg);
      const [type] = msg;
      if (type === 'REQ') {
        const [, id, filter] = msg;
        this.subs.set(id, filter);
        const found = [...this.relay.events.values()].filter((ev) => matches(ev, filter)).sort((a, b) => b.created_at - a.created_at);
        const limited = filter.limit ? found.slice(0, filter.limit) : found;
        for (const ev of limited) this.deliver(['EVENT', id, ev]);
        this.deliver(['EOSE', id]);
      } else if (type === 'CLOSE') {
        this.subs.delete(msg[1]);
      } else if (type === 'EVENT') {
        const ev = msg[1];
        const d = ev.tags.find((t) => t[0] === 'd')?.[1];
        const key = `${ev.pubkey}:${ev.kind}:${d}`;
        const existing = this.relay.events.get(key);
        if (existing && existing.created_at > ev.created_at) {
          this.deliver(['OK', ev.id, false, 'replaced: have newer event']);
          return;
        }
        this.relay.events.set(key, ev);
        this.deliver(['OK', ev.id, true, '']);
        for (const sock of this.relay.sockets) {
          for (const [subId, filter] of sock.subs) if (matches(ev, filter)) sock.deliver(['EVENT', subId, ev]);
        }
      }
    }
    close() {
      this.readyState = 3;
      this.relay.sockets.delete(this);
      this.onclose && this.onclose();
    }
  }
  return { relays, FakeWebSocket };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return;
    await sleep(10);
  }
  throw new Error('waitFor timed out');
}

const URLS = ['wss://a.test', 'wss://b.test'];
const keysPromise = deriveKeys('unit-test-family-code');

function phone(fake, keys, storage = memoryStorage()) {
  const store = createStore({ storageKey: 'data', storage });
  const sync = createSync({ keys, store, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage });
  sync.start();
  return { store, sync, storage };
}

describe('sync', () => {
  it('two phones converge through the relays', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const a = phone(fake, keys);
    const b = phone(fake, keys);
    const list = a.store.createList({ name: 'Groceries' });
    const milk = a.store.addItem({ listId: list.id, text: 'Milk' });
    await waitFor(() => b.store.itemsFor(list.id).length === 1);
    b.store.toggleItem(milk.id);
    await waitFor(() => a.store.getEntity('item', milk.id).done === true);
    b.store.deleteItem(milk.id);
    await waitFor(() => a.store.itemsFor(list.id).length === 0);
    a.sync.stop();
    b.sync.stop();
  });

  it('a fresh phone rebuilds everything from the relays', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const a = phone(fake, keys);
    const list = a.store.createList({ name: 'House' });
    for (let i = 0; i < 5; i++) a.store.addItem({ listId: list.id, text: `t${i}` });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 6);
    const c = phone(fake, keys);
    await waitFor(() => c.store.itemsFor(list.id).length === 5);
    a.sync.stop();
    c.sync.stop();
  });

  it('offline edits are pushed when the phone comes back', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const a = phone(fake, keys);
    const b = phone(fake, keys);
    const list = a.store.createList({ name: 'L' });
    const item = a.store.addItem({ listId: list.id, text: 'v1' });
    await waitFor(() => b.store.getEntity('item', item.id));
    a.sync.stop();
    await sleep(5);
    a.store.updateItem(item.id, { text: 'v2 (offline)' });
    b.store.addItem({ listId: list.id, text: 'from B meanwhile' });
    await sleep(20);
    a.sync.start();
    await waitFor(() => b.store.getEntity('item', item.id).text === 'v2 (offline)');
    await waitFor(() => a.store.itemsFor(list.id).length === 2);
    a.sync.stop();
    b.sync.stop();
  });

  it('after a restart it fetches incrementally and does not republish everything', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const storage = memoryStorage();
    const a = phone(fake, keys, storage);
    const list = a.store.createList({ name: 'L' });
    for (let i = 0; i < 4; i++) a.store.addItem({ listId: list.id, text: `t${i}` });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 5);
    await sleep(80); // let the ack cursor advance
    a.sync.stop();
    const cursors = JSON.parse(storage.getItem(`ft:sync:${keys.pk}`));
    expect(cursors[URLS[0]].newest).toBeGreaterThan(0);
    expect(cursors[URLS[0]].ackedUpTo).toBeGreaterThan(0);
    expect(cursors[URLS[0]].fullSyncAt).toBeGreaterThan(0);

    const relay = fake.relays.get(URLS[0]);
    relay.log.length = 0;
    const a2 = phone(fake, keys, storage);
    await sleep(80);
    const reqs = relay.log.filter((m) => m[0] === 'REQ');
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0][2].since).toBeGreaterThan(0);
    expect(relay.log.filter((m) => m[0] === 'EVENT')).toHaveLength(0);
    a2.sync.stop();
  });

  it('pages through a relay that caps results', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const relay = fake.relays.get(URLS[0]);
    const base = Math.floor(Date.now() / 1000) - 10000;
    for (let i = 0; i < 1200; i++) {
      const entity = { id: `i${i}`, type: 'item', listId: 'L', text: `item ${i}`, done: false, createdAt: i, updatedAt: i + 1, deleted: false };
      const ev = finalizeEvent(
        { kind: 30078, created_at: base + i, tags: [['d', dTagFor(entity)]], content: encrypt(entity, keys.convKey) },
        keys.sk,
      );
      relay.events.set(`${ev.pubkey}:30078:${dTagFor(entity)}`, ev);
    }
    const a = createStore({});
    const sync = createSync({ keys, store: a, relays: [URLS[0]], WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage() });
    sync.start();
    await waitFor(() => Object.keys(a.get().items).length === 1200, 15000);
    sync.stop();
  }, 30000);

  it('keeps working when one relay is down and heals it when it returns', async () => {
    const keys = await keysPromise;
    const down = new Set([URLS[1]]);
    const fake = makeFakeRelays(URLS, { down });
    const a = phone(fake, keys);
    const b = phone(fake, keys);
    const list = a.store.createList({ name: 'L' });
    await waitFor(() => b.store.lists().length === 1);
    expect(fake.relays.get(URLS[1]).events.size).toBe(0);
    down.delete(URLS[1]);
    a.sync.reconnectAll();
    await waitFor(() => fake.relays.get(URLS[1]).events.size === 1);
    expect(list.id).toBeTruthy();
    a.sync.stop();
    b.sync.stop();
  });
});
