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
    // Nap is due a set time after he woke up (90m ago), whenever he was fed.
    expect(nextNapAt(st, 120)).toBe(now + 30 * M);
    expect(nextNapAt(st, 90)).toBe(now);
    expect(nextNapAt(st)).toBe(now + 30 * M); // default 2h
    // After waking from the night too, and a feed in between changes nothing.
    expect(nextNapAt(currentState([feed('f', now - 10 * M), { ...sleep('n', now - 11 * H, now - 20 * M), night: true }], now))).toBe(now + 100 * M);
    // Nothing due while asleep, or before any sleep has been logged.
    expect(nextNapAt(currentState([sleep('s2', now - 20 * M, null), feed('f', now - H)], now))).toBeNull();
    expect(nextNapAt(currentState([feed('f', now - H)], now))).toBeNull();
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

describe('countdown', () => {
  it('counts down, then flags due and overdue', async () => {
    const { countdown, formatTime } = await import('./baby.js');
    const now = new Date(2026, 8, 28, 14, 0).getTime();
    const at = (m) => now + m * 60_000;
    expect(countdown(null, now)).toBeNull();
    expect(countdown(at(80), now)).toEqual({ lead: 'in', value: '1h 20m', note: `~${formatTime(at(80))}`, state: 'later' });
    expect(countdown(at(12), now)).toMatchObject({ lead: 'in', value: '12m', state: 'soon' });
    expect(countdown(at(0.5), now)).toMatchObject({ lead: 'due', value: 'Now', state: 'due' });
    expect(countdown(at(-25), now)).toEqual({ lead: 'overdue by', value: '25m', note: `was due ${formatTime(at(-25))}`, state: 'late' });
  });
});

describe('a feed while he is asleep', () => {
  it('ends the nap that was still running', async () => {
    const { sleepEndedByFeed, followFeedMove } = await import('./baby.js');
    const t = new Date(2026, 8, 29, 14, 0).getTime();
    const nap = { id: 's', kind: 'sleep', startAt: t - 90 * 60_000, endAt: null };
    const feed = { id: 'f', kind: 'feed', startAt: t - 4 * 3600_000 };
    expect(sleepEndedByFeed([nap, feed], t)).toBe(nap);
    expect(sleepEndedByFeed([{ ...nap, endAt: t - 60_000 }, feed], t)).toBeNull(); // already awake
    expect(sleepEndedByFeed([{ ...nap, startAt: t + 60_000 }], t)).toBeNull(); // a feed logged before that nap began
    expect(sleepEndedByFeed([feed], t)).toBeNull();
    // Nudging that feed earlier moves the wake-up with it, but never before he fell asleep.
    const ended = { ...nap, endAt: t, endedByFeed: 'f' };
    const thisFeed = { id: 'f', kind: 'feed', startAt: t };
    expect(followFeedMove(ended, thisFeed, t - 15 * 60_000)).toBe(t - 15 * 60_000);
    expect(followFeedMove(ended, thisFeed, t - 3 * 3600_000)).toBeNull();
    expect(followFeedMove({ ...ended, endAt: t - 5 * 60_000 }, thisFeed, t - 15 * 60_000)).toBeNull(); // wake time was fixed by hand
    expect(followFeedMove({ ...ended, endedByFeed: 'other' }, thisFeed, t - 15 * 60_000)).toBeNull();
  });
});

describe('night sleep', () => {
  it('knows a night sleep from a nap', async () => {
    const { isNightStart, couldBeNight } = await import('./baby.js');
    const at = (h, m = 0) => new Date(2026, 8, 30, h, m).getTime();
    const feeds = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'feed', startAt: at(7 + i * 3) }));
    expect(isNightStart(at(21, 15), [])).toBe(true); // after 9 PM
    expect(isNightStart(at(2), [])).toBe(true); // small hours
    expect(isNightStart(at(14), feeds(3))).toBe(false); // afternoon nap
    expect(isNightStart(at(19, 30), feeds(4))).toBe(false); // evening, 4 feeds: still a nap
    expect(isNightStart(at(19, 30), feeds(5))).toBe(true); // after the 5th feed
    expect(isNightStart(at(19, 30), feeds(5), { nightAfterFeed: 0 })).toBe(false); // feed rule off
    expect(isNightStart(at(20, 15), [], { bedtimeMin: 20 * 60 })).toBe(true); // earlier bedtime
    expect(couldBeNight(at(18, 30))).toBe(true);
    expect(couldBeNight(at(13))).toBe(false);
  });
  it('no feed countdown while he is down for the night, and due on waking', async () => {
    const { feedDueAt, currentState } = await import('./baby.js');
    const t = (h, day = 30) => new Date(2026, 8, day, h).getTime();
    const lastFeed = { id: 'f', kind: 'feed', startAt: t(20) };
    const night = { id: 's', kind: 'sleep', startAt: t(21), endAt: null, night: true };
    // Asleep for the night at 3 AM: nothing due, however long since the feed.
    expect(feedDueAt(currentState([night, lastFeed], t(3, 31)))).toBeNull();
    // Woke at 7 AM: due right then, not 8 hours overdue.
    const woke = { ...night, endAt: t(7, 31) };
    expect(feedDueAt(currentState([woke, lastFeed], t(7, 31) + 60_000))).toBe(t(7, 31));
    // A nap works as before: counted from the last feed.
    const nap = { ...woke, night: false };
    expect(feedDueAt(currentState([nap, lastFeed], t(7, 31)))).toBe(t(23));
    // Once he's fed in the morning, the usual interval.
    const morning = { id: 'm', kind: 'feed', startAt: t(7, 31) + 10 * 60_000 };
    expect(feedDueAt(currentState([morning, woke, lastFeed], t(8, 31)))).toBe(morning.startAt + 180 * 60_000);
  });
});
