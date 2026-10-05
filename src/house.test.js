import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { choreStatus, timesOf, dueLabel, missedLabel, periodBounds, periodIndex, whenLabel, STARTER_CHORES, overdueChores, normalizeDays, daysLabel, repeatsText, nextDayLabel } from './house.js';
import { createStore } from './store.js';
import { describeChange, isQuiet } from './activity.js';
import { ICONS, iconId } from './icons.js';

// Monday 28 September 2026, 10:00 local time.
const MON = new Date(2026, 8, 28, 10).getTime();
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const chore = (o) => ({ id: 'c', type: 'chore', name: 'Mow the lawn', cadence: 'weekly', done: [], createdAt: at(2026, 9, 1), deleted: false, updatedAt: 1, ...o });

describe('periods', () => {
  it('weeks run Monday to Sunday', () => {
    const sun = at(2026, 9, 27, 23);
    expect(periodIndex('weekly', MON)).toBe(periodIndex('weekly', sun) + 1);
    expect(periodIndex('weekly', at(2026, 10, 4, 23))).toBe(periodIndex('weekly', MON));
    const { start, end } = periodBounds('weekly', at(2026, 10, 1));
    expect(new Date(start).getDay()).toBe(1);
    expect(new Date(start).getDate()).toBe(28);
    expect(new Date(end).getDate()).toBe(5);
  });
  it('days and months follow the calendar', () => {
    expect(periodIndex('daily', at(2026, 9, 28, 0))).toBe(periodIndex('daily', at(2026, 9, 28, 23)));
    expect(periodIndex('daily', at(2026, 9, 29, 0))).toBe(periodIndex('daily', at(2026, 9, 28, 23)) + 1);
    expect(periodIndex('monthly', at(2026, 10, 1))).toBe(periodIndex('monthly', at(2026, 9, 30)) + 1);
    expect(periodIndex('monthly', at(2027, 1, 1))).toBe(periodIndex('monthly', at(2026, 12, 31)) + 1);
  });
  it('two-week blocks run Monday to Sunday, the same on every phone', () => {
    const { start, end } = periodBounds('biweekly', MON);
    expect(new Date(start).getDay()).toBe(1);
    expect(Math.round((end - start) / 86400_000)).toBe(14);
    expect(periodIndex('biweekly', start)).toBe(periodIndex('biweekly', end - 1));
    expect(periodIndex('biweekly', end)).toBe(periodIndex('biweekly', start) + 1);
    // Each block is two of the weekly periods.
    expect(periodIndex('weekly', end) - periodIndex('weekly', start)).toBe(2);
    // Across daylight saving (1 November 2026) the blocks stay 14 days.
    const nov = periodBounds('biweekly', at(2026, 11, 3));
    expect(Math.round((nov.end - nov.start) / 86400_000)).toBe(14);
  });
  it('daylight saving changes do not skip or repeat a day', () => {
    // US clocks change on 1 November 2026 and 14 March 2027.
    expect(periodIndex('daily', at(2026, 11, 2, 0))).toBe(periodIndex('daily', at(2026, 11, 1, 0)) + 1);
    expect(periodIndex('daily', at(2027, 3, 15, 0))).toBe(periodIndex('daily', at(2027, 3, 14, 0)) + 1);
  });
});

describe('choreStatus', () => {
  it('is done when the current period has a completion', () => {
    const s = choreStatus(chore({ done: [{ at: MON - 3600_000, by: 'Huishi' }] }), MON);
    expect(s.state).toBe('done');
    expect(s.done.by).toBe('Huishi');
    expect(s.missed).toBe(0);
  });
  it('is just due when last week had it', () => {
    const s = choreStatus(chore({ done: [{ at: at(2026, 9, 26), by: 'Matthew' }] }), MON);
    expect(s.state).toBe('due');
    expect(s.missed).toBe(0);
    expect(s.daysLeft).toBe(7);
    expect(dueLabel(s)).toBe('7 days left this week');
    expect(dueLabel(choreStatus(chore(), at(2026, 10, 4, 9)))).toBe('Due by tonight');
  });
  it('is overdue when a whole week went by without it, and counts the weeks', () => {
    const last = { at: at(2026, 9, 19), by: 'Matthew' }; // Saturday two weeks back
    expect(choreStatus(chore({ done: [last] }), MON)).toMatchObject({ state: 'overdue', missed: 1 });
    expect(choreStatus(chore({ done: [last] }), at(2026, 10, 5))).toMatchObject({ state: 'overdue', missed: 2 });
    expect(missedLabel('weekly', 1)).toBe('Missed last week');
    expect(missedLabel('weekly', 2)).toBe('Missed 2 weeks');
    expect(missedLabel('daily', 1)).toBe('Missed yesterday');
    expect(missedLabel('daily', 3)).toBe('Missed 3 days');
    expect(missedLabel('monthly', 1)).toBe('Missed last month');
  });
  it('doing it clears the overdue flag for this period', () => {
    const c = chore({ done: [{ at: MON, by: 'Huishi' }, { at: at(2026, 9, 5), by: 'Matthew' }] });
    expect(choreStatus(c, MON + 60_000).state).toBe('done');
  });
  it('a new chore counts the period it was added in, unless it was added on its last day', () => {
    const daily = chore({ cadence: 'daily', createdAt: at(2026, 9, 27, 21) });
    expect(choreStatus(daily, MON).state).toBe('due'); // added last night: today is its first full day
    expect(choreStatus(daily, at(2026, 9, 29, 8))).toMatchObject({ state: 'overdue', missed: 1 });
    const weekly = chore({ createdAt: at(2026, 9, 27, 21) }); // added on a Sunday night
    expect(choreStatus(weekly, MON).state).toBe('due');
    expect(choreStatus(chore({ createdAt: at(2026, 9, 23) }), MON)).toMatchObject({ state: 'overdue', missed: 1 }); // added Wednesday, not done that week
    // A monthly chore added in September and not done by October.
    const monthly = chore({ cadence: 'monthly', createdAt: at(2026, 9, 28) });
    expect(choreStatus(monthly, at(2026, 9, 29)).state).toBe('due');
    expect(choreStatus(monthly, at(2026, 10, 1))).toMatchObject({ state: 'overdue', missed: 1 });
    expect(choreStatus(chore({ cadence: 'monthly', createdAt: at(2026, 9, 30, 20) }), at(2026, 10, 1)).state).toBe('due');
    const sheets = chore({ cadence: 'biweekly', createdAt: at(2026, 9, 16) });
    expect(choreStatus(sheets, at(2026, 9, 29)).state).toBe('overdue');
  });
  it('daily and monthly chores', () => {
    const daily = chore({ cadence: 'daily', done: [{ at: at(2026, 9, 27, 20), by: 'x' }] });
    expect(choreStatus(daily, MON)).toMatchObject({ state: 'due', missed: 0 });
    expect(dueLabel(choreStatus(daily, MON))).toBe('Due today');
    const monthly = chore({ cadence: 'monthly', done: [{ at: at(2026, 8, 3), by: 'x' }] });
    expect(choreStatus(monthly, MON)).toMatchObject({ state: 'due', missed: 0, daysLeft: 3 });
    expect(choreStatus(monthly, at(2026, 10, 2))).toMatchObject({ state: 'overdue', missed: 1 });
  });
  it('chores done several times a period count up to their target', () => {
    const bottles = (done) => chore({ cadence: 'daily', times: 2, done, createdAt: at(2026, 9, 1) });
    const morning = { at: MON - 2 * 3600_000, by: 'Huishi' };
    const noon = { at: MON + 2 * 3600_000, by: 'Matthew' };
    expect(choreStatus(bottles([]), MON)).toMatchObject({ count: 0, target: 2, state: 'overdue' });
    expect(choreStatus(bottles([morning]), MON)).toMatchObject({ count: 1, target: 2, state: 'due', done: null, missed: 0 });
    expect(choreStatus(bottles([morning]), MON).latest.by).toBe('Huishi');
    const both = choreStatus(bottles([noon, morning]), MON + 3 * 3600_000);
    expect(both).toMatchObject({ count: 2, state: 'done' });
    expect(both.done.by).toBe('Matthew');
    // Only once yesterday isn't "missed": the day wasn't skipped.
    expect(choreStatus(bottles([{ at: at(2026, 9, 27, 9) }]), MON)).toMatchObject({ count: 0, missed: 0, state: 'due' });
    // Out-of-range settings fall back to something sensible.
    expect(timesOf({ times: 9 })).toBe(9);
    expect(timesOf({ times: 500 })).toBe(99);
    expect(timesOf({ times: 'x' })).toBe(1);
    expect(timesOf({ times: 0 })).toBe(1);
    expect(timesOf({})).toBe(1);
  });
  it('every-two-weeks chores', () => {
    const sheets = (done) => chore({ cadence: 'biweekly', done, createdAt: at(2026, 8, 1) });
    const { start } = periodBounds('biweekly', MON);
    expect(choreStatus(sheets([{ at: start + 3600_000 }]), MON).state).toBe('done');
    expect(choreStatus(sheets([{ at: start - 86400_000 }]), MON)).toMatchObject({ state: 'due', missed: 0 });
    expect(choreStatus(sheets([{ at: start - 15 * 86400_000 }]), MON)).toMatchObject({ state: 'overdue', missed: 1 });
    expect(missedLabel('biweekly', 1)).toBe('Missed the last 2 weeks');
    expect(missedLabel('biweekly', 2)).toBe('Missed 4 weeks');
    expect(dueLabel(choreStatus(sheets([]), start))).toBe('14 days left');
  });
  it('overdueChores picks out the late ones', () => {
    const ok = chore({ id: 'a', done: [{ at: MON }] });
    const late = chore({ id: 'b', done: [{ at: at(2026, 8, 1) }] });
    expect(overdueChores([ok, late], MON).map((c) => c.id)).toEqual(['b']);
  });
  it('labels when something was done', () => {
    expect(whenLabel(at(2026, 9, 27), MON)).toBe('Yesterday');
    expect(whenLabel(at(2026, 9, 26), MON)).toBe(new Date(at(2026, 9, 26)).toLocaleDateString([], { weekday: 'short' }));
    expect(whenLabel(at(2026, 9, 1), MON)).toBe(new Date(at(2026, 9, 1)).toLocaleDateString([], { month: 'short', day: 'numeric' }));
  });
});

describe('store chores', () => {
  it('adds, marks, unmarks and orders chores', () => {
    let t = MON;
    const store = createStore({ storage: null, now: () => t });
    const a = store.addChore({ name: 'Do the dishes', cadence: 'daily' });
    const b = store.addChore({ name: 'Mow the lawn', cadence: 'weekly' });
    expect(store.addChore({ name: '  ' })).toBeNull();
    expect(store.chores().map((c) => c.name)).toEqual(['Do the dishes', 'Mow the lawn']);
    store.markChore(a.id, { at: MON, by: 'Huishi' });
    t += 1000;
    store.markChore(a.id, { at: MON - 86400_000, by: 'Matthew' });
    expect(store.getEntity('chore', a.id).done.map((d) => d.by)).toEqual(['Huishi', 'Matthew']);
    store.unmarkChore(a.id, MON);
    expect(store.getEntity('chore', a.id).done.map((d) => d.by)).toEqual(['Matthew']);
    store.moveTo('chore', b.id, [b.id, a.id]);
    expect(store.chores().map((c) => c.name)).toEqual(['Mow the lawn', 'Do the dishes']);
    store.deleteChore(a.id);
    expect(store.chores().map((c) => c.name)).toEqual(['Mow the lawn']);
    expect(store.hasAnyChores()).toBe(true);
    // Repeating items in a list don't count as the household having chores.
    const fresh = createStore({ storage: null });
    fresh.addChore({ name: 'Practice Chinese', cadence: 'daily', listId: 'me' });
    expect(fresh.hasAnyChores()).toBe(false);
    expect(store.tombstones(Infinity).map((e) => e.id)).toContain(a.id);
  });
  it('keeps more history for chores done several times a period', () => {
    const store = createStore({ storage: null });
    const c = store.addChore({ name: 'Wash the bottles', cadence: 'daily', times: 3 });
    for (let i = 0; i < 90; i++) store.markChore(c.id, { at: MON - i * 3600_000, by: 'x' });
    expect(store.getEntity('chore', c.id).done.length).toBe(60);
  });
  it('keeps only the most recent completions', () => {
    const store = createStore({ storage: null });
    const c = store.addChore({ name: 'Dishes', cadence: 'daily' });
    for (let i = 0; i < 30; i++) store.markChore(c.id, { at: MON - i * 86400_000, by: 'x' });
    const done = store.getEntity('chore', c.id).done;
    expect(done.length).toBe(20);
    expect(done[0].at).toBe(MON);
  });
  it('starter chores have fixed ids and bundled icons', () => {
    expect(new Set(STARTER_CHORES.map((c) => c.id)).size).toBe(STARTER_CHORES.length);
    for (const c of STARTER_CHORES) expect(iconId(c.icon)).toBeTruthy();
    expect(STARTER_CHORES.map((c) => c.cadence)).toEqual(['daily', 'daily', 'weekly', 'weekly', 'monthly']);
  });
  it('starter chores never overwrite what another phone already did with them', () => {
    const today = at(2026, 9, 28, 0);
    const a = createStore({ storage: null, now: () => MON });
    a.seedChores(STARTER_CHORES, today);
    expect(a.chores().map((c) => c.id)).toEqual(STARTER_CHORES.map((c) => c.id));
    a.markChore('starter-mow', { at: MON, by: 'Matthew' });
    a.deleteChore('starter-litter');
    // Another phone seeds on its own, then the two swap records in either order.
    const b = createStore({ storage: null, now: () => MON + 5000 });
    b.seedChores(STARTER_CHORES, today);
    for (const e of a.all()) b.applyRemote(e);
    for (const e of b.all()) a.applyRemote(e);
    for (const s of [a, b]) {
      expect(s.getEntity('chore', 'starter-mow').done.map((d) => d.by)).toEqual(['Matthew']);
      expect(s.chores().map((c) => c.id)).not.toContain('starter-litter');
    }
    // Seeding again never touches records that are already there.
    a.seedChores(STARTER_CHORES, today + 1000);
    expect(a.getEntity('chore', 'starter-mow').done.length).toBe(1);
    // Two phones that only seeded hold the exact same records, so nothing churns.
    const c = createStore({ storage: null });
    const d = createStore({ storage: null });
    c.seedChores(STARTER_CHORES, today);
    d.seedChores(STARTER_CHORES, today);
    expect(JSON.stringify(c.chores())).toBe(JSON.stringify(d.chores()));
    expect(c.getMeta('house').seeded).toBe(true);
  });
  it('every themed icon has its artwork', () => {
    for (const i of ICONS) expect(existsSync(new URL(`../public/icons/set/${i.id}.svg`, import.meta.url)), i.id).toBe(true);
  });
});

describe('chore activity', () => {
  const c = (o) => chore({ updatedAt: MON, ...o });
  it('describes chores', () => {
    expect(describeChange(null, c())).toBe('added the weekly chore “Mow the lawn”');
    expect(describeChange(null, c({ starter: true }))).toBeNull();
    expect(describeChange(c(), c({ done: [{ at: MON - 1000, by: 'H' }] }))).toBe('checked off “Mow the lawn”');
    expect(describeChange(c({ done: [{ at: MON - 1000 }] }), c({ done: [] }))).toBe('unchecked “Mow the lawn”');
    const sat = at(2026, 9, 26);
    expect(describeChange(c(), c({ done: [{ at: sat }] }))).toBe(`marked “Mow the lawn” done on ${new Date(sat).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`);
    expect(describeChange(c(), c({ cadence: 'monthly' }))).toBe('made “Mow the lawn” monthly');
    expect(describeChange(c(), c({ cadence: 'biweekly' }))).toBe('made “Mow the lawn” every 2 weeks');
    expect(describeChange(null, c({ cadence: 'biweekly' }))).toBe('added the chore “Mow the lawn” (every 2 weeks)');
    expect(describeChange(c({ cadence: 'biweekly' }), c({ cadence: 'biweekly', times: 2 }))).toBe('set “Mow the lawn” to 2 times every 2 weeks');
    expect(describeChange(c(), c({ name: 'Mow' }))).toBe('renamed the chore “Mow the lawn” to “Mow”');
    expect(describeChange(c(), c({ deleted: true }))).toBe('removed the chore “Mow the lawn”');
    expect(describeChange(c(), c({ order: 5 }))).toBe('reordered the chore “Mow the lawn”');
    expect(describeChange(c(), c({ owner: 'Huishi' }))).toBe('gave “Mow the lawn” to Huishi');
    expect(describeChange(c(), c({ owner: 'Matthew', updatedBy: 'Matthew' }))).toBe('took on “Mow the lawn”');
    expect(describeChange(c({ owner: 'Huishi' }), c({ owner: null }))).toBe('made “Mow the lawn” anyone’s job');
    expect(describeChange(null, c({ owner: 'Matthew' }))).toBe('added the weekly chore “Mow the lawn” for Matthew');
  });
  it('says which time it was for chores done several times a period', () => {
    const b = (o) => c({ name: 'Wash the bottles', cadence: 'daily', times: 2, ...o });
    const first = { at: MON - 1000 };
    expect(describeChange(b(), b({ done: [first] }))).toBe('checked off “Wash the bottles” (1 of 2 today)');
    expect(describeChange(b({ done: [first] }), b({ done: [{ at: MON - 500 }, first] }))).toBe('checked off “Wash the bottles” (2 of 2 today)');
    expect(describeChange(c(), c({ times: 2 }))).toBe('set “Mow the lawn” to 2 times a week');
    expect(describeChange(c({ times: 2 }), c({ times: 1 }))).toBe('set “Mow the lawn” to once a week');
  });
  it('dropping the oldest completion to make room is not news', () => {
    const old = Array.from({ length: 20 }, (_, i) => ({ at: MON - (i + 1) * 86400_000 }));
    const next = [{ at: MON - 1000 }, ...old.slice(0, 19)];
    expect(describeChange(c({ done: old }), c({ done: next }))).toBe('checked off “Mow the lawn”');
  });
});

describe('repeating items in a list', () => {
  it('an item can start repeating and go back to a one-off, keeping its place', () => {
    let t = MON;
    const store = createStore({ storage: null, now: () => t++ });
    const list = store.createList({ name: 'Matthew’s todos' });
    const a = store.addItem({ listId: list.id, text: 'Buy a notebook' });
    const b = store.addItem({ listId: list.id, text: 'Practice Chinese' });
    store.toggleItem(b.id); // done today already
    const c = store.repeatItem(b.id, { cadence: 'daily' });
    const vocab = store.addItem({ listId: list.id, text: 'Chinese vocab' });
    const v = store.repeatItem(vocab.id, { cadence: 'daily', times: 3 });
    expect(store.getEntity('chore', v.id).times).toBe(3);
    store.deleteChore(v.id);
    expect(store.itemsFor(list.id).map((i) => i.text)).toEqual(['Buy a notebook']);
    expect(store.choresFor(list.id).map((x) => [x.name, x.cadence])).toEqual([['Practice Chinese', 'daily']]);
    expect(store.getEntity('item', b.id)).toMatchObject({ deleted: true, convertedTo: c.id });
    expect(choreStatus(store.getEntity('chore', c.id), t).state).toBe('done'); // ticking it off earlier counts
    // Not a household chore.
    expect(store.houseChores().map((x) => x.id)).not.toContain(c.id);
    const back = store.stopRepeating(c.id);
    expect(store.choresFor(list.id)).toEqual([]);
    expect(store.itemsFor(list.id).map((i) => [i.text, i.done])).toEqual([['Buy a notebook', false], ['Practice Chinese', false]]);
    expect(back.fromChore).toBe(c.id);
    expect(a.id).toBeTruthy();
  });
  it('deleting a list takes its repeating items with it, and undo brings them back', () => {
    const store = createStore({ storage: null });
    const list = store.createList({ name: 'Me' });
    const c = store.addChore({ name: 'Read theology', cadence: 'daily', listId: list.id });
    const house = store.addChore({ name: 'Dishes', cadence: 'daily' });
    store.deleteList(list.id);
    expect(store.chores().map((x) => x.id)).toEqual([house.id]);
    store.restoreList(list.id, [], [c.id]);
    expect(store.choresFor(list.id).map((x) => x.id)).toEqual([c.id]);
  });
  it('reads like a list item in the activity feed, and ticking one off is quiet', () => {
    const ctx = { listName: (id) => ({ me: 'Matthew’s todos' })[id] };
    const r = (o) => chore({ name: 'Practice Chinese', cadence: 'daily', listId: 'me', updatedAt: MON, ...o });
    expect(describeChange(null, r(), ctx)).toBe('added “Practice Chinese” to Matthew’s todos, repeating daily');
    expect(describeChange(null, r({ fromItem: 'i1' }), ctx)).toBe('made “Practice Chinese” repeat daily in Matthew’s todos');
    const ticked = r({ done: [{ at: MON - 1000 }] });
    expect(describeChange(r(), ticked, ctx)).toBe('checked off “Practice Chinese” in Matthew’s todos');
    expect(isQuiet(r(), ticked)).toBe(true);
    expect(isQuiet(r(), r({ name: 'Practice Mandarin' }))).toBe(false);
    expect(isQuiet(chore({ updatedAt: MON }), chore({ updatedAt: MON, done: [{ at: MON }] }))).toBe(false); // House chores still count
    // Converting back and forth doesn't read as removing and adding.
    const item = { id: 'i1', type: 'item', listId: 'me', text: 'Practice Chinese', done: false, deleted: false, updatedAt: 1 };
    expect(describeChange(item, { ...item, deleted: true, convertedTo: 'c' }, ctx)).toBeNull();
    expect(describeChange(r(), r({ deleted: true, convertedTo: 'i2' }), ctx)).toBeNull();
    expect(describeChange(null, { ...item, id: 'i2', fromChore: 'c' }, ctx)).toBe('stopped repeating “Practice Chinese” in Matthew’s todos');
    expect(describeChange(r(), r({ deleted: true }), ctx)).toBe('removed the repeating item “Practice Chinese” from Matthew’s todos');
  });
});

describe('chores on some days of the week', () => {
  // Sep 25 2026 is a Friday, Sep 28 a Monday.
  const weekdays = { id: 'w', name: 'Pack lunch', cadence: 'daily', days: [1, 2, 3, 4, 5], done: [], createdAt: at(2026, 9, 25, 9) };

  it('is off on its days off, not due and not overdue', () => {
    const sat = choreStatus(weekdays, at(2026, 9, 26));
    expect(sat.state).toBe('off');
    expect(nextDayLabel(sat.nextDay, at(2026, 9, 26))).toBe('back Monday');
    expect(nextDayLabel(choreStatus(weekdays, at(2026, 9, 27)).nextDay, at(2026, 9, 27))).toBe('back tomorrow');
    expect(overdueChores([weekdays], at(2026, 9, 27))).toHaveLength(0);
  });

  it('only its own days can be missed', () => {
    // The weekend in between doesn't count against it.
    expect(choreStatus(weekdays, at(2026, 9, 28)).state).toBe('due');
    const tue = choreStatus(weekdays, at(2026, 9, 29));
    expect(tue).toMatchObject({ state: 'overdue', missed: 1 });
    expect(missedLabel('daily', tue.missed, tue.missedDay, at(2026, 9, 29))).toBe('Missed yesterday');
    const monWed = { ...weekdays, days: [1, 3], done: [{ at: at(2026, 9, 28), by: 'M' }] };
    expect(choreStatus(monWed, at(2026, 9, 30)).state).toBe('due'); // Tuesday was a day off
    expect(choreStatus(monWed, at(2026, 10, 1)).state).toBe('off');
    const mon = choreStatus(monWed, at(2026, 10, 5));
    expect(mon).toMatchObject({ state: 'overdue', missed: 1 });
    expect(missedLabel('daily', mon.missed, mon.missedDay, at(2026, 10, 5))).toBe('Missed Wednesday');
    expect(missedLabel('daily', 2, at(2026, 9, 30), at(2026, 10, 7))).toBe('Missed 2 days');
  });

  it('can still be done on a day off', () => {
    const c = { ...weekdays, done: [{ at: at(2026, 9, 26, 10), by: 'M' }] };
    expect(choreStatus(c, at(2026, 9, 26, 11)).state).toBe('done');
  });

  it('names its days, and every day or a non-daily chore has none', () => {
    expect(normalizeDays([5, 1, 1, 3])).toEqual([1, 3, 5]);
    expect(normalizeDays([0, 1, 2, 3, 4, 5, 6])).toBeNull();
    expect(normalizeDays([])).toBeNull();
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(daysLabel([6, 0])).toBe('Weekends');
    expect(daysLabel([0, 1, 3])).toBe('Mon, Wed, Sun');
    expect(daysLabel([3])).toBe('Wednesdays');
    expect(daysLabel(null)).toBe('Every day');
    expect(repeatsText(weekdays)).toBe('on weekdays');
    expect(repeatsText({ cadence: 'daily', days: [1, 3] })).toBe('on Mon, Wed');
    expect(repeatsText({ cadence: 'weekly', days: [3] })).toBe('on Wednesdays');
    expect(repeatsText({ cadence: 'weekly' })).toBe('weekly');
    expect(repeatsText({ cadence: 'monthly', days: [3] })).toBe('monthly');
    expect(choreStatus({ ...weekdays, cadence: 'monthly' }, at(2026, 9, 26)).state).toBe('due');
  });

  it('says so in the activity feed', () => {
    const base = { id: 'c', type: 'chore', name: 'Pack lunch', cadence: 'daily', done: [], updatedAt: 1, updatedBy: 'M' };
    expect(describeChange(null, { ...base, days: [1, 2, 3, 4, 5] }, {})).toBe('added the chore “Pack lunch” (weekdays)');
    expect(describeChange(base, { ...base, days: [1, 3], updatedAt: 2 }, {})).toBe('set “Pack lunch” to Mon, Wed');
    expect(describeChange({ ...base, days: [1, 3] }, { ...base, updatedAt: 2 }, {})).toBe('set “Pack lunch” to every day');
    expect(describeChange({ ...base, cadence: 'weekly' }, { ...base, days: [1, 2, 3, 4, 5], updatedAt: 2 }, {})).toBe('made “Pack lunch” daily (weekdays)');
    const store = createStore({});
    expect(store.addChore({ name: 'Run', cadence: 'daily', days: [0, 1, 2, 3, 4, 5, 6] }).days).toBeUndefined();
    expect(store.addChore({ name: 'Gym', cadence: 'daily', days: [3, 1] }).days).toEqual([1, 3]);
    expect(store.addChore({ name: 'Mow', cadence: 'weekly', days: [6] }).days).toEqual([6]);
    expect(store.addChore({ name: 'Filter', cadence: 'monthly', days: [6] }).days).toBeUndefined();
  });

  it('weekly on a set day is "every Wednesday": due, missed and done by the day', () => {
    // Sep 30 2026 is a Wednesday.
    const theology = { id: 't', name: 'Theology class', cadence: 'weekly', days: [3], times: 1, done: [], createdAt: at(2026, 9, 28, 9) };
    expect(choreStatus(theology, at(2026, 9, 29)).state).toBe('off');
    const wed = choreStatus(theology, at(2026, 9, 30));
    expect(wed).toMatchObject({ state: 'due', cadence: 'weekly', period: 'daily' });
    expect(dueLabel(wed)).toBe('Due today');
    const nextWed = choreStatus(theology, at(2026, 10, 7));
    expect(nextWed).toMatchObject({ state: 'overdue', missed: 1 });
    expect(missedLabel(nextWed.cadence, nextWed.missed, nextWed.missedDay, at(2026, 10, 7))).toBe('Missed Wednesday');
    const done = { ...theology, done: [{ at: at(2026, 9, 30, 19), by: 'M' }] };
    expect(choreStatus(done, at(2026, 9, 30, 20)).state).toBe('done');
    expect(choreStatus(done, at(2026, 10, 1)).state).toBe('off');
    expect(choreStatus(done, at(2026, 10, 7)).state).toBe('due');
  });
});

describe('who did it', () => {
  it('changes who did one completion, leaving the rest, and says so', () => {
    const store = createStore({});
    const c = store.addChore({ name: 'Wash the bottles', cadence: 'daily', times: 2 });
    store.markChore(c.id, { at: at(2026, 9, 30, 8), by: 'Matthew' });
    const before = store.markChore(c.id, { at: at(2026, 9, 30, 20), by: 'Matthew' });
    const after = store.setDoneBy(c.id, at(2026, 9, 30, 8), 'Huishi');
    expect(after.done.map((d) => d.by)).toEqual(['Matthew', 'Huishi']);
    expect(store.setDoneBy(c.id, at(2026, 9, 30, 8), 'Huishi')).toBeNull(); // no change
    expect(store.setDoneBy(c.id, 12345, 'Huishi')).toBeNull(); // no such completion
    expect(describeChange(before, after, {})).toBe('said Huishi did “Wash the bottles” (Wed, Sep 30)');
  });
});

describe('skipping', () => {
  it('lets a round go: not done, not missed, and it clears what was overdue', () => {
    // Weekly, last done two weeks back, so it's overdue on Monday Sep 28.
    const base = chore({ done: [{ at: at(2026, 9, 12), by: 'M' }] });
    expect(choreStatus(base, MON).state).toBe('overdue');
    const skipped = { ...base, skipped: [{ at: MON, by: 'Huishi' }] };
    expect(choreStatus(skipped, MON + 3600_000)).toMatchObject({ state: 'skipped', missed: 0, done: null });
    expect(choreStatus(skipped, MON + 3600_000).skipped.by).toBe('Huishi');
    expect(choreStatus(skipped, at(2026, 10, 5)).state).toBe('due'); // next week: a fresh round
    expect(choreStatus(skipped, at(2026, 10, 12)).state).toBe('overdue'); // and that one can be missed
    // Doing it anyway wins over the skip.
    expect(choreStatus({ ...skipped, done: [{ at: MON + 60_000, by: 'M' }, ...skipped.done] }, MON + 3600_000).state).toBe('done');
  });

  it('works for chores on set days and in the store, and says so', () => {
    const lunch = { id: 'w', name: 'Pack lunch', cadence: 'daily', days: [1, 2, 3, 4, 5], done: [], createdAt: at(2026, 9, 21, 9) };
    const thu = at(2026, 10, 1, 9);
    expect(choreStatus(lunch, thu).state).toBe('overdue');
    const s = { ...lunch, skipped: [{ at: thu, by: 'M' }] };
    expect(choreStatus(s, thu).state).toBe('skipped');
    expect(choreStatus(s, at(2026, 10, 2, 9)).state).toBe('due'); // Friday: the skip cleared the earlier misses
    const store = createStore({});
    const c = store.addChore({ name: 'Mow the lawn', cadence: 'weekly' });
    const after = store.skipChore(c.id, { at: MON, by: 'Matthew' });
    expect(after.skipped).toEqual([{ at: MON, by: 'Matthew' }]);
    expect(describeChange(c, after, {})).toBe('skipped “Mow the lawn” this week');
    const back = store.unskipChore(c.id, MON);
    expect(back.skipped).toEqual([]);
    expect(describeChange(after, back, {})).toBe('un-skipped “Mow the lawn”');
    expect(isQuiet({ ...c, listId: 'l' }, { ...after, listId: 'l' })).toBe(true);
  });
});


describe('duplicating', () => {
  it('copies the settings, not the history, right below the original, and says so', () => {
    let t = 1000;
    const store = createStore({ now: () => (t += 10) });
    store.addChore({ name: 'Wipe the counters', cadence: 'daily' });
    const b = store.addChore({ name: 'Pack lunch', cadence: 'daily', days: [1, 2, 3, 4, 5], times: 2, owner: 'Huishi', icon: 'x', link: 'https://forms.gle/a' });
    store.addChore({ name: 'Do the dishes', cadence: 'daily' });
    store.addChore({ name: 'Mow the lawn', cadence: 'weekly' });
    store.markChore(b.id, { at: t, by: 'Matthew' });
    store.skipChore(b.id, { at: t + 1, by: 'Matthew' });
    const copy = store.duplicateChore(b.id, { createdBy: 'Matthew' });
    expect(copy).toMatchObject({ name: 'Pack lunch (copy)', cadence: 'daily', days: [1, 2, 3, 4, 5], times: 2, owner: 'Huishi', icon: 'x', link: 'https://forms.gle/a', done: [], copiedFrom: b.id });
    expect(copy.skipped).toBeUndefined();
    expect(store.chores().filter((x) => x.cadence === 'daily').map((x) => x.name)).toEqual(['Wipe the counters', 'Pack lunch', 'Pack lunch (copy)', 'Do the dishes']);
    expect(describeChange(null, copy, {})).toBe('duplicated the chore “Pack lunch”');
    // In a list it stays in that list.
    const L = store.createList({ name: 'Me' });
    const r = store.addChore({ name: 'Practice Chinese', cadence: 'daily', listId: L.id });
    const rc = store.duplicateChore(r.id);
    expect(rc.listId).toBe(L.id);
    expect(describeChange(null, rc, { listName: () => 'Me' })).toBe('duplicated the repeating item “Practice Chinese” in Me');
    expect(store.duplicateChore('nope')).toBeNull();
  });
});
