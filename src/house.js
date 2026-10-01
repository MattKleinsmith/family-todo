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

// ---- Days of the week, for chores that only come up on some days ----
// `days` holds weekday numbers as Date#getDay gives them (0 Sunday … 6 Saturday).
// Missing, empty or all seven means no particular days. Daily and weekly
// chores can have them, and then they work the same way: the chore comes up on
// those days ("every Wednesday" is weekly on Wednesday, "weekdays" is daily on
// Monday to Friday), each of those days is its own period, and only those days
// can be missed. Everything else about a chore (lists, House, history, times)
// is the same either way.
export const DAY_CADENCES = ['daily', 'weekly'];

/** Monday first, the way the app's weeks run. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKENDS = [0, 6];

/** Sorted, de-duplicated weekday numbers, or null for every day. */
export function normalizeDays(days) {
  if (!Array.isArray(days)) return null;
  const set = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return set.length === 0 || set.length === 7 ? null : set;
}

/** The days a chore comes up on, or null if it has no particular days. */
export function daysOf(chore) {
  return chore && DAY_CADENCES.includes(chore.cadence) ? normalizeDays(chore.days) : null;
}

/** The period a chore's counting runs on: a day for one on set days, otherwise its cadence. */
export function periodCadence(chore) {
  if (daysOf(chore)) return 'daily';
  return CADENCES.includes(chore && chore.cadence) ? chore.cadence : 'weekly';
}

/** "Every day", "Weekdays", "Weekends", "Wednesdays", or "Mon, Wed". */
export function daysLabel(days) {
  const d = normalizeDays(days);
  if (!d) return 'Every day';
  if (d.join() === WEEKDAYS.join()) return 'Weekdays';
  if (d.join() === WEEKENDS.join()) return 'Weekends';
  if (d.length === 1) return `${DAY_LONG[d[0]]}s`;
  return WEEK_ORDER.filter((x) => d.includes(x)).map((x) => DAY_SHORT[x]).join(', ');
}

/** How often, in a sentence: "daily", "weekly", "on weekdays", "on Mon, Wed". */
export function repeatsText(chore) {
  const d = daysOf(chore);
  if (!d) return cadenceText(chore.cadence).often;
  const label = daysLabel(d);
  return `on ${label === 'Weekdays' || label === 'Weekends' ? label.toLowerCase() : label}`;
}

const weekdayOfDay = (n) => new Date(n * DAY).getUTCDay();

/** Completions, newest first, ignoring anything malformed. */
export function doneList(chore) {
  return (Array.isArray(chore.done) ? chore.done : []).filter((d) => d && typeof d.at === 'number').sort((a, b) => b.at - a.at);
}

/**
 * Where a chore stands right now:
 *  - `count` of `target`: completions so far this period, and how many it takes;
 *  - `done`: once the target is reached, the latest completion this period;
 *  - `latest`: the latest completion this period, if any;
 *  - `missed`: how many periods before this one went by without it,
 *    including the one it was added in unless it was added on its last day;
 *    Any completion this period, even one of two, means it's under way;
 *  - `state`: 'done', 'due', or 'overdue' (none yet this period and missed ≥ 1);
 *  - `daysLeft`: whole days left in the current period, counting today.
 */
export function choreStatus(chore, now = Date.now()) {
  // `cadence` is what the family picked (and which House section it's in);
  // `period` is what the counting runs on, a day for a chore on set days.
  const cadence = CADENCES.includes(chore.cadence) ? chore.cadence : 'weekly';
  const days = daysOf(chore);
  const period = periodCadence(chore);
  const current = periodIndex(period, now);
  const list = doneList(chore).filter((d) => d.at <= now + 60_000);
  const last = list[0] || null;
  const target = timesOf(chore);
  const count = list.filter((d) => periodIndex(period, d.at) === current).length;
  const latest = count ? last : null;
  const done = count >= target ? last : null;
  // Before it's ever done, the period it was added in counts too (a monthly
  // chore added in September and not done by October is overdue), unless it
  // was added on that period's last day: no time left to do it.
  const created = chore.createdAt || now;
  const addedOnLastDay = dayNumber(periodBounds(period, created).end - 1) === dayNumber(created);
  const baseline = last ? periodIndex(period, last.at) : periodIndex(period, created) - (addedOnLastDay ? 0 : 1);
  const { end } = periodBounds(period, now);
  const daysLeft = Math.max(1, dayNumber(end - 1) - dayNumber(now) + 1);
  if (!days) {
    const missed = count ? 0 : Math.max(0, current - baseline - 1);
    return { cadence, period, days, done, latest, last, count, target, missed, daysLeft, state: done ? 'done' : missed > 0 ? 'overdue' : 'due' };
  }
  // Only some days: a day it isn't on is a day off, and only its own days can be missed.
  const today = days.includes(weekdayOfDay(current));
  let missed = 0;
  let lastMissed = null;
  if (today && !count) {
    for (let n = Math.max(baseline + 1, current - 400); n < current; n++) {
      if (days.includes(weekdayOfDay(n))) {
        missed++;
        lastMissed = n;
      }
    }
  }
  let next = current + 1;
  while (!days.includes(weekdayOfDay(next))) next++;
  return {
    cadence,
    period,
    days,
    done,
    latest,
    last,
    count,
    target,
    missed,
    daysLeft,
    // When the last missed day was, so it can be named ("Missed Friday").
    missedDay: lastMissed === null ? null : dayStartOf(lastMissed),
    // The next day it comes up, for a day off ("Next Monday").
    nextDay: dayStartOf(next),
    state: done ? 'done' : !today ? 'off' : missed > 0 ? 'overdue' : 'due',
  };
}

/** "Missed yesterday", "Missed 2 weeks", "Missed Friday" (for one that's only on some days), … */
export function missedLabel(cadence, missed, missedDay = null, now = Date.now()) {
  if (missed <= 0) return '';
  if (missedDay !== null) {
    if (missed > 1) return `Missed ${missed} days`;
    return dayNumber(now) - dayNumber(missedDay) === 1 ? 'Missed yesterday' : `Missed ${DAY_LONG[new Date(missedDay).getDay()]}`;
  }
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

/** For a day off, when it's back: "back tomorrow", "back Monday". */
export function nextDayLabel(nextDay, now = Date.now()) {
  const diff = dayNumber(nextDay) - dayNumber(now);
  return diff === 1 ? 'back tomorrow' : `back ${DAY_LONG[new Date(nextDay).getDay()]}`;
}

/** How much of the current period is left, as a hint for chores still to do. */
export function dueLabel(status) {
  const { cadence, daysLeft } = status;
  if (cadence === 'daily' || status.days) return 'Due today';
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
