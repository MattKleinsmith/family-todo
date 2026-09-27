import { describe, it, expect } from 'vitest';
import { describeChange, createActivity, ACTIVITY_CHUNK } from './activity.js';
import { createStore } from './store.js';
import { formatTime } from './baby.js';
import { pruneActivity } from './maintenance.js';

const ctx = { listName: (id) => ({ g: 'Groceries', h: 'House' })[id], babyName: 'Theo' };
const item = (o) => ({ id: 'i1', type: 'item', listId: 'g', text: 'Milk', done: false, deleted: false, updatedAt: 1, ...o });
const list = (o) => ({ id: 'g', type: 'list', name: 'Groceries', emoji: '🛒', deleted: false, updatedAt: 1, ...o });
const T = new Date(2026, 8, 27, 8, 30).getTime();
const DAY = 24 * 3600_000;

describe('describeChange', () => {
  it('items', () => {
    expect(describeChange(null, item(), ctx)).toBe('added “Milk” in Groceries');
    expect(describeChange(item(), item({ done: true }), ctx)).toBe('checked off “Milk” in Groceries');
    expect(describeChange(item({ done: true }), item({ done: false }), ctx)).toBe('unchecked “Milk” in Groceries');
    expect(describeChange(item(), item({ text: 'Oat milk' }), ctx)).toBe('renamed “Milk” to “Oat milk” in Groceries');
    expect(describeChange(item(), item({ deleted: true }), ctx)).toBe('removed “Milk” from Groceries');
    expect(describeChange(item(), item({ text: 'Oat milk', done: true }), ctx)).toBe('renamed “Milk” to “Oat milk” and checked off “Oat milk” in Groceries');
    expect(describeChange(item(), item({ updatedBy: 'x' }), ctx)).toBeNull();
    expect(describeChange(item(), item({ text: 'Oat milk', done: true, listId: 'h' }), ctx)).toBe('renamed “Milk” to “Oat milk”, checked off “Oat milk” and moved “Oat milk” to House in House');
    expect(describeChange(null, item({ deleted: true }), ctx)).toBeNull();
  });
  it('lists', () => {
    expect(describeChange(null, list(), ctx)).toBe('created the list 🛒 Groceries');
    expect(describeChange(list(), list({ name: 'Food' }), ctx)).toBe('renamed the list “Groceries” to “Food”');
    expect(describeChange(list(), list({ emoji: '🥦' }), ctx)).toBe('changed Groceries’ icon to 🥦');
    expect(describeChange(list(), list({ emoji: 'icon:seedling' }), ctx)).toBe('changed Groceries’ icon to 🌱');
    expect(describeChange(null, list({ emoji: 'icon:house' }), ctx)).toBe('created the list 🏡 Groceries');
    expect(describeChange(list(), list({ deleted: true }), ctx)).toBe('deleted the list 🛒 Groceries');
  });
  it('baby logs', () => {
    const feed = { id: 'l1', type: 'log', kind: 'feed', startAt: T, endAt: null, note: '', deleted: false, updatedAt: 1 };
    const sleep = { ...feed, id: 'l2', kind: 'sleep' };
    expect(describeChange(null, feed, ctx)).toBe(`logged a feed at ${formatTime(T)}`);
    expect(describeChange(null, { ...feed, note: '5 oz' }, ctx)).toBe(`logged a feed at ${formatTime(T)} (5 oz)`);
    expect(describeChange(null, sleep, ctx)).toBe(`logged Theo falling asleep at ${formatTime(T)}`);
    expect(describeChange(sleep, { ...sleep, endAt: T + 45 * 60000 }, ctx)).toBe(`logged Theo waking up at ${formatTime(T + 45 * 60000)} (slept 45m)`);
    expect(describeChange(feed, { ...feed, startAt: T - 30 * 60000 }, ctx)).toBe(`moved the ${formatTime(T)} feed to ${formatTime(T - 30 * 60000)}`);
    expect(describeChange(feed, { ...feed, note: '5 oz' }, ctx)).toBe(`noted “5 oz” on the ${formatTime(T)} feed`);
    expect(describeChange(feed, { ...feed, deleted: true }, ctx)).toBe(`removed the ${formatTime(T)} feed`);
  });
  it('baby settings, members, and housekeeping', () => {
    expect(describeChange(null, { id: 'baby', type: 'meta', name: 'Theo', updatedAt: 1 }, ctx)).toBe('named the baby Theo');
    expect(describeChange({ id: 'baby', type: 'meta', name: 'Theo' }, { id: 'baby', type: 'meta', name: 'Theo', feedIntervalMin: 150, updatedAt: 1 }, ctx)).toBe('set feeds to about every 2h 30m');
    expect(describeChange(null, { id: 'baby', type: 'meta', name: 'Theo', feedIntervalMin: 180, sleepIntervalMin: 180, updatedAt: 1 }, ctx)).toBe('named the baby Theo');
    const m = { id: 'd1', type: 'member', name: 'Huishi', device: 'iPhone', joinedAt: 1, leftAt: null, updatedAt: 1 };
    expect(describeChange(null, m, ctx)).toBe('joined the family on an iPhone');
    expect(describeChange(null, { ...m, backfilled: true }, ctx)).toBeNull();
    expect(describeChange(m, { ...m, leftAt: 5 }, ctx)).toBe('left the family on an iPhone');
    expect(describeChange({ ...m, leftAt: 5 }, { ...m, leftAt: null }, ctx)).toBe('rejoined the family on an iPhone');
    expect(describeChange(m, { ...m, name: 'Hui' }, ctx)).toBe('changed their name from Huishi to Hui');
    expect(describeChange(null, { id: 'act:x', type: 'activity', entries: [], updatedAt: 1 }, ctx)).toBeNull();
  });
});

function memStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

/** A phone: its own store and activity feed. `relay` copies records between phones like the real sync does. */
function phone({ name, device, joinedAt, relay, storage = memStorage(), clock }) {
  const store = createStore({ now: () => clock.t++, actor: () => name });
  const activity = createActivity({ store, storageKey: 'act', storage, prefs: storage, device: () => device, since: () => joinedAt, self: () => name, flushMs: 1 });
  store.onLocalChange((e) => relay.push(e));
  return { store, activity, storage };
}
const deliver = (relay, target) => { for (const e of relay) target.store.applyRemote(e); };
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('createActivity (synced)', () => {
  it('writes entries for local changes into this phone’s chunks, which other phones read', async () => {
    const clock = { t: T };
    const relay = [];
    const A = phone({ name: 'Matthew', device: 'dA', joinedAt: T - 1, relay, clock });
    const g = A.store.createList({ name: 'Groceries', emoji: '🛒' });
    A.store.addItem({ listId: g.id, text: 'Milk' });
    await settle();
    const chunks = A.store.activityBuckets();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].entries.map((e) => e.text)).toEqual(['created the list 🛒 Groceries', 'added “Milk” in Groceries']);
    expect(A.activity.unseenCount()).toBe(0); // your own changes aren't news
    expect(A.activity.visibleEntries()).toHaveLength(0);

    // Huishi's phone joined earlier and now receives everything, including the activity chunk.
    const B = phone({ name: 'Huishi', device: 'dB', joinedAt: T - 2, relay: [], clock });
    await B.activity.ready;
    deliver(relay, B);
    expect(B.activity.visibleEntries().map((e) => e.text)).toEqual(['added “Milk” in Groceries', 'created the list 🛒 Groceries']);
    expect(B.activity.visibleEntries()[0].actor).toBe('Matthew');
    expect(B.activity.unseenCount()).toBe(2);
    expect(B.activity.unseenForList(g.id)).toBe(2);
    B.activity.markAllSeen();
    expect(B.activity.unseenCount()).toBe(0);
  });

  it('a phone that joins later sees the whole history, already marked as seen', async () => {
    const clock = { t: T };
    const relay = [];
    const A = phone({ name: 'Matthew', device: 'dA', joinedAt: T - 1, relay, clock });
    const g = A.store.createList({ name: 'Groceries' });
    for (const t of ['Milk', 'Eggs', 'Bread']) A.store.addItem({ listId: g.id, text: t });
    await settle();
    const C = phone({ name: 'Grandma', device: 'dC', joinedAt: clock.t + 1000, relay: [], clock });
    await C.activity.ready;
    deliver(relay, C);
    expect(C.activity.visibleEntries()).toHaveLength(4);
    expect(C.activity.unseenCount()).toBe(0);
  });

  it(`starts a new chunk every ${ACTIVITY_CHUNK} entries and never duplicates`, async () => {
    const clock = { t: T };
    const A = phone({ name: 'M', device: 'dA', joinedAt: T - 1, relay: [], clock });
    const g = A.store.createList({ name: 'G' });
    for (let i = 0; i < 45; i++) A.store.addItem({ listId: g.id, text: `i${i}` });
    await settle();
    const sizes = A.store.activityBuckets().sort((a, b) => a.chunk - b.chunk).map((b) => b.entries.length);
    expect(sizes).toEqual([ACTIVITY_CHUNK, ACTIVITY_CHUNK, 6]);
    A.activity.flushNow();
    expect(A.activity.entries()).toHaveLength(46);
  });

  it('upgrading from the local-only feed shares own history and keeps the rest', async () => {
    const old = [
      { id: 'x:3', at: T + 3, actor: 'Huishi', mine: false, text: 'added “Eggs” in G', entityType: 'item', entityId: 'x', listId: 'g', seen: false },
      { id: 'y:2', at: T + 2, actor: 'Matthew', mine: true, text: 'added “Milk” in G', entityType: 'item', entityId: 'y', listId: 'g', seen: true },
      { id: 'z:1', at: T + 1, actor: 'Huishi', mine: false, text: 'created the list G', entityType: 'list', entityId: 'g', listId: 'g', seen: true },
    ];
    const storage = memStorage({ act: JSON.stringify(old) });
    const clock = { t: T + 100 };
    const A = phone({ name: 'Matthew', device: 'dA', joinedAt: T, relay: [], storage, clock });
    await A.activity.ready;
    await settle();
    expect(A.store.activityBuckets()[0].entries.map((e) => e.id)).toEqual(['y:2']); // own history now shared
    expect(A.activity.entries().map((e) => e.id)).toEqual(['x:3', 'y:2', 'z:1']);
    expect(A.activity.unseenCount()).toBe(1); // the unseen one stays unseen
    // Once the other phone's copy of the same change arrives, it isn't shown twice.
    A.store.applyRemote({ id: 'act:dB:2026-09-27:0', type: 'activity', device: 'dB', day: '2026-09-27', chunk: 0, entries: [{ ...old[0], device: 'dB' }], createdAt: T, updatedAt: T + 50, deleted: false });
    expect(A.activity.entries()).toHaveLength(3);
    await new Promise((r) => setTimeout(r, 150));
    expect(JSON.parse(storage.getItem('act')).v).toBe(2);
  });

  it('old chunks are pruned and not taken back', async () => {
    const clock = { t: T };
    const A = phone({ name: 'M', device: 'dA', joinedAt: T - 1, relay: [], clock });
    A.store.createList({ name: 'G' });
    await settle();
    const later = T + 200 * DAY;
    const asked = [];
    expect(pruneActivity(A.store, { publishDeletion: (t) => asked.push(...t) }, later)).toBe(1);
    expect(A.store.activityBuckets()).toHaveLength(0);
    expect(asked[0]).toMatch(/^ft:activity:act:dA:/);
    const fresh = createStore({ now: () => later });
    expect(fresh.applyRemote({ id: 'act:dB:old:0', type: 'activity', entries: [], createdAt: T, updatedAt: T, deleted: false })).toBe(false);
  });
});

describe('reinstalls', () => {
  it('a second install of the same person on the same device type does not announce a join, and old repeats are hidden', async () => {
    const clock = { t: T };
    const A = phone({ name: 'Matthew', device: 'dA', joinedAt: T - 1, relay: [], clock });
    A.store.setMember('dA', { name: 'Matthew', device: 'iPhone', joinedAt: T, leftAt: null });
    await settle();
    // An old install's record and its join line, as synced from a previous home-screen copy.
    A.store.applyRemote({ id: 'dOld', type: 'member', name: 'Matthew', device: 'iPhone', joinedAt: T - 100, leftAt: null, createdAt: 1, updatedAt: T - 100, deleted: false });
    A.store.applyRemote({ id: 'act:dOld:x:0', type: 'activity', device: 'dOld', day: 'x', chunk: 0, entries: [{ id: 'dOld:1', at: T - 100, actor: 'Matthew', text: 'joined the family on an iPhone', entityType: 'member', entityId: 'dOld', listId: null }], createdAt: 1, updatedAt: T - 100, deleted: false });
    const joins = A.activity.entries().filter((e) => /joined the family/.test(e.text));
    expect(joins).toHaveLength(1);
    // A fresh install now registers: no new join line.
    A.store.setMember('dNew', { name: 'Matthew', device: 'iPhone', joinedAt: clock.t, leftAt: null });
    await settle();
    expect(A.activity.entries().filter((e) => /joined the family/.test(e.text))).toHaveLength(1);
    // A genuinely different device still announces.
    A.store.setMember('dMac', { name: 'Matthew', device: 'Mac', joinedAt: clock.t, leftAt: null });
    await settle();
    expect(A.activity.entries().filter((e) => /joined the family/.test(e.text)).map((e) => e.text)).toContain('joined the family on a Mac');
  });
});
