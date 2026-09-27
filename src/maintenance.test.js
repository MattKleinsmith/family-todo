import { describe, it, expect } from 'vitest';
import { createStore } from './store.js';
import { compactOldLogs, pruneTombstones } from './maintenance.js';
import { dayKey } from './baby.js';

const DAY = 24 * 3600_000;
const H = 3600_000;
const now = new Date(2026, 8, 27, 15, 0).getTime();

function storeAt(t0) {
  let t = t0;
  return createStore({ now: () => t++ });
}

describe('compactOldLogs', () => {
  it('rolls logs older than 90 days into daily summaries and marks them compacted', () => {
    const s = storeAt(now);
    const old = now - 100 * DAY;
    s.addLog({ kind: 'feed', startAt: old });
    s.addLog({ kind: 'feed', startAt: old + 3 * H });
    s.addLog({ kind: 'sleep', startAt: old + H, endAt: old + 2 * H });
    const recent = s.addLog({ kind: 'feed', startAt: now - 2 * DAY });
    const ongoing = s.addLog({ kind: 'sleep', startAt: now - H / 2, endAt: null }); // open sleeps are never compacted
    expect(compactOldLogs(s, now)).toBe(3);
    const live = s.logs().map((l) => l.id).sort();
    expect(live).toEqual([recent.id, ongoing.id].sort());
    const sum = s.summaries();
    expect(sum).toHaveLength(1);
    expect(sum[0].day).toBe(dayKey(old));
    expect(sum[0]).toMatchObject({ feeds: 2, sleeps: 1, sleepMs: H });
    const tomb = Object.values(s.get().logs).filter((l) => l.deleted);
    expect(tomb).toHaveLength(3);
    expect(tomb.every((l) => l.compacted)).toBe(true);
    // Running again is a no-op and does not recompute the summary.
    expect(compactOldLogs(s, now)).toBe(0);
    expect(s.summaries()).toHaveLength(1);
  });

  it('keeps a sleep that crosses into the detailed window and still counts its early part', () => {
    const s = storeAt(now);
    const cutoffDay = now - 90 * DAY;
    // Sleep from 11pm the day before the cutoff day to 1am on the cutoff day: end is inside the window, so it stays.
    const start = new Date(cutoffDay).setHours(-1, 0, 0, 0); // 23:00 previous day
    s.addLog({ kind: 'sleep', startAt: start, endAt: start + 2 * H });
    s.addLog({ kind: 'feed', startAt: start - 5 * H });
    expect(compactOldLogs(s, now)).toBe(1);
    expect(s.summaries()[0]).toMatchObject({ feeds: 1, sleeps: 1, sleepMs: H }); // one hour before midnight counted
    expect(s.logs()).toHaveLength(1); // the spanning sleep is still detailed
  });
});

describe('pruneTombstones', () => {
  it('drops old deletion markers locally and asks relays to forget them', () => {
    let t = now - 70 * DAY;
    const s = createStore({ now: () => t++ });
    const list = s.createList({ name: 'L' });
    const a = s.addItem({ listId: list.id, text: 'old' });
    s.deleteItem(a.id); // deleted 70 days ago
    t = now;
    const b = s.addItem({ listId: list.id, text: 'new' });
    s.deleteItem(b.id); // deleted today
    const asked = [];
    const sync = { publishDeletion: (tags) => asked.push(...tags) };
    expect(pruneTombstones(s, sync, now)).toBe(1);
    expect(s.get().items[a.id]).toBeUndefined();
    expect(s.get().items[b.id].deleted).toBe(true);
    expect(asked).toEqual([`ft:item:${a.id}`]);
  });

  it('ignores an old deletion marker arriving from a relay after it was pruned', () => {
    const s = createStore({ now: () => now });
    const ok = s.applyRemote({ id: 'x', type: 'item', listId: 'l', text: 'x', done: false, deleted: true, createdAt: 1, updatedAt: now - 70 * DAY });
    expect(ok).toBe(false);
    const fresh = s.applyRemote({ id: 'y', type: 'item', listId: 'l', text: 'y', done: false, deleted: true, createdAt: 1, updatedAt: now - 1 * DAY });
    expect(fresh).toBe(true);
  });
});

describe('async storage', () => {
  function asyncStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
      m,
      getItem: (k) => new Promise((r) => setTimeout(() => r(m.get(k) ?? null), 20)),
      setItem: (k, v) => new Promise((r) => setTimeout(() => (m.set(k, v), r()), 5)),
      removeItem: (k) => new Promise((r) => (m.delete(k), r())),
    };
  }
  it('loads saved data without clobbering writes made while loading, and migrates from legacy storage', async () => {
    const legacy = new Map([['k', JSON.stringify({ lists: { L1: { id: 'L1', type: 'list', name: 'Saved', deleted: false, createdAt: 1, updatedAt: 1 } }, items: {} })]]);
    const legacyStorage = { getItem: (k) => legacy.get(k) ?? null, removeItem: (k) => legacy.delete(k) };
    const storage = asyncStorage();
    let t = 1000;
    const s = createStore({ storageKey: 'k', storage, legacyStorage, now: () => t++ });
    const early = s.createList({ name: 'Early' }); // before the load resolves
    await s.ready;
    expect(s.lists().map((l) => l.name).sort()).toEqual(['Early', 'Saved']);
    expect(legacy.has('k')).toBe(false); // migrated away from localStorage
    await new Promise((r) => setTimeout(r, 120));
    const saved = JSON.parse(storage.m.get('k'));
    expect(Object.keys(saved.lists).sort()).toEqual(['L1', early.id].sort());
  });
});
