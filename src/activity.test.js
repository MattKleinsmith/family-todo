import { describe, it, expect } from 'vitest';
import { describeChange, createActivity } from './activity.js';
import { createStore } from './store.js';
import { formatTime } from './baby.js';

const ctx = { listName: (id) => ({ g: 'Groceries', h: 'House' })[id], babyName: 'Theo' };
const item = (o) => ({ id: 'i1', type: 'item', listId: 'g', text: 'Milk', done: false, deleted: false, updatedAt: 1, ...o });
const list = (o) => ({ id: 'g', type: 'list', name: 'Groceries', emoji: '🛒', deleted: false, updatedAt: 1, ...o });
const T = new Date(2026, 8, 27, 8, 30).getTime();

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
  it('baby settings and members', () => {
    expect(describeChange(null, { id: 'baby', type: 'meta', name: 'Theo', updatedAt: 1 }, ctx)).toBe('named the baby Theo');
    expect(describeChange({ id: 'baby', type: 'meta', name: 'Theo' }, { id: 'baby', type: 'meta', name: 'Theo', feedIntervalMin: 150, updatedAt: 1 }, ctx)).toBe('set feeds to about every 2h 30m');
    expect(describeChange(null, { id: 'baby', type: 'meta', name: 'Theo', feedIntervalMin: 180, sleepIntervalMin: 180, updatedAt: 1 }, ctx)).toBe('named the baby Theo');
    const m = { id: 'd1', type: 'member', name: 'Huishi', device: 'iPhone', joinedAt: 1, leftAt: null, updatedAt: 1 };
    expect(describeChange(null, m, ctx)).toBe('joined the family on an iPhone');
    expect(describeChange(null, { ...m, backfilled: true }, ctx)).toBeNull();
    expect(describeChange(m, { ...m, leftAt: 5 }, ctx)).toBe('left the family on an iPhone');
    expect(describeChange({ ...m, leftAt: 5 }, { ...m, leftAt: null }, ctx)).toBe('rejoined the family on an iPhone');
    expect(describeChange(m, { ...m, name: 'Hui' }, ctx)).toBe('changed their name from Huishi to Hui');
  });
});

describe('createActivity', () => {
  function setup() {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    let t = 10_000;
    const store = createStore({ now: () => t++, actor: () => 'Matt' });
    const activity = createActivity({ store, storageKey: 'act', storage, prefs: storage, since: () => 5_000, self: () => 'Matt' });
    return { store, activity, storage };
  }
  it('records other people’s changes but not local ones or pre-join history', () => {
    const { store, activity } = setup();
    const g = store.createList({ name: 'Groceries', emoji: '🛒' });
    store.addItem({ listId: g.id, text: 'Milk' }); // local: recorded as mine, already seen, hidden by default
    expect(activity.entries()).toHaveLength(2);
    expect(activity.entries().every((e) => e.mine && e.seen)).toBe(true);
    expect(activity.visibleEntries()).toHaveLength(0);
    expect(activity.unseenCount()).toBe(0);
    // History from before this phone joined
    store.applyRemote({ id: 'old', type: 'item', listId: g.id, text: 'Old', done: false, deleted: false, createdAt: 1, updatedAt: 1000, updatedBy: 'Huishi' });
    expect(activity.entries()).toHaveLength(2); // still only my own two
    // A change from the other phone
    store.applyRemote({ id: 'old', type: 'item', listId: g.id, text: 'Old', done: true, deleted: false, createdAt: 1, updatedAt: 20_000, updatedBy: 'Huishi' });
    store.applyRemote({ id: 'new', type: 'item', listId: g.id, text: 'Eggs', done: false, deleted: false, createdAt: 20_001, updatedAt: 20_001, updatedBy: 'Huishi' });
    const e = activity.visibleEntries();
    expect(e.map((x) => x.text)).toEqual(['added “Eggs” in Groceries', 'checked off “Old” in Groceries']);
    activity.setShowMine(true);
    expect(activity.visibleEntries().map((x) => x.text)).toEqual(['added “Eggs” in Groceries', 'checked off “Old” in Groceries', 'added “Milk” in Groceries', 'created the list 🛒 Groceries']);
    expect(activity.visibleEntries()[3].actor).toBe('Matt');
    activity.setShowMine(false);
    expect(e[0].actor).toBe('Huishi');
    expect(e[0].mine).toBe(false);
    expect(activity.unseenCount()).toBe(2);
    expect(activity.unseenForList(g.id)).toBe(2);
    activity.markAllSeen();
    expect(activity.unseenCount()).toBe(0);
  });
  it('stamps local writes with the actor and persists entries', () => {
    const { store, activity, storage } = setup();
    const g = store.createList({ name: 'G' });
    expect(g.updatedBy).toBe('Matt');
    store.applyRemote({ id: 'x', type: 'item', listId: g.id, text: 'Bread', done: false, deleted: false, createdAt: 1, updatedAt: 30_000, updatedBy: 'Huishi' });
    return new Promise((r) => setTimeout(r, 150)).then(() => {
      expect(JSON.parse(storage.getItem('act'))).toHaveLength(2); // Huishi's plus my own list creation
      activity.setShowMine(true);
      expect(storage.getItem('act:showMine')).toBe('1');
    });
  });
});
