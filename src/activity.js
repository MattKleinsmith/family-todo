// The activity feed: a plain-language record of what changed, worked out on
// this phone by comparing each record with the version it already had.
// Other people's changes count as unseen until you look; your own are kept
// too (already seen) and shown only when you ask.
import { formatTime, formatDuration } from './baby.js';

const MAX_ENTRIES = 500;

const q = (s) => `“${s}”`;
const possessive = (s) => `${s}’${/s$/i.test(s) ? '' : 's'}`;
const joinParts = (parts) => (parts.length <= 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Describe the change from `prev` (what we had, or null) to `next`. Returns null when nothing worth telling changed. */
export function describeChange(prev, next, ctx = {}) {
  if (next.type === 'summary' || next.compacted) return null; // housekeeping, not news
  const listName = (id) => ctx.listName?.(id) || 'a list';
  const baby = ctx.babyName || 'the baby';
  switch (next.type) {
    case 'item': {
      const where = `in ${listName(next.listId)}`;
      if (!prev) return next.deleted ? null : `added ${q(next.text)} ${where}`;
      if (next.deleted && !prev.deleted) return `removed ${q(prev.text)} from ${listName(next.listId)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.text !== prev.text) parts.push(`renamed ${q(prev.text)} to ${q(next.text)}`);
      if (next.done !== prev.done) parts.push(`${next.done ? 'checked off' : 'unchecked'} ${q(next.text)}`);
      if (next.listId !== prev.listId) parts.push(`moved ${q(next.text)} to ${listName(next.listId)}`);
      if (parts.length === 0) return null;
      return `${joinParts(parts)} ${where}`;
    }
    case 'list': {
      const label = (l) => `${l.emoji ? l.emoji + ' ' : ''}${l.name}`;
      if (!prev) return next.deleted ? null : `created the list ${label(next)}`;
      if (next.deleted && !prev.deleted) return `deleted the list ${label(prev)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.name !== prev.name) parts.push(`renamed the list ${q(prev.name)} to ${q(next.name)}`);
      if ((next.emoji || '') !== (prev.emoji || '')) parts.push(`changed ${possessive(next.name)} icon to ${next.emoji || 'none'}`);
      return parts.length ? joinParts(parts) : null;
    }
    case 'log': {
      const kind = (l) => (l.kind === 'feed' ? 'feed' : 'sleep');
      if (!prev) {
        if (next.deleted) return null;
        if (next.kind === 'feed') return `logged a feed at ${formatTime(next.startAt)}${next.note ? ` (${next.note})` : ''}`;
        if (next.endAt == null) return `logged ${baby} falling asleep at ${formatTime(next.startAt)}`;
        return `logged ${baby} sleeping ${formatTime(next.startAt)} – ${formatTime(next.endAt)} (${formatDuration(next.endAt - next.startAt)})`;
      }
      if (next.deleted && !prev.deleted) return `removed the ${formatTime(prev.startAt)} ${kind(prev)}`;
      if (next.deleted) return null;
      const parts = [];
      if (next.kind !== prev.kind) parts.push(`changed the ${formatTime(prev.startAt)} ${kind(prev)} to a ${kind(next)}`);
      if (next.kind === 'sleep' && prev.endAt == null && next.endAt != null)
        parts.push(`logged ${baby} waking up at ${formatTime(next.endAt)} (slept ${formatDuration(next.endAt - next.startAt)})`);
      else if (next.kind === 'sleep' && prev.endAt != null && next.endAt == null) parts.push(`marked the ${formatTime(next.startAt)} sleep as still going`);
      else if (next.kind === 'sleep' && prev.endAt != null && next.endAt !== prev.endAt)
        parts.push(`changed the ${formatTime(next.startAt)} sleep’s end to ${formatTime(next.endAt)}`);
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
      const every = (m) => (m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
      // Unset intervals mean the default, so saving the defaults for the first time isn't a change.
      const DEFAULT = 180;
      if ((next.feedIntervalMin || DEFAULT) !== (p.feedIntervalMin || DEFAULT)) parts.push(`set feeds to about every ${every(next.feedIntervalMin || DEFAULT)}`);
      if ((next.sleepIntervalMin || DEFAULT) !== (p.sleepIntervalMin || DEFAULT)) parts.push(`set naps to about every ${every(next.sleepIntervalMin || DEFAULT)}`);
      return parts.length ? joinParts(parts) : null;
    }
    case 'member': {
      const dev = next.device ? ` on ${/^[aeiou]/i.test(next.device) ? 'an' : 'a'} ${next.device}` : '';
      if (!prev) return next.leftAt || next.backfilled ? null : `joined the family${dev}`;
      if (next.leftAt && !prev.leftAt) return `left the family${dev}`;
      if (!next.leftAt && prev.leftAt) return `rejoined the family${dev}`;
      if (next.name !== prev.name && prev.name) return `changed their name from ${prev.name} to ${next.name}`;
      return null;
    }
    default:
      return null;
  }
}

export function actorOf(entity) {
  return entity.updatedBy || entity.createdBy || 'Someone';
}

/**
 * Watches the store for changes that came in from other phones and keeps a
 * capped, persisted list of them with a per-entry "seen" flag.
 */
export function createActivity({ store, storageKey, storage = globalThis.localStorage, prefs = globalThis.localStorage, since = () => 0, self = () => '' }) {
  let entries = [];
  const listeners = new Set();
  let timer = null;
  let loaded = false;
  let pendingSave = false;
  // The toggle is tiny and per phone; it stays in localStorage (`prefs`).
  const showMineKey = storageKey ? `${storageKey}:showMine` : null;
  let showMine = false;
  try {
    showMine = !!(prefs && showMineKey && prefs.getItem(showMineKey) === '1');
  } catch {
    showMine = false;
  }

  function mergeLoaded(raw) {
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) return;
    const have = new Set(entries.map((e) => e.id));
    entries = [...entries, ...parsed.filter((e) => e && !have.has(e.id))].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
  }

  function finishLoad() {
    loaded = true;
    if (pendingSave) save();
    notify();
  }

  const ready = (() => {
    if (!storage || !storageKey) {
      loaded = true;
      return Promise.resolve();
    }
    let raw;
    try {
      raw = storage.getItem(storageKey);
    } catch {
      loaded = true;
      return Promise.resolve();
    }
    if (!raw || typeof raw.then !== 'function') {
      mergeLoaded(raw);
      loaded = true;
      return Promise.resolve();
    }
    return raw
      .then((value) => {
        if (value == null && prefs && prefs.getItem(storageKey)) {
          mergeLoaded(prefs.getItem(storageKey));
          pendingSave = true;
          try {
            prefs.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        } else mergeLoaded(value);
      })
      .catch(() => {})
      .then(finishLoad);
  })();

  function save() {
    if (!storage || !storageKey) return;
    if (!loaded) {
      pendingSave = true;
      return;
    }
    pendingSave = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const r = storage.setItem(storageKey, JSON.stringify(entries));
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        /* ignore */
      }
    }, 100);
  }

  function notify() {
    for (const fn of listeners) fn();
  }

  const ctx = {
    listName: (id) => store.getEntity('list', id)?.name,
    babyName: () => store.getMeta('baby')?.name,
  };

  function record(prev, next, local) {
    // Things that existed before this phone joined are history, not news.
    if (!prev && next.updatedAt <= since()) return;
    const text = describeChange(prev, next, { listName: ctx.listName, babyName: ctx.babyName() });
    if (!text) return;
    const actor = actorOf(next);
    const mine = local || (!!self() && actor === self());
    entries.unshift({
      id: `${next.id}:${next.updatedAt}`,
      at: next.updatedAt,
      actor,
      mine,
      text,
      entityType: next.type,
      entityId: next.id,
      listId: next.type === 'item' ? next.listId : next.type === 'list' ? next.id : null,
      seen: mine, // you don't need to be told what you just did
    });
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    save();
    notify();
  }

  const unsubRemote = store.onRemoteChange((prev, next) => record(prev, next, false));
  const unsubLocal = store.onLocalChange((next, prev) => record(prev || null, next, true));

  return {
    ready,
    entries: () => entries,
    visibleEntries: () => (showMine ? entries : entries.filter((e) => !e.mine)),
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
    unseenCount: () => entries.reduce((n, e) => n + (e.seen ? 0 : 1), 0),
    unseenForList: (listId) => entries.reduce((n, e) => n + (!e.seen && e.listId === listId ? 1 : 0), 0),
    markAllSeen() {
      let changed = false;
      for (const e of entries) if (!e.seen) (e.seen = true), (changed = true);
      if (changed) {
        save();
        notify();
      }
    },
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    stop() {
      unsubRemote();
      unsubLocal();
    },
  };
}
