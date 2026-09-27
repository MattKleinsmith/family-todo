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

const BUCKETS = { list: 'lists', item: 'items', log: 'logs', meta: 'meta', member: 'members' };

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
  return { lists: {}, items: {}, logs: {}, meta: {}, members: {} };
}

export function createStore({ storageKey, storage = globalThis.localStorage, now = () => Date.now(), actor = () => '' } = {}) {
  let state = emptyState();
  const listeners = new Set();
  const localChangeListeners = new Set();
  const remoteChangeListeners = new Set();
  let saveTimer = null;

  function load() {
    if (!storage || !storageKey) return;
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.lists && parsed.items) state = { ...emptyState(), ...parsed };
      }
    } catch (err) {
      console.warn('Could not load saved data', err);
    }
  }

  function save() {
    if (!storage || !storageKey) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        storage.setItem(storageKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Could not save data', err);
      }
    }, 50);
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
    b[entity.id] = entity;
    state = { ...state, [BUCKETS[entity.type]]: { ...b } };
    save();
    notify();
    for (const fn of remoteChangeListeners) fn(existing || null, entity);
    return true;
  }

  /** Write a record we produced on this device: stamp it, persist it, and hand it to sync. */
  function putLocal(entity) {
    const stamped = { ...entity, updatedAt: now(), updatedBy: actor() || entity.updatedBy || entity.createdBy || '' };
    const key = BUCKETS[entity.type];
    state = { ...state, [key]: { ...state[key], [entity.id]: stamped } };
    save();
    notify();
    for (const fn of localChangeListeners) fn(stamped);
    return stamped;
  }

  function patch(type, id, changes) {
    const existing = bucket(type)[id];
    if (!existing) return null;
    return putLocal({ ...existing, ...changes });
  }

  // ---- Convenience API used by the UI ----

  function createList({ name, emoji = '', createdBy = '' }) {
    return putLocal({
      id: newId(),
      type: 'list',
      name: name.trim(),
      emoji,
      createdBy,
      createdAt: now(),
      deleted: false,
    });
  }

  function updateList(id, changes) {
    return patch('list', id, changes);
  }

  function deleteList(id) {
    const items = Object.values(state.items).filter((i) => i.listId === id && !i.deleted);
    for (const item of items) patch('item', item.id, { deleted: true });
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
      createdAt: now(),
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
    return patch('item', id, { done, doneAt: done ? now() : null });
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
      createdAt: now(),
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
    const existing = state.meta[id] || { id, type: 'meta', createdAt: now(), deleted: false };
    return putLocal({ ...existing, ...changes });
  }

  // ---- Family members: one record per device that has joined ----

  function setMember(id, changes) {
    const existing = state.members[id] || { id, type: 'member', createdAt: now(), deleted: false };
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

  function lists() {
    return Object.values(state.lists)
      .filter((l) => !l.deleted)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function itemsFor(listId) {
    return Object.values(state.items)
      .filter((i) => i.listId === listId && !i.deleted)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.done) return (b.doneAt || 0) - (a.doneAt || 0);
        return a.createdAt - b.createdAt;
      });
  }

  function all() {
    return [
      ...Object.values(state.lists),
      ...Object.values(state.items),
      ...Object.values(state.logs),
      ...Object.values(state.meta),
      ...Object.values(state.members),
    ];
  }

  function getEntity(type, id) {
    return bucket(type)[id] || null;
  }

  load();

  return {
    get: () => state,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    onLocalChange: (fn) => (localChangeListeners.add(fn), () => localChangeListeners.delete(fn)),
    onRemoteChange: (fn) => (remoteChangeListeners.add(fn), () => remoteChangeListeners.delete(fn)),
    applyRemote,
    putLocal,
    createList,
    updateList,
    deleteList,
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
    lists,
    itemsFor,
    logs,
    all,
    getEntity,
  };
}
