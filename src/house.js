// Pure helpers for the house tracker: which daily, weekly or monthly period a
// time falls in, and whether a chore is done for the current one, still due,
// or overdue because the previous period went by without it.
//
// Periods are calendar periods in local time: a day, a week starting Monday
// (so a weekend stays together), and a month.
import { iconToken } from './icons.js';

export const CADENCES = ['daily', 'weekly', 'monthly'];
export const CADENCE_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
export const HISTORY_LIMIT = 20;

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
  return n;
}

/** Start (inclusive) and end (exclusive) of the period `ts` falls in, in local time. */
export function periodBounds(cadence, ts) {
  const d = new Date(ts);
  if (cadence === 'monthly') {
    return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
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
 *  - `done`: the completion that covers the current period, if any;
 *  - `missed`: how many whole periods before this one went by without it.
 *    The period a chore was added in doesn't count against it;
 *  - `state`: 'done', 'due', or 'overdue' (not done yet and missed ≥ 1);
 *  - `daysLeft`: whole days left in the current period, counting today.
 */
export function choreStatus(chore, now = Date.now()) {
  const cadence = CADENCES.includes(chore.cadence) ? chore.cadence : 'weekly';
  const current = periodIndex(cadence, now);
  const list = doneList(chore).filter((d) => d.at <= now + 60_000);
  const last = list[0] || null;
  const done = last && periodIndex(cadence, last.at) === current ? last : null;
  const baseline = last ? periodIndex(cadence, last.at) : periodIndex(cadence, chore.createdAt || now);
  const missed = done ? 0 : Math.max(0, current - baseline - 1);
  const { end } = periodBounds(cadence, now);
  const daysLeft = Math.max(1, dayNumber(end - 1) - dayNumber(now) + 1);
  return { cadence, done, last, missed, daysLeft, state: done ? 'done' : missed > 0 ? 'overdue' : 'due' };
}

/** "Missed yesterday", "Missed 2 weeks", … */
export function missedLabel(cadence, missed) {
  if (missed <= 0) return '';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[cadence] || 'week';
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

export const DEFAULT_ICON = { daily: iconToken('broom'), weekly: iconToken('bucket'), monthly: iconToken('tools') };

/** Chores that are overdue right now, for the tab badge and the summary card. */
export function overdueChores(chores, now = Date.now()) {
  return chores.filter((c) => choreStatus(c, now).state === 'overdue');
}
