// Pure helpers for the baby tracker: what state he's in right now, per-day
// totals, and time formatting. Kept free of UI so they can be unit tested.

export const DEFAULT_FEED_INTERVAL_MIN = 180;
export const DEFAULT_NAP_AFTER_FEED_MIN = 120;

const MIN = 60_000;
const HOUR = 60 * MIN;

export function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.round(ms / MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Local calendar day, e.g. "2026-09-27". */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function dayLabel(key, now = Date.now()) {
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now - 24 * HOUR)) return 'Yesterday';
  return new Date(dayStart(key)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** The sleep that's still running, if any. With two, the earliest started wins; the other is a stray to fix. */
export function ongoingSleep(logs) {
  const open = logs.filter((l) => l.kind === 'sleep' && l.endAt == null);
  if (open.length === 0) return null;
  return open.reduce((a, b) => (a.startAt <= b.startAt ? a : b));
}

/** What's going on right now. `logs` are non-deleted, newest first. */
export function currentState(logs, now = Date.now()) {
  const asleep = ongoingSleep(logs);
  const lastFeed = logs.find((l) => l.kind === 'feed' && l.startAt <= now) || null;
  const lastFinishedSleep =
    logs.filter((l) => l.kind === 'sleep' && l.endAt != null && l.endAt <= now).sort((a, b) => b.endAt - a.endAt)[0] || null;
  return {
    asleep,
    awakeSince: asleep ? null : lastFinishedSleep ? lastFinishedSleep.endAt : null,
    lastFeed,
    lastSleep: lastFinishedSleep,
  };
}

/** Sleep time and feed count that fall inside a calendar day. Sleeps are clipped to the day; a running sleep is clipped to now. */
export function dayStats(logs, key, now = Date.now()) {
  const start = dayStart(key);
  const end = start + 24 * HOUR;
  let feeds = 0;
  let sleepMs = 0;
  for (const l of logs) {
    if (l.kind === 'feed') {
      if (l.startAt >= start && l.startAt < end) feeds++;
    } else if (l.kind === 'sleep') {
      const s = Math.max(l.startAt, start);
      const e = Math.min(l.endAt == null ? now : l.endAt, end);
      if (e > s) sleepMs += e - s;
    }
  }
  return { feeds, sleepMs };
}

export function nextFeedAt(lastFeed, intervalMin = DEFAULT_FEED_INTERVAL_MIN) {
  return lastFeed ? lastFeed.startAt + intervalMin * MIN : null;
}

/**
 * The next nap is due `afterFeedMin` after the last feed started. Nothing is
 * due while he's asleep, or once he has already napped since that feed; the
 * next feed starts the next countdown.
 */
export function nextNapAt(state, afterFeedMin = DEFAULT_NAP_AFTER_FEED_MIN) {
  if (state.asleep || !state.lastFeed) return null;
  if (state.lastSleep && state.lastSleep.startAt >= state.lastFeed.startAt) return null;
  return state.lastFeed.startAt + afterFeedMin * MIN;
}

/** "in 45m" / "20m ago" / "now" for a target timestamp. */
export function relative(ts, now = Date.now()) {
  const diff = ts - now;
  if (Math.abs(diff) < MIN) return 'now';
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
}

/** datetime-local <input> needs "YYYY-MM-DDTHH:MM" in local time. */
export function toInputValue(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromInputValue(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Group newest-first logs by local day, preserving order. */
export function groupByDay(logs) {
  const groups = [];
  let current = null;
  for (const l of logs) {
    const key = dayKey(l.startAt);
    if (!current || current.key !== key) {
      current = { key, logs: [] };
      groups.push(current);
    }
    current.logs.push(l);
  }
  return groups;
}

/**
 * How to show the time until something is due, for the big countdowns at the
 * top of the baby tab: `lead` sits above `value` in small type, `note` below.
 * `state` is 'later', 'soon' (within 15 minutes), 'due' (now) or 'late'.
 */
export function countdown(target, now = Date.now()) {
  if (target == null) return null;
  const diff = target - now;
  const at = formatTime(target);
  if (diff >= MIN) return { lead: 'in', value: formatDuration(diff), note: `~${at}`, state: diff <= 15 * MIN ? 'soon' : 'later' };
  if (diff > -MIN) return { lead: 'due', value: 'Now', note: `~${at}`, state: 'due' };
  return { lead: 'overdue by', value: formatDuration(-diff), note: `was due ${at}`, state: 'late' };
}

/**
 * A feed means he's awake. If a sleep is still running and began before a
 * feed at `at`, that's the sleep the feed ends (someone forgot to tap
 * "Woke up"). Null otherwise.
 */
export function sleepEndedByFeed(logs, at) {
  const s = ongoingSleep(logs);
  return s && s.startAt < at ? s : null;
}

/**
 * When a feed that ended a nap is moved, the nap's end moves with it, as long
 * as it still reads as the moment he woke (not before he fell asleep).
 */
export function followFeedMove(sleep, feed, newStartAt) {
  if (!sleep || sleep.endedByFeed !== feed.id || sleep.endAt !== feed.startAt) return null;
  return newStartAt > sleep.startAt ? newStartAt : null;
}
