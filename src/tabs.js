// Which tabs the bottom bar shows, and in what order. The order is a per-phone
// preference (press and hold a tab to change it), so it's kept locally.
const KEY = 'ft:tabOrder';
export const TAB_KEYS = ['baby', 'house', 'mine', 'lists'];

/** A saved order, repaired: unknown or repeated keys dropped, missing ones added at the end. */
export function normalizeOrder(order) {
  const seen = Array.isArray(order) ? order.filter((k, i) => TAB_KEYS.includes(k) && order.indexOf(k) === i) : [];
  return [...seen, ...TAB_KEYS.filter((k) => !seen.includes(k))];
}

export function loadTabOrder(storage = globalThis.localStorage) {
  try {
    return normalizeOrder(JSON.parse(storage.getItem(KEY) || 'null'));
  } catch {
    return [...TAB_KEYS];
  }
}

export function saveTabOrder(order, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(normalizeOrder(order)));
  } catch {
    /* ignore */
  }
}
