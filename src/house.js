// Pure helpers for the house tracker: which daily, weekly, two-weekly or monthly period a
// time falls in, and whether a chore is done for the current one, still due,
// or overdue because the previous period went by without it.
//
// Periods are calendar periods in local time: a day, a week starting Monday
// (so a weekend stays together), a fixed two-week block of those weeks (the
// same blocks on every phone), and a month.
import { iconToken } from './icons.js';

export const CADENCES = ['daily', 'weekly', 'biweekly', 'monthly'];
export const CADENCE_LABEL = { daily: 'Daily', weekly: 'Weekly', biweekly: '2 weeks', monthly: 'Monthly' };

/** Wording for each cadence, shared by the House tab, its sheets and the activity feed. */
export const CADENCE_TEXT = {
  daily: { section: 'Every day', add: 'Add a daily chore', often: 'daily', per: 'a day', unit: 'day', span: 'day' },
  weekly: { section: 'Every week', add: 'Add a weekly chore', often: 'weekly', per: 'a week', unit: 'week', span: 'week' },
  biweekly: { section: 'Every 2 weeks', add: 'Add a chore for every 2 weeks', often: 'every 2 weeks', per: 'every 2 weeks', unit: 'week', span: 'two weeks' },
  monthly: { section: 'Every month', add: 'Add a monthly chore', often: 'monthly', per: 'a month', unit: 'month', span: 'month' },
};
export const cadenceText = (cadence) => CADENCE_TEXT[cadence] || CADENCE_TEXT.weekly;
export const HISTORY_LIMIT = 20;
export const MAX_TIMES = 99;
/** The quick choices; any other number up to MAX_TIMES can be typed in. */
export const QUICK_TIMES = [1, 2, 3, 4];
/** How many completions a chore keeps: enough for a good few periods, bounded so each record stays small. */
export function historyLimit(chore) {
  return Math.min(HISTORY_LIMIT * timesOf(chore), 200);
}

/** How many times a chore is meant to be done each period (1 unless set). */
export function timesOf(chore) {
  const n = Math.round(Number(chore && chore.times) || 1);
  return Math.min(MAX_TIMES, Math.max(1, n));
}

const PERIOD_WORD = { daily: 'today', weekly: 'this week', biweekly: 'these two weeks', monthly: 'this month' };
export const periodWord = (cadence) => PERIOD_WORD[cadence] || 'this week';

const DAY = 24 * 3600 * 1000;

/** Local calendar day as a whole number, unaffected by daylight saving shifts. */
function dayNumber(ts) {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** Consecutive integer for the period `ts` falls in. */
export function periodIndex(cadence, ts) {
  if (cadence === 'monthly') {
    const d = new Date(ts);
    return d.getFullYear() * 12 + d.getMonth();
  }
  const n = dayNumber(ts);
  // 1970-01-01 was a Thursday; +3 makes Monday the first day of each week.
  if (cadence === 'weekly') return Math.floor((n + 3) / 7);
  if (cadence === 'biweekly') return Math.floor(Math.floor((n + 3) / 7) / 2);
  return n;
}

/** Local midnight of a day number. */
function dayStartOf(n) {
  const u = new Date(n * DAY);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime();
}

/** Start (inclusive) and end (exclusive) of the period `ts` falls in, in local time. */
export function periodBounds(cadence, ts) {
  const d = new Date(ts);
  if (cadence === 'monthly') {
    return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
  }
  if (cadence === 'biweekly') {
    const first = periodIndex('biweekly', ts) * 14 - 3; // day number of the block's first Monday
    return { start: dayStartOf(first), end: dayStartOf(first + 14) };
  }
  if (cadence === 'weekly') {
    const back = (d.getDay() + 6) % 7; // days since Monday
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return { start: start.getTime(), end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime() };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { start: start.getTime(), end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() };
}

/** Completions, newest first, ignoring anything malformed. */
export function doneList(chore) {
  return (Array.isArray(chore.done) ? chore.done : []).filter((d) => d && typeof d.at === 'number').sort((a, b) => b.at - a.at);
}

/**
 * Where a chore stands right now:
 *  - `count` of `target`: completions so far this period, and how many it takes;
 *  - `done`: once the target is reached, the latest completion this period;
 *  - `latest`: the latest completion this period, if any;
 *  - `missed`: how many whole periods before this one went by without it.
 *    The period a chore was added in doesn't count against it;
 *    Any completion this period, even one of two, means it's under way;
 *  - `state`: 'done', 'due', or 'overdue' (none yet this period and missed ≥ 1);
 *  - `daysLeft`: whole days left in the current period, counting today.
 */
export function choreStatus(chore, now = Date.now()) {
  const cadence = CADENCES.includes(chore.cadence) ? chore.cadence : 'weekly';
  const current = periodIndex(cadence, now);
  const list = doneList(chore).filter((d) => d.at <= now + 60_000);
  const last = list[0] || null;
  const target = timesOf(chore);
  const count = list.filter((d) => periodIndex(cadence, d.at) === current).length;
  const latest = count ? last : null;
  const done = count >= target ? last : null;
  const baseline = last ? periodIndex(cadence, last.at) : periodIndex(cadence, chore.createdAt || now);
  const missed = count ? 0 : Math.max(0, current - baseline - 1);
  const { end } = periodBounds(cadence, now);
  const daysLeft = Math.max(1, dayNumber(end - 1) - dayNumber(now) + 1);
  return { cadence, done, latest, last, count, target, missed, daysLeft, state: done ? 'done' : missed > 0 ? 'overdue' : 'due' };
}

/** "Missed yesterday", "Missed 2 weeks", … */
export function missedLabel(cadence, missed) {
  if (missed <= 0) return '';
  if (cadence === 'biweekly') return missed === 1 ? 'Missed the last 2 weeks' : `Missed ${missed * 2} weeks`;
  const { unit } = cadenceText(cadence);
  if (missed === 1) return cadence === 'daily' ? 'Missed yesterday' : `Missed last ${unit}`;
  return `Missed ${missed} ${unit}s`;
}

/** Short date for a completion relative to now: "9:14 AM", "Yesterday", "Sat", "Sep 3". */
export function whenLabel(ts, now = Date.now()) {
  const diff = dayNumber(now) - dayNumber(ts);
  if (diff === 0) return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Date(ts).toLocaleDateString([], { weekday: 'short' });
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** How much of the current period is left, as a hint for chores still to do. */
export function dueLabel(status) {
  const { cadence, daysLeft } = status;
  if (cadence === 'daily') return 'Due today';
  if (daysLeft <= 1) return 'Due by tonight';
  if (cadence === 'biweekly') return `${daysLeft} days left`;
  return `${daysLeft} days left this ${cadence === 'weekly' ? 'week' : 'month'}`;
}

/** The chores a family starts with. Fixed ids, so two phones setting them up at once end up with one set. */
export const STARTER_CHORES = [
  { id: 'starter-counters', name: 'Wipe the counters', cadence: 'daily', icon: iconToken('sponge') },
  { id: 'starter-dishes', name: 'Do the dishes', cadence: 'daily', icon: iconToken('plate') },
  { id: 'starter-mow', name: 'Mow the lawn', cadence: 'weekly', icon: iconToken('clover') },
  { id: 'starter-litter', name: 'Change the cat litter', cadence: 'weekly', icon: iconToken('cat') },
  { id: 'starter-water-heater', name: 'Drain a gallon from the water heater', cadence: 'monthly', icon: iconToken('droplet') },
];

export const DEFAULT_ICON = { daily: iconToken('broom'), weekly: iconToken('bucket'), biweekly: iconToken('soap'), monthly: iconToken('tools') };

/** Chores that are overdue right now, for the tab badge and the summary card. */
export function overdueChores(chores, now = Date.now()) {
  return chores.filter((c) => choreStatus(c, now).state === 'overdue');
}
