// Housekeeping that keeps the shared data bounded:
//  - baby logs older than KEEP_LOG_DAYS are rolled into one summary per day and
//    then deleted (marked `compacted`, so the activity feed stays quiet);
//  - deletion markers older than KEEP_TOMBSTONE_DAYS are dropped from this
//    phone and the relays are asked to drop them too.
// Every phone runs this; the results are deterministic, so two phones doing
// it at once converge on the same records.
import { dayKey, dayStart, dayStats } from './baby.js';
import { dTagFor } from './sync.js';

export const KEEP_LOG_DAYS = 90;
export const KEEP_TOMBSTONE_DAYS = 60;
const DAY = 24 * 3600 * 1000;

/** Roll detailed baby logs older than `keepDays` into daily summaries. Returns how many logs were compacted. */
export function compactOldLogs(store, now = Date.now(), keepDays = KEEP_LOG_DAYS) {
  const cutoff = dayStart(dayKey(now - keepDays * DAY)); // start of the oldest day kept in detail
  const logs = store.logs();
  const old = logs.filter((l) => l.endAt != null || l.kind === 'feed').filter((l) => Math.max(l.startAt, l.endAt ?? l.startAt) < cutoff);
  if (old.length === 0) return 0;

  // Summarise every day those logs touch, from the full set of logs while they are all still here.
  const days = new Set();
  for (const l of old) {
    days.add(dayKey(l.startAt));
    if (l.endAt != null) days.add(dayKey(l.endAt));
  }
  for (const day of days) {
    if (dayStart(day) + DAY > cutoff) continue; // still within the detailed window
    const st = dayStats(logs, day, now);
    const sleeps = logs.filter((l) => l.kind === 'sleep' && dayKey(l.startAt) === day).length;
    store.setSummary(day, { feeds: st.feeds, sleepMs: st.sleepMs, sleeps });
  }
  for (const l of old) store.updateLog(l.id, { deleted: true, compacted: true });
  return old.length;
}

/** Drop deletion markers older than `keepDays` and ask the relays to forget them. Returns how many. */
export function pruneTombstones(store, sync, now = Date.now(), keepDays = KEEP_TOMBSTONE_DAYS) {
  const stale = store.tombstones(now - keepDays * DAY);
  if (stale.length === 0) return 0;
  const dTags = stale.map(dTagFor);
  for (const e of stale) store.removeLocal(e.type, e.id);
  if (sync && sync.publishDeletion) sync.publishDeletion(dTags);
  return stale.length;
}

export function runMaintenance({ store, sync, now = Date.now() }) {
  const compacted = compactOldLogs(store, now);
  const pruned = pruneTombstones(store, sync, now);
  if (compacted || pruned) console.info(`Maintenance: compacted ${compacted} logs, pruned ${pruned} deletion markers`);
  return { compacted, pruned };
}
