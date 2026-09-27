// Key/value persistence on IndexedDB (hundreds of MB or more) instead of
// localStorage (about 5 MB on Safari). Same getItem/setItem/removeItem shape,
// but asynchronous. Falls back to localStorage where IndexedDB is unavailable.
const DB_NAME = 'family-todo';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result !== undefined ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export function createKV() {
  if (typeof indexedDB === 'undefined') {
    const ls = globalThis.localStorage;
    return {
      kind: 'localStorage',
      getItem: async (k) => (ls ? ls.getItem(k) : null),
      setItem: async (k, v) => ls && ls.setItem(k, v),
      removeItem: async (k) => ls && ls.removeItem(k),
    };
  }
  let dbPromise = null;
  const db = () => dbPromise || (dbPromise = openDb().catch((err) => { dbPromise = null; throw err; }));
  return {
    kind: 'indexedDB',
    getItem: async (k) => {
      const v = await run(await db(), 'readonly', (s) => s.get(k));
      return v === undefined ? null : v;
    },
    setItem: async (k, v) => run(await db(), 'readwrite', (s) => s.put(v, k)),
    removeItem: async (k) => run(await db(), 'readwrite', (s) => s.delete(k)),
  };
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
