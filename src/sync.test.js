import { describe, it, expect } from 'vitest';
import { finalizeEvent } from 'nostr-tools/pure';
import { createStore } from './store.js';
import { createSync, dTagFor } from './sync.js';
import { deriveKeys, encrypt } from './keys.js';

// ---- A tiny in-memory Nostr relay with replaceable-event semantics ----

function makeFakeRelays(urls, opts = {}) {
  const relays = new Map();
  for (const url of urls) {
    relays.set(url, { events: new Map(), sockets: new Set(), log: [], limited: 0 });
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
      } else if (type === 'COUNT') {
        if (opts.noCount) {
          this.deliver(['NOTICE', 'ERROR: bad msg: unknown cmd']);
          return;
        }
        const [, id, filter] = msg;
        this.deliver(['COUNT', id, { count: [...this.relay.events.values()].filter((ev) => matches(ev, filter)).length }]);
      } else if (type === 'CLOSE') {
        this.subs.delete(msg[1]);
      } else if (type === 'EVENT') {
        const ev = msg[1];
        if (opts.rateLimit && this.relay.limited < opts.rateLimit) {
          this.relay.limited++;
          this.deliver(['OK', ev.id, false, 'rate-limited: you are noting too much']);
          return;
        }
        const d = ev.tags.find((t) => t[0] === 'd')?.[1];
        const key = `${ev.pubkey}:${ev.kind}:${d}`;
        const existing = this.relay.events.get(key);
        // Real relays keep the newer created_at, and on a tie the lower id.
        if (existing && (existing.created_at > ev.created_at || (opts.tieBreakById && existing.created_at === ev.created_at && existing.id < ev.id))) {
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

describe('same-second edits', () => {
  it('a quick second edit still reaches the other phone (relays tie-break by id within a second)', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS, { tieBreakById: true });
    const frozen = 1_800_000_000_000; // every event would land in the same second
    const a = createStore({});
    const sa = createSync({ keys, store: a, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage(), now: () => frozen });
    const b = createStore({});
    const sb = createSync({ keys, store: b, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage(), now: () => frozen });
    sa.start();
    sb.start();
    await waitFor(() => sa.status().connected === URLS.length && sb.status().connected === URLS.length);
    const list = a.createList({ name: 'L' });
    const it1 = a.addItem({ listId: list.id, text: 'Coffee' });
    await waitFor(() => b.getEntity('item', it1.id));
    // Each further edit lands on the relays within the same second as the first.
    for (let i = 0; i < 5; i++) {
      a.updateItem(it1.id, { text: `Coffee v${i}` });
      await sleep(15);
    }
    await waitFor(() => b.getEntity('item', it1.id)?.text === 'Coffee v4', 2000);
    sa.stop();
    sb.stop();
  });
});

describe('bandwidth', () => {
  const HOUR = 3600_000;
  it('a reopen downloads nothing old and re-sends nothing the relay already confirmed', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const storage = memoryStorage();
    let clock = 1_800_000_000_000;
    const store = createStore({ now: () => clock });
    const opts = { keys, store, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage, now: () => clock };
    let s = createSync(opts);
    s.start();
    await waitFor(() => s.status().connected === URLS.length);
    await sleep(30);
    const L = store.createList({ name: 'L' });
    for (let i = 0; i < 30; i++) store.addItem({ listId: L.id, text: `i${i}` }); // published live, after the first sync
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 31);
    clock += HOUR;
    store.addItem({ listId: L.id, text: 'one recent change' });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 32);
    await sleep(400); // confirmations → ack cursor
    clock += 30 * 60_000; // the app sits open and idle for a while, then closes
    s.stop();
    clock += 2 * HOUR; // reopen later; nothing changed since
    for (const r of fake.relays.values()) r.log.length = 0;
    s = createSync(opts);
    s.resetStats();
    s.start();
    await waitFor(() => s.status().connected === URLS.length);
    await sleep(200);
    const st = s.stats();
    // Nothing from before the last sync comes down again.
    expect(st.recvEvents).toBe(0);
    for (const r of fake.relays.values()) expect(r.log.filter((m) => m[0] === 'EVENT')).toHaveLength(0);
    s.stop();
    // And again: still nothing.
    clock += HOUR;
    s = createSync(opts);
    s.resetStats();
    s.start();
    await waitFor(() => s.status().connected === URLS.length);
    await sleep(200);
    expect(s.stats().recvEvents).toBe(0);
    s.stop();
  });

  it('a change made on another phone after the last sync is picked up on reopen', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    let clock = 1_800_000_000_000;
    const aStore = createStore({ now: () => clock });
    const aOpts = { keys, store: aStore, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage(), now: () => clock };
    let a = createSync(aOpts);
    a.start();
    await waitFor(() => a.status().connected === URLS.length);
    const L = aStore.createList({ name: 'L' });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 1);
    await sleep(100);
    a.stop();
    clock += HOUR;
    // Phone B (clock two minutes slow) adds something while A is closed.
    const bStore = createStore({ now: () => clock - 120_000 });
    const b = createSync({ keys, store: bStore, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage(), now: () => clock - 120_000 });
    b.start();
    await waitFor(() => bStore.lists().length === 1);
    bStore.addItem({ listId: L.id, text: 'from B' });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 2);
    b.stop();
    clock += HOUR;
    a = createSync(aOpts);
    a.start();
    await waitFor(() => aStore.itemsFor(L.id).length === 1);
    a.stop();
  });

  it('backs off a relay that rate-limits, and still delivers everything', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays([URLS[0]], { rateLimit: 5 });
    const store = createStore({});
    const s = createSync({ keys, store, relays: [URLS[0]], WebSocketImpl: fake.FakeWebSocket, storage: memoryStorage(), throttleBaseMs: 40 });
    s.start();
    await waitFor(() => s.status().connected === 1);
    const L = store.createList({ name: 'L' });
    for (let i = 0; i < 10; i++) store.addItem({ listId: L.id, text: `i${i}` });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 11, 12000);
    const st = s.relayStates()[0];
    expect(st.throttled).toBeGreaterThan(0);
    // After being told to slow down it didn't hammer the relay: sends ≈ records + the refused ones.
    const sends = fake.relays.get(URLS[0]).log.filter((m) => m[0] === 'EVENT').length;
    expect(sends).toBeLessThanOrEqual(11 + 5 + 2);
    s.stop();
  }, 20000);

  it('periodic health check: counts first, re-downloads only a relay that is short', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays(URLS);
    const storage = memoryStorage();
    let clock = 1_800_000_000_000;
    const store = createStore({ now: () => clock });
    const opts = { keys, store, relays: URLS, WebSocketImpl: fake.FakeWebSocket, storage, now: () => clock, fullSyncEveryMs: HOUR };
    let s = createSync(opts);
    s.start();
    await waitFor(() => s.status().connected === URLS.length);
    const L = store.createList({ name: 'L' });
    for (let i = 0; i < 5; i++) store.addItem({ listId: L.id, text: `i${i}` });
    await waitFor(() => [...fake.relays.values()].every((r) => r.events.size === 6));
    await sleep(400);
    s.stop();
    // Relay B loses its data. Time passes past the health-check interval.
    fake.relays.get(URLS[1]).events.clear();
    clock += 2 * HOUR;
    for (const r of fake.relays.values()) r.log.length = 0;
    s = createSync(opts);
    s.start();
    await waitFor(() => fake.relays.get(URLS[1]).events.size === 6); // healed
    await sleep(100);
    const reqs = (u) => fake.relays.get(u).log.filter((m) => m[0] === 'REQ');
    expect(reqs(URLS[0])[0][2].since).toBeGreaterThan(0); // healthy: incremental only
    expect(reqs(URLS[1])[0][2].since).toBeUndefined(); // short: full re-download
    expect(fake.relays.get(URLS[0]).log.filter((m) => m[0] === 'EVENT')).toHaveLength(0);
    s.stop();
  });

  it('a relay that cannot count gets the full re-sync', async () => {
    const keys = await keysPromise;
    const fake = makeFakeRelays([URLS[0]], { noCount: true });
    const storage = memoryStorage();
    let clock = 1_800_000_000_000;
    const store = createStore({ now: () => clock });
    const opts = { keys, store, relays: [URLS[0]], WebSocketImpl: fake.FakeWebSocket, storage, now: () => clock, fullSyncEveryMs: HOUR };
    let s = createSync(opts);
    s.start();
    await waitFor(() => s.status().connected === 1);
    store.createList({ name: 'L' });
    await waitFor(() => fake.relays.get(URLS[0]).events.size === 1);
    await sleep(400);
    s.stop();
    clock += 2 * HOUR;
    fake.relays.get(URLS[0]).log.length = 0;
    s = createSync(opts);
    s.start();
    await waitFor(() => fake.relays.get(URLS[0]).log.some((m) => m[0] === 'REQ'));
    expect(fake.relays.get(URLS[0]).log.find((m) => m[0] === 'REQ')[2].since).toBeUndefined();
    s.stop();
  });
});
