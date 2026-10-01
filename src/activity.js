// The activity feed: a plain-language record of what changed.
//
// The phone that makes a change writes the entry (it knows exactly what the
// record looked like before) and syncs it like any other data, so every phone,
// including one that joins later, sees the whole history. Entries are grouped
// into small chunks, one series per phone per day, ACTIVITY_CHUNK entries each,
// so the relays see a handful of records a day rather than one per tap.
//
// What you've already seen is per phone: a single "seen up to" time, kept locally.
import { formatTime, formatDuration } from './baby.js';
import { cadenceText, daysOf, periodCadence, periodIndex, periodWord, repeatsText, timesOf } from './house.js';
import { iconToText } from './icons.js';
import { memberKey, sameName } from './members.js';
import { linkLabel } from './links.js';

const MAX_ENTRIES = 500;

const q = (s) => `“${s}”`;
const possessive = (s) => `${s}’${/s$/i.test(s) ? '' : 's'}`;
const joinParts = (parts) => (parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Describe the change from `prev` (what we had, or null) to `next`. Returns null when nothing worth telling changed. */
/** "added a link to “Daily form” (docs.google.com)", "changed …", "removed …". */
function linkChange(prev, next, name) {
  if (!next.link) return `removed the link from ${q(name)}`;
  const site = linkLabel(next.link);
  return `${prev.link ? 'changed the link on' : 'added a link to'} ${q(name)}${site ? ` (${site})` : ''}`;
}

export function describeChange(prev, next, ctx = {}) {
  if (next.type === 'summary' || next.type === 'activity' || next.compacted) return null; // housekeeping, not news
  const listName = (id) => ctx.listName?.(id) || 'a list';
  const baby = ctx.babyName || 'the baby';
  switch (next.type) {
    case 'item': {
      const where = `in ${listName(next.listId)}`;
      if (!prev && next.fromChore && !next.deleted) return `stopped repeating ${q(next.text)} ${where}`;
      if (!prev) return next.deleted ? null : `added ${q(next.text)} ${where}`;
      if (next.convertedTo) return null; // it became a repeating item; that record tells the story
      if (next.moveBatch && next.moveBatch !== prev.moveBatch) return null; // part of moving a whole list; the list says so once
      if (next.deleted && !prev.deleted) return `removed ${q(prev.text)} from ${listName(next.listId)}`;
      if (prev.deleted && !next.deleted) return `put back ${q(next.text)} in ${listName(next.listId)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.text !== prev.text) parts.push(`renamed ${q(prev.text)} to ${q(next.text)}`);
      if (next.done !== prev.done) parts.push(`${next.done ? 'checked off' : 'unchecked'} ${q(next.text)}`);
      if ((next.link || '') !== (prev.link || '')) parts.push(linkChange(prev, next, next.text));
      if (next.listId !== prev.listId) parts.push(`moved ${q(next.text)} to ${listName(next.listId)}`);
      else if (next.order !== prev.order && !next.renumbered) parts.push(`reordered ${q(next.text)}`);
      if (parts.length === 0) return null;
      return `${joinParts(parts)} ${where}`;
    }
    case 'list': {
      const label = (l) => `${l.emoji ? iconToText(l.emoji) + ' ' : ''}${l.name}`;
      if (!prev) return next.deleted ? null : `created the list ${label(next)}`;
      if (next.deleted && !prev.deleted) return `deleted the list ${label(prev)}`;
      if (prev.deleted && !next.deleted) return `put back the list ${label(next)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.moveNote && next.moveNote.id !== prev.moveNote?.id) parts.push(next.moveNote.text);
      if (next.name !== prev.name) parts.push(`renamed the list ${q(prev.name)} to ${q(next.name)}`);
      if ((next.emoji || '') !== (prev.emoji || '')) parts.push(`changed ${possessive(next.name)} icon to ${next.emoji ? iconToText(next.emoji) : 'none'}`);
      if (next.order !== prev.order && !next.renumbered) parts.push(`reordered the list ${q(next.name)}`);
      return parts.length ? joinParts(parts) : null;
    }
    case 'log': {
      const kind = (l) => (l.kind === 'feed' ? 'feed' : 'sleep');
      if (!prev) {
        if (next.deleted) return null;
        if (next.kind === 'feed') return `logged a feed at ${formatTime(next.startAt)}${next.note ? ` (${next.note})` : ''}`;
        if (next.endAt == null) return next.night ? `logged ${baby} going down for the night at ${formatTime(next.startAt)}` : `logged ${baby} falling asleep at ${formatTime(next.startAt)}`;
        return `logged ${baby} sleeping ${formatTime(next.startAt)} – ${formatTime(next.endAt)} (${formatDuration(next.endAt - next.startAt)})`;
      }
      if (next.deleted && !prev.deleted) return `removed the ${formatTime(prev.startAt)} ${kind(prev)}`;
      if (prev.deleted && !next.deleted) return `put back the ${formatTime(next.startAt)} ${kind(next)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.kind !== prev.kind) parts.push(`changed the ${formatTime(prev.startAt)} ${kind(prev)} to a ${kind(next)}`);
      if (next.kind === 'sleep' && prev.endAt == null && next.endAt != null)
        parts.push(`logged ${baby} waking up at ${formatTime(next.endAt)} (slept ${formatDuration(next.endAt - next.startAt)})`);
      else if (next.kind === 'sleep' && prev.endAt != null && next.endAt == null) parts.push(`marked the ${formatTime(next.startAt)} sleep as still going`);
      else if (next.kind === 'sleep' && prev.endAt != null && next.endAt !== prev.endAt)
        parts.push(`changed the ${formatTime(next.startAt)} sleep’s end to ${formatTime(next.endAt)}`);
      if (next.kind === 'sleep' && !!next.night !== !!prev.night) parts.push(next.night ? `made the ${formatTime(next.startAt)} sleep his night sleep` : `made the ${formatTime(next.startAt)} sleep a nap`);
      if (next.startAt !== prev.startAt) parts.push(`moved the ${formatTime(prev.startAt)} ${kind(next)} to ${formatTime(next.startAt)}`);
      if ((next.note || '') !== (prev.note || ''))
        parts.push(next.note ? `noted ${q(next.note)} on the ${formatTime(next.startAt)} ${kind(next)}` : `cleared the note on the ${formatTime(next.startAt)} ${kind(next)}`);
      return parts.length ? joinParts(parts) : null;
    }
    case 'meta': {
      if (next.id !== 'baby') return null;
      const parts = [];
      const p = prev || {};
      if ((next.name || '') !== (p.name || '')) parts.push(next.name ? `named the baby ${next.name}` : 'cleared the baby’s name');
      const every = (m) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
      // Unset intervals mean the default, so saving the defaults for the first time isn't a change.
      const DEFAULT = 180;
      if ((next.feedIntervalMin || DEFAULT) !== (p.feedIntervalMin || DEFAULT)) parts.push(`set feeds to about every ${every(next.feedIntervalMin || DEFAULT)}`);
      const NAP_DEFAULT = 120;
      if ((next.napAfterFeedMin || NAP_DEFAULT) !== (p.napAfterFeedMin || NAP_DEFAULT))
        parts.push(`set naps to about ${every(next.napAfterFeedMin || NAP_DEFAULT)} after a feed`);
      const bed = (m) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if ((next.bedtimeMin ?? 1260) !== (p.bedtimeMin ?? 1260)) parts.push(`set night sleep to start after ${bed(next.bedtimeMin ?? 1260)}`);
      if ((next.nightAfterFeed ?? 5) !== (p.nightAfterFeed ?? 5))
        parts.push(next.nightAfterFeed ? `set night sleep to start after ${next.nightAfterFeed} feeds in the evening` : 'stopped using the feed count for night sleep');
      return parts.length ? joinParts(parts) : null;
    }
    case 'chore': {
      const often = (c) => repeatsText(c);
      // Repeating items that live in a list read like list items, and say which list.
      const inList = !!next.listId;
      const where = inList ? ` in ${listName(next.listId)}` : '';
      const noun = inList ? 'the repeating item' : 'the chore';
      const addedAs = (c) =>
        inList
          ? `added ${q(c.name)} to ${listName(c.listId)}, repeating ${often(c)}`
          : c.cadence === 'biweekly'
            ? `added the chore ${q(c.name)} (every 2 weeks)`
            : daysOf(c)
              ? `added the chore ${q(c.name)} (${often(c).replace(/^on /, '')})`
              : `added the ${often(c)} chore ${q(c.name)}`;
      if (!prev && next.fromItem && !next.deleted) return `made ${q(next.name)} repeat ${often(next)}${where}`;
      if (!prev) return next.deleted || next.starter ? null : `${addedAs(next)}${next.owner ? ` for ${next.owner}` : ''}`;
      if (next.convertedTo) return null; // turned back into a one-off item; that record tells the story
      if (next.moveBatch && next.moveBatch !== prev.moveBatch) return null; // part of moving a whole list
      if (next.deleted && !prev.deleted) return `removed ${noun} ${q(prev.name)}${inList ? ` from ${listName(next.listId)}` : ''}`;
      if (prev.deleted && !next.deleted) return `put back ${noun} ${q(next.name)}${where}`;
      if (next.deleted) return null;
      const parts = [];
      const had = new Set((prev.done || []).map((d) => d.at));
      const has = new Set((next.done || []).map((d) => d.at));
      const added = (next.done || []).filter((d) => !had.has(d.at)).sort((a, b) => b.at - a.at);
      const removed = (prev.done || []).filter((d) => !has.has(d.at));
      for (const d of added) {
        // Ticked off now, or filled in afterwards for an earlier day.
        // Chores done several times a period say which time this was.
        const target = timesOf(next);
        const cad = periodCadence(next);
        const nth = (next.done || []).filter((x) => x.at <= d.at && periodIndex(cad, x.at) === periodIndex(cad, d.at)).length;
        const of = target > 1 ? ` (${nth} of ${target} ${periodWord(cad)})` : '';
        if (next.updatedAt - d.at < 3600_000) parts.push(`checked off ${q(next.name)}${of}`);
        else parts.push(`marked ${q(next.name)} done on ${new Date(d.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`);
      }
      // Only the history cap trimming the oldest entry isn't news.
      const trimmed = added.length > 0 && removed.length === 1 && (prev.done || []).length >= 20 && removed[0].at === Math.min(...(prev.done || []).map((d) => d.at));
      if (removed.length && !trimmed) parts.push(`unchecked ${q(next.name)}`);
      // Same completion, someone else did it.
      const byAt = new Map((prev.done || []).map((d) => [d.at, d.by || '']));
      for (const d of next.done || []) {
        if (!byAt.has(d.at) || byAt.get(d.at) === (d.by || '')) continue;
        const day = new Date(d.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        parts.push(d.by ? `said ${d.by} did ${q(next.name)} (${day})` : `cleared who did ${q(next.name)} (${day})`);
      }
      if (next.name !== prev.name) parts.push(`renamed ${noun} ${q(prev.name)} to ${q(next.name)}`);
      const onDays = (c) => (daysOf(c) ? often(c).replace(/^on /, '') : 'every day');
      if (next.cadence !== prev.cadence) parts.push(`made ${q(next.name)} ${cadenceText(next.cadence).often}${daysOf(next) ? ` (${onDays(next)})` : ''}`);
      else if ((daysOf(next) || []).join() !== (daysOf(prev) || []).join()) parts.push(`set ${q(next.name)} to ${onDays(next)}`);
      if (timesOf(next) !== timesOf(prev)) {
        const { per } = cadenceText(next.cadence);
        parts.push(timesOf(next) === 1 ? `set ${q(next.name)} to once ${per}` : `set ${q(next.name)} to ${timesOf(next)} times ${per}`);
      }
      if ((next.owner || '') !== (prev.owner || ''))
        parts.push(
          !next.owner
            ? `made ${q(next.name)} anyone’s job`
            : sameName(next.owner, next.updatedBy)
              ? `took on ${q(next.name)}`
              : `gave ${q(next.name)} to ${next.owner}`,
        );
      if ((next.link || '') !== (prev.link || '')) parts.push(linkChange(prev, next, next.name));
      if ((next.icon || '') !== (prev.icon || '')) parts.push(`changed ${possessive(next.name)} icon to ${next.icon ? iconToText(next.icon) : 'none'}`);
      if (next.order !== prev.order && !next.renumbered) parts.push(`reordered ${noun} ${q(next.name)}`);
      return parts.length ? `${joinParts(parts)}${where}` : null;
    }
    case 'member': {
      const dev = next.device ? ` on ${/^[aeiou]/i.test(next.device) ? 'an' : 'a'} ${next.device}` : '';
      if (!prev) return next.leftAt || next.backfilled ? null : ctx.knownPerson ? `started using the app${dev}` : `joined the family${dev}`;
      if (next.leftAt && !prev.leftAt) return `left the family${dev}`;
      if (!next.leftAt && prev.leftAt) return `rejoined the family${dev}`;
      if (next.name !== prev.name && prev.name) return `changed their name from ${prev.name} to ${next.name}`;
      return null;
    }
    default:
      return null;
  }
}

/** Which screen shows the thing an entry is about, so looking at that screen counts as seeing it. */
export function areaOf(e) {
  if (e.listId) return `list:${e.listId}`;
  if (e.entityType === 'chore') return 'house';
  if (e.entityType === 'log' || (e.entityType === 'meta' && e.entityId === 'baby')) return 'baby';
  return null;
}

/**
 * Ticking off a repeating item in a list (someone's own habit, say) is shown
 * in the feed but isn't news for everyone's bell. Anything else about it
 * (adding, renaming, removing) is.
 */
export function isQuiet(prev, next) {
  if (!prev || next.type !== 'chore' || !next.listId || next.deleted) return false;
  const skip = new Set(['done', 'updatedAt', 'updatedBy']);
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) if (!skip.has(k) && JSON.stringify(prev[k]) !== JSON.stringify(next[k])) return false;
  return true;
}

export function actorOf(entity) {
  return entity.updatedBy || entity.createdBy || 'Someone';
}

export const ACTIVITY_CHUNK = 20;
const FLUSH_MS = 1200;

const bucketId = (device, day, chunk) => `act:${device}:${day}:${chunk}`;
const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const strip = (e) => ({ id: e.id, at: e.at, actor: e.actor, text: e.text, entityType: e.entityType, entityId: e.entityId, listId: e.listId ?? null });

export function createActivity({
  store,
  storageKey,
  storage = globalThis.localStorage,
  prefs = globalThis.localStorage,
  device = () => '',
  since = () => 0,
  self = () => '',
  flushMs = FLUSH_MS,
  notes = [], // "What's new" notes that ship with the app: { id, at (ISO), text, href? }
}) {
  const listeners = new Set();
  let pending = []; // written here, not yet in a chunk
  let legacy = []; // other people's entries from the old local-only feed, kept for display
  let lastSeenAt = null;
  let areaSeen = {}; // area -> seen up to, from looking at that list or tab
  let notesSeenUpTo = null; // newest "What's new" note already seen on this phone
  const noteEntries = notes
    .map((n) => ({ id: `note:${n.id}`, at: Date.parse(n.at), actor: 'What’s new', text: n.text, href: n.href || null, entityType: 'note', entityId: n.id, listId: null, system: true }))
    .filter((n) => Number.isFinite(n.at));
  let flushTimer = null;
  let saveTimer = null;
  let loaded = false;
  let needsSave = false;
  let version = 0;
  let cache = null;
  let cacheVersion = -1;

  const showMineKey = storageKey ? `${storageKey}:showMine` : null;
  let showMine = false;
  try {
    showMine = !!(prefs && showMineKey && prefs.getItem(showMineKey) === '1');
  } catch {
    showMine = false;
  }

  const notify = () => {
    version++;
    for (const fn of listeners) fn();
  };
  const seenAt = () => (lastSeenAt == null ? since() || 0 : lastSeenAt);

  // ---- local state: seen-up-to time, and the old feed if upgrading ----

  function applyLoaded(raw) {
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed)) {
      // Upgrading from the local-only feed: share this phone's own history,
      // keep other people's entries for display, and carry over what was seen.
      const unseen = parsed.filter((e) => e && !e.seen && !e.mine);
      lastSeenAt = unseen.length ? Math.min(...unseen.map((e) => e.at)) - 1 : parsed.reduce((m, e) => Math.max(m, e.at || 0), 0);
      legacy = parsed.filter((e) => e && !e.mine).map(strip);
      const mine = parsed.filter((e) => e && e.mine).map((e) => ({ ...strip(e), device: device() }));
      if (mine.length) {
        pending.push(...mine);
        scheduleFlush();
      }
      needsSave = true;
    } else if (parsed && typeof parsed === 'object') {
      if (typeof parsed.lastSeenAt === 'number') lastSeenAt = parsed.lastSeenAt;
      if (Array.isArray(parsed.legacy)) legacy = parsed.legacy;
      if (parsed.areaSeen && typeof parsed.areaSeen === 'object') areaSeen = parsed.areaSeen;
      if (typeof parsed.notesSeenUpTo === 'number') notesSeenUpTo = parsed.notesSeenUpTo;
    }
  }

  function save() {
    if (!storage || !storageKey) return;
    if (!loaded) {
      needsSave = true;
      return;
    }
    needsSave = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        // Anything the overall "seen up to" already covers needn't be kept per area.
        for (const [k, t] of Object.entries(areaSeen)) if (t <= (lastSeenAt || 0)) delete areaSeen[k];
        const r = storage.setItem(storageKey, JSON.stringify({ v: 2, lastSeenAt, legacy, areaSeen, notesSeenUpTo }));
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        /* ignore */
      }
    }, 100);
  }

  function finishLoad() {
    loaded = true;
    if (lastSeenAt == null) {
      // A phone that just joined has seen nothing, but history from before it
      // joined isn't news: it's shown, just not counted.
      lastSeenAt = since() || Date.now();
      needsSave = true;
    }
    if (notesSeenUpTo == null) {
      // Notes from before you joined aren't news; ones since then are, once.
      notesSeenUpTo = since() || Date.now();
      needsSave = true;
    }
    if (needsSave) save();
    notify();
  }

  const ready = (() => {
    if (!storage || !storageKey) {
      finishLoad();
      return Promise.resolve();
    }
    let raw;
    try {
      raw = storage.getItem(storageKey);
    } catch {
      finishLoad();
      return Promise.resolve();
    }
    if (!raw || typeof raw.then !== 'function') {
      applyLoaded(raw);
      finishLoad();
      return Promise.resolve();
    }
    return raw
      .then((value) => {
        if (value == null && prefs && prefs.getItem(storageKey)) {
          applyLoaded(prefs.getItem(storageKey));
          try {
            prefs.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        } else applyLoaded(value);
      })
      .catch(() => {})
      .then(finishLoad);
  })();

  // ---- writing: entries for changes made on this phone ----

  const ctx = {
    listName: (id) => store.getEntity('list', id)?.name,
    babyName: () => store.getMeta('baby')?.name,
  };

  function record(prev, next) {
    // Re-adding the app makes a new member record for the same person on the
    // same kind of device. That's a reinstall, not someone joining.
    let knownPerson = false;
    if (next.type === 'member' && !prev) {
      const others = store.members().filter((m) => m.id !== next.id);
      if (others.some((m) => memberKey(m) === memberKey(next))) return;
      // Same name, new kind of device: the same person on their laptop, not someone new.
      knownPerson = others.some((m) => !m.leftAt && sameName(m.name, next.name));
    }
    const text = describeChange(prev, next, { listName: ctx.listName, babyName: ctx.babyName(), knownPerson });
    if (!text) return;
    pending.push({
      id: `${next.id}:${next.updatedAt}`,
      at: next.updatedAt,
      actor: actorOf(next),
      device: device(),
      text,
      entityType: next.type,
      entityId: next.id,
      listId: next.type === 'item' || next.type === 'chore' ? next.listId || null : next.type === 'list' ? next.id : null,
      ...(isQuiet(prev, next) ? { quiet: true } : {}),
    });
    notify();
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      Promise.resolve(store.ready).then(flush);
    }, flushMs);
  }

  /** Move pending entries into this phone's chunks for their day and publish the chunks that changed. */
  function flush() {
    if (!pending.length) return;
    const dev = device();
    const batch = pending.sort((a, b) => a.at - b.at);
    pending = [];
    const byDay = new Map();
    for (const e of batch) {
      const day = localDay(e.at);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(e);
    }
    for (const [day, list] of byDay) {
      let chunk = 0;
      while (store.getEntity('activity', bucketId(dev, day, chunk + 1))) chunk++;
      let current = store.getEntity('activity', bucketId(dev, day, chunk));
      let entries = current ? [...(current.entries || [])] : [];
      let dirty = false;
      const write = () => {
        if (!dirty) return;
        store.putLocal({
          id: bucketId(dev, day, chunk),
          type: 'activity',
          device: dev,
          day,
          chunk,
          entries,
          createdAt: current?.createdAt || Date.now(),
          deleted: false,
        });
        dirty = false;
      };
      for (const e of list) {
        if (entries.some((x) => x.id === e.id)) continue;
        if (entries.length >= ACTIVITY_CHUNK) {
          write();
          chunk++;
          current = null;
          entries = [];
        }
        entries.push(e);
        dirty = true;
      }
      write();
    }
  }

  const unsubLocal = store.onLocalChange((next, prev) => record(prev || null, next));
  const unsubStore = store.subscribe(() => version++);

  // ---- reading ----

  // Yours if it came from this device, or from any device of yours (same name
  // = same person): your Mac's changes don't light up your phone's bell.
  const isMine = (e) => (!!e.device && e.device === device()) || (!!self() && sameName(e.actor, self()));

  function entries() {
    if (cache && cacheVersion === version) return cache;
    const seen = new Set();
    const out = [];
    const cut = seenAt();
    const add = (e, mineOverride) => {
      if (!e || !e.id || seen.has(e.id)) return;
      seen.add(e.id);
      const mine = mineOverride ?? isMine(e);
      const area = areaOf(e);
      out.push({ ...e, mine, seen: mine || !!e.quiet || e.at <= cut || (area != null && e.at <= (areaSeen[area] || 0)) });
    };
    for (const b of store.activityBuckets()) for (const e of b.entries || []) add(e);
    for (const e of pending) add(e);
    for (const e of legacy) add(e, false);
    // Notes about changes from before this phone joined mean nothing to it.
    const joined = since() || 0;
    for (const n of noteEntries) {
      if (seen.has(n.id) || n.at < joined) continue;
      seen.add(n.id);
      out.push({ ...n, mine: false, seen: n.at <= (notesSeenUpTo ?? Infinity) });
    }
    out.sort((a, b) => b.at - a.at);
    // Hide repeat "joined the family" lines left by earlier reinstalls; keep the first.
    const joins = new Set();
    for (let i = out.length - 1; i >= 0; i--) {
      const e = out[i];
      if (e.entityType !== 'member' || !/^(re)?joined the family/.test(e.text)) continue;
      const key = `${(e.actor || '').trim().toLowerCase()}|${e.text.replace(/^rejoined/, 'joined')}`;
      if (joins.has(key)) out.splice(i, 1);
      else joins.add(key);
    }
    cache = out;
    cacheVersion = version;
    return out;
  }

  return {
    ready,
    entries,
    visibleEntries: () => (showMine ? entries() : entries().filter((e) => !e.mine)),
    showMine: () => showMine,
    setShowMine(v) {
      showMine = !!v;
      try {
        prefs && showMineKey && prefs.setItem(showMineKey, showMine ? '1' : '0');
      } catch {
        /* ignore */
      }
      notify();
    },
    unseenCount: () => entries().reduce((n, e) => n + (e.seen ? 0 : 1), 0),
    unseenForList: (listId) => entries().reduce((n, e) => n + (!e.seen && e.listId === listId ? 1 : 0), 0),
    unseenForArea: (area) => entries().reduce((n, e) => n + (!e.seen && areaOf(e) === area ? 1 : 0), 0),
    /**
     * You're looking at this list or tab: everything shown there counts as
     * seen. `shownUpTo` is the newest change on screen, so an entry that only
     * arrives after you've looked (entries trail their change by a moment)
     * still counts as seen.
     */
    markAreaSeen(area, shownUpTo = 0) {
      if (!area) return;
      const latest = entries().reduce((m, e) => (areaOf(e) === area ? Math.max(m, e.at) : m), shownUpTo);
      if (latest <= Math.max(seenAt(), areaSeen[area] || 0)) return;
      areaSeen = { ...areaSeen, [area]: latest };
      save();
      notify();
    },
    markAllSeen() {
      const latest = entries().reduce((m, e) => (e.system ? m : Math.max(m, e.at)), Date.now());
      const latestNote = noteEntries.reduce((m, n) => Math.max(m, n.at), 0);
      const notesNew = latestNote > (notesSeenUpTo ?? Infinity);
      if (latest <= seenAt() && !notesNew) return;
      lastSeenAt = Math.max(latest, seenAt());
      if (notesNew) notesSeenUpTo = latestNote;
      save();
      notify();
    },
    flushNow: flush,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    stop() {
      clearTimeout(flushTimer);
      flush();
      unsubLocal();
      unsubStore();
    },
  };
}
