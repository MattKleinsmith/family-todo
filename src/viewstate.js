// Where you were: the screen, how far down it was scrolled, and which sections
// were open, kept on this phone so that coming back (even hours later, after
// iOS has closed the app in the background and starts it afresh) puts you back
// exactly there. Nothing here is synced; each phone remembers its own place.
import { useEffect, useState } from 'preact/hooks';

const ROUTE_KEY = 'ft:view:route';
const SCROLL_KEY = 'ft:view:scroll';
const MAX_SCROLLS = 40;

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full: just don't remember */
  }
};

/** The screen a hash stands for, without one-off extras like ?focus=. */
export function viewKey(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  return raw.split('?')[0] || '/';
}

/**
 * Call before the app first renders. A fresh launch opens the bare start
 * address (no #…): go back to the screen you were last on instead. A link
 * that names a screen (or a join code) is left alone.
 */
export function restoreLastView() {
  if (location.hash && location.hash !== '#') return;
  const last = read(ROUTE_KEY, null);
  if (typeof last !== 'string' || last === '/' || last.startsWith('/join')) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#${last}`);
}

/** Remember the screen whenever it changes. */
export function rememberViews() {
  const save = () => {
    const key = viewKey(location.hash);
    if (!key.startsWith('/join')) write(ROUTE_KEY, key);
  };
  save();
  window.addEventListener('hashchange', save);
}

// ---- scroll positions, per screen ----

let scrolls = null;
const allScrolls = () => (scrolls ||= read(SCROLL_KEY, {}) || {});
let saveTimer = null;
function saveScrolls() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const entries = Object.entries(allScrolls());
  // Most recent last; keep a bounded number of screens.
  write(SCROLL_KEY, Object.fromEntries(entries.slice(-MAX_SCROLLS)));
}

export function savedScroll(key) {
  const v = allScrolls()[key];
  return typeof v === 'number' && v > 0 ? v : 0;
}

function noteScroll(key, top) {
  const all = allScrolls();
  delete all[key]; // re-insert so it counts as most recent
  all[key] = Math.round(top);
  if (!saveTimer) saveTimer = setTimeout(saveScrolls, 250);
}

/**
 * Keep the screen's scroll position (`.content`, the one scroller) and put it
 * back when the screen opens. Content can still be arriving for a moment
 * after the screen appears, so restoring keeps trying until the page is tall
 * enough, and stops as soon as you scroll yourself. Skipped when the screen
 * was opened to show one particular thing (`skip`, e.g. ?focus=).
 */
export function useScrollMemory(key, ready = true, skip = false) {
  useEffect(() => {
    if (!ready) return undefined;
    const el = document.querySelector('.screen .content');
    if (!el) return undefined;
    let restoring = !skip && savedScroll(key) > 0;
    const target = savedScroll(key);
    const stopRestoring = () => (restoring = false);
    const tryRestore = () => {
      if (!restoring) return true;
      if (el.scrollHeight - el.clientHeight >= target) {
        el.scrollTop = target;
        restoring = false;
        return true;
      }
      el.scrollTop = el.scrollHeight; // as close as it gets for now
      return false;
    };
    let tries = 0;
    let timer = null;
    const loop = () => {
      if (tryRestore() || ++tries > 30) return;
      timer = setTimeout(loop, 50);
    };
    loop();
    const onScroll = () => {
      if (!restoring) noteScroll(key, el.scrollTop);
    };
    // A finger or wheel on the page means you've taken over.
    el.addEventListener('touchstart', stopRestoring, { passive: true });
    el.addEventListener('wheel', stopRestoring, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    const flush = () => {
      if (!restoring) noteScroll(key, el.scrollTop);
      saveScrolls();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(timer);
      // The screen may already be gone (its scrollTop reads 0): what it last
      // reported while scrolling is what counts.
      saveScrolls();
      el.removeEventListener('touchstart', stopRestoring);
      el.removeEventListener('wheel', stopRestoring);
      el.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [key, ready]);
}

/** Like useState, but remembered on this phone under `key` (for things like "Done (4) ▸" being open). */
export function useRemembered(key, initial) {
  const load = () => {
    const v = read(`ft:view:${key}`, undefined);
    return v === undefined ? initial : v;
  };
  // Keyed, so a screen reused for another list picks up that list's own value.
  const [state, setState] = useState(() => ({ key, value: load() }));
  const value = state.key === key ? state.value : load();
  const set = (next) =>
    setState((cur) => {
      const prev = cur.key === key ? cur.value : load();
      const v = typeof next === 'function' ? next(prev) : next;
      write(`ft:view:${key}`, v);
      return { key, value: v };
    });
  return [value, set];
}
