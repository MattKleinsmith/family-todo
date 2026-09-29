// Local-first state. Every list and item is a small record with an `updatedAt`
// timestamp; records merge with last-writer-wins, so two phones can edit
// offline and converge once they both reach the relays. Deletes are tombstones
// (`deleted: true`) so a delete on one phone beats a stale edit on the other.

export function newId() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** True when `a` should win over `b`. Ties break deterministically so both phones agree. */
export function isNewer(a, b) {
  if (!b) return true;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return stableStringify(a) > stableStringify(b);
}

const BUCKETS = { list: 'lists', item: 'items', log: 'logs', meta: 'meta', member: 'members', summary: 'summaries', activity: 'activities', chore: 'chores' };
const DAY = 24 * 3600 * 1000;

/** Position used for manual ordering. Records never moved fall back to when they were created. */
export function sortKey(e) {
  return typeof e.order === 'number' && Number.isFinite(e.order) ? e.order : e.createdAt || 0;
}

const ORDER_STEP = 1000;
const CHORE_HISTORY = 20;
const SEED_STAMP = 1;
const MIN_GAP = 1e-3;

export function isValidEntity(e) {
  return (
    e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    Object.prototype.hasOwnProperty.call(BUCKETS, e.type) &&
    typeof e.updatedAt === 'number'
  );
}

function emptyState() {
  return { lists: {}, items: {}, logs: {}, meta: {}, members: {}, summaries: {}, activities: {}, chores: {} };
}

/**
 * `storage` may be synchronous (localStorage, an in-memory map) or asynchronous
 * (IndexedDB via kv.js). `ready` resolves once saved data has been loaded;
 * nothing is written to storage before then, so a write that races the load
 * can't clobber what's saved. If `legacyStorage` still holds data under the
 * same key (from before the IndexedDB move) it is imported once and removed.
 */
export function createStore({
  storageKey,
  storage = globalThis.localStorage,
  legacyStorage = null,
  now = () => Date.now(),
  actor = () => '',
  pruneAfterMs = 60 * DAY,
  activityKeepMs = 180 * DAY,
} = {}) {
  let state = emptyState();
  let loaded = false;
  // Timestamps for our own writes never repeat or go backwards, so records
  // created back to back (like the starter lists) keep their order.
  let lastStamp = 0;
  const stamp = () => (lastStamp = Math.max(now(), lastStamp + 1));
  let pendingSave = false;
  const listeners = new Set();
  const localChangeListeners = new Set();
  const remoteChangeListeners = new Set();
  let saveTimer = null;

  function mergeLoaded(raw) {
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('Could not parse saved data', err);
      return;
    }
    if (!parsed || !parsed.lists || !parsed.items) return;
    // Anything written while the load was in flight wins over the saved copy.
    for (const key of Object.values(BUCKETS)) {
      const saved = parsed[key] || {};
      const cur = state[key];
      for (const [id, entity] of Object.entries(saved)) {
        if (!cur[id] || isNewer(entity, cur[id])) cur[id] = entity;
      }
    }
    state = { ...state };
  }

  function finishLoad() {
    loaded = true;
    notify();
    if (pendingSave) save();
  }

  function load() {
    if (!storage || !storageKey) {
      loaded = true;
      return Promise.resolve();
    }
    let raw;
    try {
      raw = storage.getItem(storageKey);
    } catch (err) {
      console.warn('Could not load saved data', err);
      loaded = true;
      return Promise.resolve();
    }
    if (!raw || typeof raw.then !== 'function') {
      mergeLoaded(raw);
      finishLoad();
      return Promise.resolve();
    }
    return raw
      .then((value) => {
        if (value == null && legacyStorage) {
          // First run after the move to IndexedDB: bring the old copy across.
          const old = legacyStorage.getItem(storageKey);
          if (old) {
            mergeLoaded(old);
            pendingSave = true;
            try {
              legacyStorage.removeItem(storageKey);
            } catch {
              /* ignore */
            }
          }
        } else {
          mergeLoaded(value);
        }
      })
      .catch((err) => console.warn('Could not load saved data', err))
      .then(finishLoad);
  }

  function save() {
    if (!storage || !storageKey) return;
    if (!loaded) {
      pendingSave = true;
      return;
    }
    pendingSave = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const r = storage.setItem(storageKey, JSON.stringify(state));
        if (r && typeof r.catch === 'function') r.catch((err) => console.warn('Could not save data', err));
      } catch (err) {
        console.warn('Could not save data', err);
      }
    }, 50);
  }

  /** Write now instead of after the short debounce, e.g. because the app is being closed. */
  function flushSave() {
    if (!storage || !storageKey || !loaded || !saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const r = storage.setItem(storageKey, JSON.stringify(state));
      if (r && typeof r.catch === 'function') r.catch((err) => console.warn('Could not save data', err));
    } catch (err) {
      console.warn('Could not save data', err);
    }
  }

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function bucket(type) {
    return state[BUCKETS[type]];
  }

  /** Merge a record that came from the network. Returns true if it changed local state. */
  function applyRemote(entity) {
    if (!isValidEntity(entity)) return false;
    const b = bucket(entity.type);
    const existing = b[entity.id];
    if (existing && !isNewer(entity, existing)) return false;
    // A deletion marker older than the prune horizon that we don't already hold
    // is one we (or another phone) pruned; taking it back would just churn.
    if (!existing && entity.deleted && entity.updatedAt < now() - pruneAfterMs) return false;
    // Activity older than the retention window has been pruned; don't take it back.
    if (entity.type === 'activity' && entity.updatedAt < now() - activityKeepMs) return false;
    b[entity.id] = entity;
    state = { ...state, [BUCKETS[entity.type]]: { ...b } };
    save();
    notify();
    for (const fn of remoteChangeListeners) fn(existing || null, entity);
    return true;
  }

  /** Write a record we produced on this device: stamp it, persist it, and hand it to sync. */
  function putLocal(entity) {
    const prev = bucket(entity.type)[entity.id] || null;
    const stamped = { ...entity, updatedAt: stamp(), updatedBy: actor() || entity.updatedBy || entity.createdBy || '' };
    const key = BUCKETS[entity.type];
    state = { ...state, [key]: { ...state[key], [entity.id]: stamped } };
    save();
    notify();
    for (const fn of localChangeListeners) fn(stamped, prev);
    return stamped;
  }

  /**
   * Put a default record (like a starter chore) that must never beat a real
   * one: it carries the oldest possible timestamp, so any version another phone
   * has already written, edited or deleted wins the merge. Skipped if the
   * record is already here.
   */
  function seedLocal(entity) {
    const key = BUCKETS[entity.type];
    if (!key || state[key][entity.id]) return state[key]?.[entity.id] || null;
    const seeded = { ...entity, updatedAt: SEED_STAMP, updatedBy: '' };
    state = { ...state, [key]: { ...state[key], [entity.id]: seeded } };
    save();
    notify();
    for (const fn of localChangeListeners) fn(seeded, null);
    return seeded;
  }

  function patch(type, id, changes) {
    const existing = bucket(type)[id];
    if (!existing) return null;
    return putLocal({ ...existing, ...changes });
  }

  // ---- Convenience API used by the UI ----

  function createList({ name, emoji = '', createdBy = '', personal = false, owner = null }) {
    return putLocal({
      id: newId(),
      type: 'list',
      name: name.trim(),
      emoji,
      createdBy,
      createdAt: stamp(),
      deleted: false,
      ...(personal ? { personal: true, owner } : {}),
    });
  }

  function updateList(id, changes) {
    return patch('list', id, changes);
  }

  /** Undo deleteList: bring back the list and the items that went with it. */
  function restoreList(id, itemIds = [], choreIds = []) {
    for (const itemId of itemIds) if (state.items[itemId]?.deleted) patch('item', itemId, { deleted: false });
    for (const choreId of choreIds) if (state.chores[choreId]?.deleted) patch('chore', choreId, { deleted: false });
    return patch('list', id, { deleted: false });
  }

  /**
   * Move everything in one list into another: one-off items (done or not) and
   * repeating items (with their history), in their order, after what's already
   * there. Each moved record carries the move's `moveBatch` so the activity
   * feed shows one line (the `moveNote` on the source list) instead of one per
   * item. Returns what's needed to undo it, or null if there was nothing to move.
   */
  function moveAllItems(fromId, toId) {
    const from = state.lists[fromId];
    const to = state.lists[toId];
    if (!from || !to || fromId === toId) return null;
    const pick = (bucketName, listId) => Object.values(state[bucketName]).filter((e) => e.listId === listId && !e.deleted).sort(byKey);
    const items = pick('items', fromId);
    const chores = pick('chores', fromId);
    const count = items.length + chores.length;
    if (!count) return null;
    const batch = newId();
    const place = (type, moving, already) => {
      let base = already.reduce((m, e) => Math.max(m, sortKey(e)), 0);
      for (const e of moving) patch(type, e.id, { listId: toId, order: (base += ORDER_STEP), moveBatch: batch });
    };
    place('item', items, pick('items', toId));
    place('chore', chores, pick('chores', toId));
    const plural = `${count} item${count === 1 ? '' : 's'}`;
    patch('list', fromId, { moveNote: { id: batch, text: `moved ${plural} from “${from.name}” to “${to.name}”` } });
    return { fromId, toId, count, before: [...items.map((e) => ['item', e]), ...chores.map((e) => ['chore', e])].map(([type, e]) => ({ type, id: e.id, order: e.order ?? null })) };
  }

  /** Undo moveAllItems: everything goes back where it was (bring the list back first if it was deleted). */
  function undoMoveAll(move) {
    if (!move) return;
    if (state.lists[move.fromId]?.deleted) patch('list', move.fromId, { deleted: false });
    const batch = newId();
    for (const b of move.before) patch(b.type, b.id, { listId: move.fromId, order: b.order, moveBatch: batch });
    const from = state.lists[move.fromId];
    patch('list', move.fromId, { moveNote: { id: batch, text: `moved ${move.count} item${move.count === 1 ? '' : 's'} back to “${from.name}”` } });
  }

  function deleteList(id) {
    const items = Object.values(state.items).filter((i) => i.listId === id && !i.deleted);
    for (const item of items) patch('item', item.id, { deleted: true });
    for (const c of Object.values(state.chores)) if (c.listId === id && !c.deleted) patch('chore', c.id, { deleted: true });
    return patch('list', id, { deleted: true });
  }

  function addItem({ listId, text, createdBy = '' }) {
    const t = text.trim();
    if (!t) return null;
    return putLocal({
      id: newId(),
      type: 'item',
      listId,
      text: t,
      done: false,
      doneAt: null,
      createdBy,
      createdAt: stamp(),
      deleted: false,
    });
  }

  function updateItem(id, changes) {
    return patch('item', id, changes);
  }

  function toggleItem(id) {
    const item = state.items[id];
    if (!item) return null;
    const done = !item.done;
    return patch('item', id, { done, doneAt: done ? stamp() : null });
  }

  function deleteItem(id) {
    return patch('item', id, { deleted: true });
  }

  function clearCompleted(listId) {
    for (const item of Object.values(state.items)) {
      if (item.listId === listId && item.done && !item.deleted) patch('item', item.id, { deleted: true });
    }
  }

  function uncheckAll(listId) {
    for (const item of Object.values(state.items)) {
      if (item.listId === listId && item.done && !item.deleted) patch('item', item.id, { done: false, doneAt: null });
    }
  }

  // ---- Baby log: feeds and sleeps ----

  function addLog({ kind, startAt, endAt = null, note = '', createdBy = '' }) {
    if (kind !== 'feed' && kind !== 'sleep') return null;
    return putLocal({
      id: newId(),
      type: 'log',
      kind,
      startAt,
      endAt,
      note,
      createdBy,
      createdAt: stamp(),
      deleted: false,
    });
  }

  function updateLog(id, changes) {
    return patch('log', id, changes);
  }

  function deleteLog(id) {
    return patch('log', id, { deleted: true });
  }

  /** Shared settings such as the baby's name, keyed by a fixed id and synced like everything else. */
  function getMeta(id) {
    return state.meta[id] || null;
  }

  function setMeta(id, changes) {
    const existing = state.meta[id] || { id, type: 'meta', createdAt: stamp(), deleted: false };
    return putLocal({ ...existing, ...changes });
  }

  /** Forget a record on this phone only (no tombstone, nothing published). Used when pruning. */
  function removeLocal(type, id) {
    const key = BUCKETS[type];
    if (!key || !state[key][id]) return false;
    const next = { ...state[key] };
    delete next[id];
    state = { ...state, [key]: next };
    save();
    notify();
    return true;
  }

  /** Deletion markers last changed before `before`. */
  function tombstones(before) {
    const out = [];
    for (const type of ['item', 'list', 'log', 'chore']) {
      for (const e of Object.values(bucket(type))) if (e.deleted && e.updatedAt < before) out.push(e);
    }
    return out;
  }

  // ---- House chores: daily, weekly and monthly, with their recent completions ----

  /** A chore for the House tab, or, with `listId`, a repeating item that lives in that list instead. */
  function addChore({ name, cadence = 'weekly', icon = '', owner = null, times = 1, createdBy = '', listId = null }) {
    const n = (name || '').trim();
    if (!n) return null;
    return putLocal({ id: newId(), type: 'chore', name: n, cadence, icon, owner: owner || null, times, done: [], createdBy, createdAt: stamp(), deleted: false, ...(listId ? { listId } : {}) });
  }

  /**
   * Make a one-off list item repeat: it becomes a repeating item in the same
   * list and place, and if it was ticked off, that counts for this period.
   * The two records point at each other (`fromItem` / `convertedTo`) so the
   * activity feed can say "made … repeat" instead of "removed" and "added".
   */
  function repeatItem(itemId, { cadence = 'daily', name, times = 1 } = {}) {
    const item = state.items[itemId];
    if (!item || item.deleted) return null;
    const chore = putLocal({
      id: newId(),
      type: 'chore',
      listId: item.listId,
      name: (name || item.text).trim() || item.text,
      cadence,
      icon: '',
      owner: null,
      times: Math.min(99, Math.max(1, Math.round(Number(times) || 1))),
      done: item.done && item.doneAt ? [{ at: item.doneAt, by: item.updatedBy || '' }] : [],
      createdBy: item.createdBy || '',
      createdAt: stamp(),
      order: sortKey(item),
      fromItem: item.id,
      deleted: false,
    });
    patch('item', itemId, { deleted: true, convertedTo: chore.id });
    return chore;
  }

  /** Turn a list's repeating item back into a plain one-off item. */
  function stopRepeating(choreId) {
    const c = state.chores[choreId];
    if (!c || c.deleted || !c.listId) return null;
    const item = putLocal({
      id: newId(),
      type: 'item',
      listId: c.listId,
      text: c.name,
      done: false,
      doneAt: null,
      createdBy: c.createdBy || '',
      createdAt: stamp(),
      order: sortKey(c),
      fromChore: c.id,
      deleted: false,
    });
    patch('chore', choreId, { deleted: true, convertedTo: item.id });
    return item;
  }

  /**
   * The starter chores, with fixed ids and contents, so phones that set them
   * up independently hold identical records; seedLocal makes sure they never
   * overwrite what someone has already done with them.
   */
  function seedChores(starters, createdAt) {
    starters.forEach((c, i) =>
      seedLocal({ id: c.id, type: 'chore', name: c.name, cadence: c.cadence, icon: c.icon, done: [], createdBy: '', createdAt: createdAt + i, deleted: false, starter: true }),
    );
    seedLocal({ id: 'house', type: 'meta', seeded: true, createdAt, deleted: false });
  }

  function updateChore(id, changes) {
    return patch('chore', id, changes);
  }

  function deleteChore(id) {
    return patch('chore', id, { deleted: true });
  }

  /** Record a completion at `at`. Only the most recent HISTORY_LIMIT are kept. */
  function markChore(id, { at = now(), by = '' } = {}) {
    const c = state.chores[id];
    if (!c) return null;
    // A chore done several times a period keeps proportionally more history.
    const times = Math.min(99, Math.max(1, Math.round(Number(c.times) || 1)));
    const keep = Math.min(CHORE_HISTORY * times, 200);
    const done = [{ at, by }, ...(c.done || []).filter((d) => d.at !== at)].sort((a, b) => b.at - a.at).slice(0, keep);
    return patch('chore', id, { done });
  }

  function unmarkChore(id, at) {
    const c = state.chores[id];
    if (!c) return null;
    return patch('chore', id, { done: (c.done || []).filter((d) => d.at !== at) });
  }

  function chores() {
    return Object.values(state.chores)
      .filter((c) => !c.deleted)
      .sort(byKey);
  }

  /** The household's chores, for the House tab: not the repeating items that live in lists. */
  function houseChores() {
    return chores().filter((c) => !c.listId);
  }

  /** Repeating items in one list. */
  function choresFor(listId) {
    return chores().filter((c) => c.listId === listId);
  }

  /** True once this phone holds any chore record at all, deleted ones included. */
  function hasAnyChores() {
    return Object.keys(state.chores).length > 0;
  }

  // ---- Daily summaries of compacted baby logs ----

  function setSummary(day, data) {
    const id = `day:${day}`;
    const existing = state.summaries[id];
    if (existing) return existing;
    return putLocal({ id, type: 'summary', day, createdAt: stamp(), deleted: false, ...data });
  }

  function activityBuckets() {
    return Object.values(state.activities).filter((b) => !b.deleted);
  }

  function summaries() {
    return Object.values(state.summaries)
      .filter((s) => !s.deleted)
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  }

  // ---- Family members: one record per device that has joined ----

  function setMember(id, changes) {
    const existing = state.members[id] || { id, type: 'member', createdAt: stamp(), deleted: false };
    return putLocal({ ...existing, ...changes });
  }

  function members() {
    return Object.values(state.members)
      .filter((m) => !m.deleted)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  }

  // ---- Selectors ----

  function logs() {
    return Object.values(state.logs)
      .filter((l) => !l.deleted)
      .sort((a, b) => b.startAt - a.startAt);
  }

  const byKey = (a, b) => sortKey(a) - sortKey(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  function lists() {
    return Object.values(state.lists)
      .filter((l) => !l.deleted)
      .sort(byKey);
  }

  function itemsFor(listId) {
    return Object.values(state.items)
      .filter((i) => i.listId === listId && !i.deleted)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.done) return (b.doneAt || 0) - (a.doneAt || 0);
        return byKey(a, b);
      });
  }

  /**
   * Put `id` where it sits in `ids` (the full new order of its siblings, after
   * a drag). Only the moved record changes: it gets a position halfway between
   * its new neighbours. If those are too close to split, the siblings are
   * renumbered (marked `renumbered` so the activity feed stays quiet).
   */
  function moveTo(type, id, ids) {
    const get = (x) => bucket(type)[x];
    const i = ids.indexOf(id);
    if (i < 0 || !get(id)) return null;
    const prev = i > 0 ? get(ids[i - 1]) : null;
    const next = i < ids.length - 1 ? get(ids[i + 1]) : null;
    if (!prev && !next) return null;
    let order;
    if (!prev) order = sortKey(next) - ORDER_STEP;
    else if (!next) order = sortKey(prev) + ORDER_STEP;
    else if (sortKey(next) - sortKey(prev) > MIN_GAP) order = (sortKey(prev) + sortKey(next)) / 2;
    if (order !== undefined) return patch(type, id, { order, renumbered: false });
    const base = sortKey(get(ids[0]));
    ids.forEach((x, j) => {
      if (x === id) return;
      const want = base + j * ORDER_STEP;
      if (get(x) && sortKey(get(x)) !== want) patch(type, x, { order: want, renumbered: true });
    });
    return patch(type, id, { order: base + i * ORDER_STEP, renumbered: false });
  }

  function all() {
    return [
      ...Object.values(state.lists),
      ...Object.values(state.items),
      ...Object.values(state.logs),
      ...Object.values(state.meta),
      ...Object.values(state.members),
      ...Object.values(state.summaries),
      ...Object.values(state.activities),
      ...Object.values(state.chores),
    ];
  }

  function getEntity(type, id) {
    return bucket(type)[id] || null;
  }

  /** Counts and byte sizes per record type, for the debug panel. */
  function sizes() {
    const out = {};
    let totalBytes = 0;
    let totalRecords = 0;
    for (const [type, key] of Object.entries(BUCKETS)) {
      const all = Object.values(state[key]);
      const deleted = all.filter((e) => e.deleted).length;
      const bytes = JSON.stringify(all).length;
      out[type] = { live: all.length - deleted, deleted, bytes };
      totalBytes += bytes;
      totalRecords += all.length;
    }
    return { byType: out, totalBytes, totalRecords };
  }

  const ready = load();

  return {
    ready,
    flushSave,
    get: () => state,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    onLocalChange: (fn) => (localChangeListeners.add(fn), () => localChangeListeners.delete(fn)),
    onRemoteChange: (fn) => (remoteChangeListeners.add(fn), () => remoteChangeListeners.delete(fn)),
    applyRemote,
    putLocal,
    createList,
    updateList,
    deleteList,
    restoreList,
    moveAllItems,
    undoMoveAll,
    addItem,
    updateItem,
    toggleItem,
    deleteItem,
    clearCompleted,
    uncheckAll,
    addLog,
    updateLog,
    deleteLog,
    getMeta,
    setMeta,
    setMember,
    members,
    removeLocal,
    tombstones,
    setSummary,
    summaries,
    activityBuckets,
    seedLocal,
    addChore,
    seedChores,
    repeatItem,
    stopRepeating,
    houseChores,
    choresFor,
    updateChore,
    deleteChore,
    markChore,
    unmarkChore,
    chores,
    hasAnyChores,
    lists,
    itemsFor,
    moveTo,
    logs,
    all,
    getEntity,
    sizes,
  };
}
