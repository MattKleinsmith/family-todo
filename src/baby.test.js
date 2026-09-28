import { describe, it, expect } from 'vitest';
import { formatDuration, currentState, dayStats, dayKey, groupByDay, nextFeedAt, nextNapAt, ongoingSleep, relative, toInputValue, fromInputValue } from './baby.js';
import { createStore } from './store.js';

const H = 3600_000;
const M = 60_000;
const now = new Date(2026, 8, 27, 15, 0).getTime(); // local 3:00 PM

const feed = (id, at) => ({ id, kind: 'feed', startAt: at, endAt: null });
const sleep = (id, start, end) => ({ id, kind: 'sleep', startAt: start, endAt: end });

describe('formatDuration', () => {
  it('renders minutes and hours', () => {
    expect(formatDuration(5 * M)).toBe('5m');
    expect(formatDuration(60 * M)).toBe('1h');
    expect(formatDuration(95 * M)).toBe('1h 35m');
    expect(formatDuration(-1)).toBe('0m');
  });
});

describe('currentState', () => {
  it('reports asleep with the running sleep', () => {
    const logs = [sleep('s2', now - 20 * M, null), feed('f1', now - 2 * H), sleep('s1', now - 5 * H, now - 4 * H)];
    const st = currentState(logs, now);
    expect(st.asleep.id).toBe('s2');
    expect(st.awakeSince).toBeNull();
    expect(st.lastFeed.id).toBe('f1');
  });
  it('reports awake since the last sleep ended', () => {
    const logs = [feed('f1', now - 40 * M), sleep('s1', now - 3 * H, now - 90 * M)];
    const st = currentState(logs, now);
    expect(st.asleep).toBeNull();
    expect(st.awakeSince).toBe(now - 90 * M);
    expect(nextFeedAt(st.lastFeed, 180)).toBe(now + 140 * M);
    // Nap is due a set time after the last feed started (fed 40m ago).
    expect(nextNapAt(st, 120)).toBe(now + 80 * M);
    expect(nextNapAt(st, 90)).toBe(now + 50 * M);
    expect(nextNapAt(st)).toBe(now + 80 * M); // default 2h
    // Nothing due while asleep, before any feed, or once he's napped since the feed.
    expect(nextNapAt(currentState([sleep('s2', now - 20 * M, null), feed('f', now - H)], now))).toBeNull();
    expect(nextNapAt(currentState([sleep('s1', now - 3 * H, now - 2 * H)], now))).toBeNull();
    expect(nextNapAt(currentState([sleep('s3', now - 30 * M, now - 10 * M), feed('f', now - 2 * H)], now))).toBeNull();
  });
  it('picks the earliest of two accidentally open sleeps', () => {
    const logs = [sleep('b', now - 5 * M, null), sleep('a', now - 30 * M, null)];
    expect(ongoingSleep(logs).id).toBe('a');
  });
});

describe('dayStats', () => {
  it('counts feeds and clips sleep to the day and to now', () => {
    const key = dayKey(now);
    const midnight = new Date(2026, 8, 27, 0, 0).getTime();
    const logs = [
      sleep('open', now - 30 * M, null), // running: counts 30m
      feed('f1', now - H),
      feed('f2', now - 2 * H),
      sleep('overnight', midnight - H, midnight + H), // only the 1h after midnight counts
      feed('yesterday', midnight - 2 * H),
    ];
    const st = dayStats(logs, key, now);
    expect(st.feeds).toBe(2);
    expect(st.sleepMs).toBe(90 * M);
  });
});

describe('groupByDay and relative', () => {
  it('groups newest-first logs by local day', () => {
    const logs = [feed('a', now), feed('b', now - H), feed('c', now - 20 * H)];
    const g = groupByDay(logs);
    expect(g.map((x) => x.logs.length)).toEqual([2, 1]);
  });
  it('describes times relative to now', () => {
    expect(relative(now + 45 * M, now)).toBe('in 45m');
    expect(relative(now - 20 * M, now)).toBe('20m ago');
    expect(relative(now + 10_000, now)).toBe('now');
  });
  it('round-trips datetime-local values', () => {
    expect(fromInputValue(toInputValue(now))).toBe(now);
    expect(fromInputValue('')).toBeNull();
  });
});

describe('store baby logs', () => {
  it('adds, edits, deletes logs and shares meta', () => {
    let t = 1000;
    const s = createStore({ now: () => t++ });
    const f = s.addLog({ kind: 'feed', startAt: 500, createdBy: 'Matt' });
    const sl = s.addLog({ kind: 'sleep', startAt: 600 });
    expect(s.addLog({ kind: 'bath', startAt: 1 })).toBeNull();
    expect(s.logs().map((l) => l.id)).toEqual([sl.id, f.id]);
    s.updateLog(sl.id, { endAt: 900 });
    expect(s.getEntity('log', sl.id).endAt).toBe(900);
    s.deleteLog(f.id);
    expect(s.logs()).toHaveLength(1);
    s.setMeta('baby', { name: 'Theo' });
    expect(s.getMeta('baby').name).toBe('Theo');
    expect(s.all().some((e) => e.type === 'meta')).toBe(true);
  });
  it('loads older saved data that has no logs bucket', () => {
    const m = new Map([['k', JSON.stringify({ lists: {}, items: {} })]]);
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    const s = createStore({ storageKey: 'k', storage });
    expect(s.logs()).toEqual([]);
    expect(s.getMeta('baby')).toBeNull();
  });
});
