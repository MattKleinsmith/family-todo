import { describe, it, expect } from 'vitest';
import { createStore, isNewer } from './store.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

describe('isNewer', () => {
  it('prefers the larger updatedAt', () => {
    expect(isNewer({ updatedAt: 2 }, { updatedAt: 1 })).toBe(true);
    expect(isNewer({ updatedAt: 1 }, { updatedAt: 2 })).toBe(false);
  });
  it('breaks ties deterministically', () => {
    const a = { id: 'x', updatedAt: 1, text: 'a' };
    const b = { id: 'x', updatedAt: 1, text: 'b' };
    expect(isNewer(a, b)).not.toBe(isNewer(b, a));
  });
});

describe('store', () => {
  it('creates lists and items and persists them', () => {
    const storage = memoryStorage();
    let t = 1000;
    const s = createStore({ storageKey: 'k', storage, now: () => t++ });
    const list = s.createList({ name: 'Groceries', emoji: '🛒' });
    s.addItem({ listId: list.id, text: 'Milk' });
    s.addItem({ listId: list.id, text: 'Eggs' });
    expect(s.lists()).toHaveLength(1);
    expect(s.itemsFor(list.id).map((i) => i.text)).toEqual(['Milk', 'Eggs']);
  });

  it('sorts done items to the bottom, most recently done first', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const list = s.createList({ name: 'L' });
    const a = s.addItem({ listId: list.id, text: 'a' });
    const b = s.addItem({ listId: list.id, text: 'b' });
    s.addItem({ listId: list.id, text: 'c' });
    s.toggleItem(a.id);
    s.toggleItem(b.id);
    expect(s.itemsFor(list.id).map((i) => i.text)).toEqual(['c', 'b', 'a']);
  });

  it('merges remote records with last-writer-wins', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const list = s.createList({ name: 'L' });
    const item = s.addItem({ listId: list.id, text: 'Milk' });
    // Older remote edit loses.
    expect(s.applyRemote({ ...item, text: 'OLD', updatedAt: item.updatedAt - 1 })).toBe(false);
    expect(s.get().items[item.id].text).toBe('Milk');
    // Newer remote edit wins.
    expect(s.applyRemote({ ...item, text: 'Oat milk', updatedAt: item.updatedAt + 1 })).toBe(true);
    expect(s.get().items[item.id].text).toBe('Oat milk');
  });

  it('honours remote tombstones and hides deleted lists and items', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const list = s.createList({ name: 'L' });
    const item = s.addItem({ listId: list.id, text: 'Milk' });
    s.applyRemote({ ...item, deleted: true, updatedAt: t + 100 });
    expect(s.itemsFor(list.id)).toHaveLength(0);
    s.deleteList(list.id);
    expect(s.lists()).toHaveLength(0);
  });

  it('rejects malformed remote records', () => {
    const s = createStore();
    expect(s.applyRemote({ id: 'x' })).toBe(false);
    expect(s.applyRemote(null)).toBe(false);
    expect(s.applyRemote({ id: 'x', type: 'weird', updatedAt: 1 })).toBe(false);
  });

  it('reports local changes to sync listeners but not remote merges', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const seen = [];
    s.onLocalChange((e) => seen.push(e.type));
    const list = s.createList({ name: 'L' });
    s.applyRemote({ id: 'r', type: 'item', listId: list.id, text: 'x', updatedAt: 5000, deleted: false, done: false, createdAt: 1 });
    expect(seen).toEqual(['list']);
  });
});

describe('reordering', () => {
  it('moves one record between its new neighbours and keeps the rest untouched', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const L = s.createList({ name: 'L' });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((x) => s.addItem({ listId: L.id, text: x }));
    const before = { ...s.get().items };
    s.moveTo('item', d.id, [a.id, d.id, b.id, c.id]);
    expect(s.itemsFor(L.id).map((i) => i.text)).toEqual(['a', 'd', 'b', 'c']);
    for (const x of [a, b, c]) expect(s.get().items[x.id]).toBe(before[x.id]); // only d changed
    s.moveTo('item', a.id, [d.id, b.id, c.id, a.id]);
    expect(s.itemsFor(L.id).map((i) => i.text)).toEqual(['d', 'b', 'c', 'a']);
    s.moveTo('item', c.id, [c.id, d.id, b.id, a.id]);
    expect(s.itemsFor(L.id).map((i) => i.text)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('survives repeated moves into the same gap by renumbering', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const L = s.createList({ name: 'L' });
    const items = Array.from({ length: 5 }, (_, i) => s.addItem({ listId: L.id, text: `i${i}` }));
    // Keep dropping the last item between the first two: the gap halves every time.
    for (let n = 0; n < 60; n++) {
      const ids = s.itemsFor(L.id).map((i) => i.id);
      const last = ids.pop();
      ids.splice(1, 0, last);
      s.moveTo('item', last, ids);
      expect(s.itemsFor(L.id).map((i) => i.id)).toEqual(ids);
    }
    expect(items).toHaveLength(5);
  });

  it('orders lists too, and done items stay at the bottom', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const [x, y, z] = ['x', 'y', 'z'].map((name) => s.createList({ name }));
    s.moveTo('list', z.id, [z.id, x.id, y.id]);
    expect(s.lists().map((l) => l.name)).toEqual(['z', 'x', 'y']);
    const a = s.addItem({ listId: x.id, text: 'a' });
    const b = s.addItem({ listId: x.id, text: 'b' });
    s.toggleItem(a.id);
    expect(s.itemsFor(x.id).map((i) => i.text)).toEqual(['b', 'a']);
  });
});

describe('back-to-back writes', () => {
  it('keeps creation order even within the same millisecond', () => {
    const s = createStore({ now: () => 5000 }); // a frozen clock
    for (const name of ['Groceries', 'House', 'Todos', 'Baby', 'Garden']) s.createList({ name });
    expect(s.lists().map((l) => l.name)).toEqual(['Groceries', 'House', 'Todos', 'Baby', 'Garden']);
    const L = s.lists()[0];
    const a = s.addItem({ listId: L.id, text: 'a' });
    const b = s.updateItem(a.id, { text: 'b' });
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
  });
});

describe('flushSave', () => {
  it('writes pending changes right away instead of after the debounce', async () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    const store = createStore({ storageKey: 'data', storage });
    await store.ready;
    store.createList({ name: 'Groceries' });
    expect(m.get('data')).toBeUndefined();
    store.flushSave();
    expect(JSON.parse(m.get('data')).lists).not.toEqual({});
    store.flushSave(); // nothing pending: no-op
  });
});

describe('restoreList', () => {
  it('brings back a deleted list and the items deleted with it', () => {
    const store = createStore({ storage: null });
    const list = store.createList({ name: 'Groceries' });
    const milk = store.addItem({ listId: list.id, text: 'Milk' });
    const eggs = store.addItem({ listId: list.id, text: 'Eggs' });
    store.deleteItem(eggs.id); // removed earlier, on its own
    const ids = store.itemsFor(list.id).map((i) => i.id);
    store.deleteList(list.id);
    expect(store.lists()).toEqual([]);
    store.restoreList(list.id, ids);
    expect(store.lists().map((l) => l.name)).toEqual(['Groceries']);
    expect(store.itemsFor(list.id).map((i) => i.id)).toEqual([milk.id]);
  });
});

describe('moveAllItems', () => {
  it('moves one-offs (done or not) and repeating items, in order, after what is there, and undoes', async () => {
    const { describeChange } = await import('./activity.js');
    let t = 1000;
    const store = createStore({ storage: null, now: () => (t += 10) });
    const old = store.createList({ name: 'Old' });
    const mine = store.createList({ name: 'Matthew’s todos' });
    const existing = store.addItem({ listId: mine.id, text: 'Already here' });
    const a = store.addItem({ listId: old.id, text: 'A' });
    const b = store.addItem({ listId: old.id, text: 'B' });
    store.toggleItem(b.id);
    const c = store.addChore({ name: 'Practice Chinese', cadence: 'daily', listId: old.id });
    store.markChore(c.id, { at: t, by: 'Matthew' });
    const seen = [];
    store.onLocalChange((next, prev) => seen.push(describeChange(prev, next, { listName: (id) => store.getEntity('list', id)?.name })));
    const move = store.moveAllItems(old.id, mine.id);
    expect(move.count).toBe(3);
    expect(store.itemsFor(old.id)).toEqual([]);
    expect(store.choresFor(old.id)).toEqual([]);
    expect(store.itemsFor(mine.id).map((i) => [i.text, i.done])).toEqual([['Already here', false], ['A', false], ['B', true]]);
    expect(store.choresFor(mine.id).map((x) => [x.name, x.done.length])).toEqual([['Practice Chinese', 1]]);
    expect(seen.filter(Boolean)).toEqual(['moved 3 items from “Old” to “Matthew’s todos”']);
    store.deleteList(old.id);
    store.undoMoveAll(move);
    expect(store.getEntity('list', old.id).deleted).toBe(false);
    expect(store.itemsFor(old.id).map((i) => i.text)).toEqual(['A', 'B']);
    expect(store.choresFor(old.id).map((x) => x.name)).toEqual(['Practice Chinese']);
    expect(store.itemsFor(mine.id).map((i) => i.id)).toEqual([existing.id]);
    expect(store.moveAllItems(mine.id, mine.id)).toBeNull();
    expect(a.id).toBeTruthy();
  });
});
