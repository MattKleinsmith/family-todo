import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { loadSession, saveSession, clearSession } from './session.js';
import { deriveKeys } from './keys.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { createActivity } from './activity.js';
import { CHANGELOG } from './changelog.js';
import { deviceId, describeDevice } from './device.js';
import { createKV, requestPersistence } from './kv.js';
import { runMaintenance } from './maintenance.js';
import { iconToken } from './icons.js';
import { sameName } from './members.js';
import { ensurePersonalList, mergeDuplicatePersonalLists, personalListFor, renamePersonalList } from './personal.js';
import { useRoute, navigate } from './router.js';
import { useScrollMemory, viewKey } from './viewstate.js';
import { Join } from './components/Join.jsx';
import { Home } from './components/Home.jsx';
import { ListView } from './components/ListView.jsx';
import { Settings } from './components/Settings.jsx';
import { Baby } from './components/Baby.jsx';
import { Activity } from './components/Activity.jsx';
import { House } from './components/House.jsx';
import { Toast } from './components/Toast.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function App() {
  const [session, setSession] = useState(loadSession);
  const [family, setFamily] = useState(null); // { keys, store, sync, activity }
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const joinRef = useRef(null);
  const [status, setStatus] = useState({ connected: 0, total: 0, lastSyncAt: null, online: false });
  const [error, setError] = useState(null);
  const route = useRoute();
  // Each screen keeps its scroll position, across tab switches and relaunches.
  const routeKey = viewKey(location.hash);
  const [toast, setToast] = useState(null); // { id, text, undo }
  const toastTimer = useRef(null);
  const showToast = (text, undo = null) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const dismissToast = () => {
    clearTimeout(toastTimer.current);
    setToast(null);
  };

  // Boot (or re-boot) the store + sync whenever the family code changes.
  useEffect(() => {
    if (!session) {
      setFamily(null);
      return;
    }
    let cancelled = false;
    let sync = null;
    let feed = null;
    let timers = [];
    let onHide = null;
    (async () => {
      try {
        const keys = await deriveKeys(session.code);
        if (cancelled) return;
        const kv = createKV();
        requestPersistence();
        const store = createStore({
          storageKey: `ft:data:${keys.pk}`,
          storage: kv,
          legacyStorage: globalThis.localStorage,
          actor: () => sessionRef.current?.name || '',
        });
        const activity = createActivity({
          store,
          storageKey: `ft:activity:${keys.pk}`,
          storage: kv,
          device: deviceId,
          since: () => sessionRef.current?.joinedAt || 0,
          self: () => sessionRef.current?.name || '',
          notes: CHANGELOG,
        });
        feed = activity;
        await Promise.all([store.ready, activity.ready]);
        if (cancelled) return;
        sync = createSync({ keys, store, onStatus: setStatus });
        sync.start();
        // Housekeeping once the first sync has had a chance to land, then every few hours.
        const tidy = () => {
          if (sync && sync.status().online) runMaintenance({ store, sync });
        };
        timers = [setTimeout(tidy, 20_000), setInterval(tidy, 6 * 3600 * 1000)];
        // The app can be swiped away at any moment: write out anything still waiting.
        const flushAll = () => {
          activity.flushNow();
          store.flushSave();
        };
        onHide = (e) => {
          if (e.type === 'pagehide' || document.visibilityState === 'hidden') flushAll();
        };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onHide);
        const current = sessionRef.current;
        // This phone's member record is written once it has caught up (see
        // below), so it can tell whether this is someone new or the same
        // person on another device.
        joinRef.current = { announce: !!current.announceJoin, joinedAt: current.joinedAt || Date.now() };
        // A brand-new family starts with a few lists rather than an empty screen.
        if (current.createDefaults && store.lists().length === 0) {
          store.createList({ name: 'Groceries', emoji: iconToken('broccoli'), createdBy: current.name });
          store.createList({ name: 'House', emoji: iconToken('house'), createdBy: current.name });
          store.createList({ name: `${current.name}’s todos`, emoji: iconToken('seedling'), createdBy: current.name, personal: true, owner: current.name });
        }
        if (current.announceJoin || current.createDefaults) {
          const s = { ...current };
          delete s.announceJoin;
          delete s.createDefaults;
          saveSession(s);
          setSession(s);
        }
        setFamily({ keys, store, sync, activity });
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Could not open this family. Try leaving and joining again.');
      }
    })();
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t), clearInterval(t);
      if (onHide) {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onHide);
      }
      if (feed) feed.stop();
      if (sync) sync.stop();
    };
  }, [session?.code]);

  // Older sessions have no join time; stamp one so pre-existing data isn't reported as news.
  useEffect(() => {
    if (session && !session.joinedAt) {
      const s = { ...session, joinedAt: Date.now() };
      saveSession(s);
      setSession(s);
    }
  }, [session?.code]);

  const caughtUp = !!status.caughtUp;
  // Make sure this phone is listed as a member of the family, once it has
  // caught up (or after a few seconds offline).
  useEffect(() => {
    if (!family || !session?.name) return undefined;
    const run = () => {
      const join = joinRef.current || { announce: false, joinedAt: session.joinedAt || Date.now() };
      const me = family.store.getEntity('member', deviceId());
      if (!me || me.leftAt) {
        family.store.setMember(deviceId(), {
          name: session.name,
          device: describeDevice(),
          joinedAt: join.joinedAt,
          leftAt: null,
          // Existing installs upgrading to this version get a record without announcing a "join".
          backfilled: !join.announce,
        });
      } else if (me.name !== session.name) {
        family.store.setMember(deviceId(), { name: session.name });
      }
    };
    if (caughtUp) {
      run();
      return undefined;
    }
    const t = setTimeout(run, 8000);
    return () => clearTimeout(t);
  }, [family, caughtUp, session?.name]);

  // Everyone has an official personal list. Set it up once this phone has
  // caught up (so an existing one is found rather than duplicated), or after a
  // few seconds offline.
  useEffect(() => {
    if (!family || !session?.name) return undefined;
    const run = () => ensurePersonalList(family.store, session.name);
    if (caughtUp) {
      run();
      return undefined;
    }
    const t = setTimeout(run, 8000);
    return () => clearTimeout(t);
  }, [family, caughtUp, session?.name]);
  // Two of them (this phone made one before the original synced in): fold the
  // newer into the original. Checked on every change, since the original can
  // arrive at any time; only the owner's phones do it.
  const myListCount = family && session?.name ? family.store.lists().filter((l) => l.personal && sameName(l.owner, session.name)).length : 0;
  useEffect(() => {
    if (caughtUp && myListCount > 1) mergeDuplicatePersonalLists(family.store, session.name);
  }, [caughtUp, myListCount]);

  // Re-render on every store or activity change.
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!family) return undefined;
    const a = family.store.subscribe(bump);
    const b = family.activity.subscribe(bump);
    return () => {
      a();
      b();
    };
  }, [family]);

  const api = useMemo(
    () => ({
      session,
      status,
      store: family?.store,
      sync: family?.sync,
      activity: family?.activity,
      navigate,
      /** Tell the user something was deleted, and let them take it back for a few seconds. */
      deleted(text, undo) {
        showToast(text, undo);
      },
      join({ code, name, create = false }) {
        const s = { code, name: name.trim(), joinedAt: Date.now(), announceJoin: true, ...(create ? { createDefaults: true } : {}) };
        saveSession(s);
        setSession(s);
        navigate('/');
      },
      setName(name) {
        const s = { ...session, name: name.trim() };
        saveSession(s);
        setSession(s);
        if (family) {
          const { store } = family;
          const old = session.name;
          // Chores that were yours stay yours, unless another phone still goes by the old name.
          const oldStillUsed = store.members().some((m) => m.id !== deviceId() && !m.leftAt && sameName(m.name, old));
          if (!sameName(old, s.name) && !oldStillUsed) {
            for (const c of store.chores()) if (sameName(c.owner, old)) store.updateChore(c.id, { owner: s.name });
            renamePersonalList(store, old, s.name);
          }
          store.setMember(deviceId(), { name: s.name });
        }
      },
      async leave() {
        // Tell the others, give the relays a moment to take it, then forget the family on this phone.
        if (family) {
          family.store.setMember(deviceId(), { leftAt: Date.now() });
          family.activity.flushNow();
          await new Promise((r) => setTimeout(r, 1500));
        }
        clearSession();
        setSession(null);
        navigate('/');
      },
    }),
    [session, status, family],
  );

  // Ready once the screen's own content is on show (not a loading spinner).
  const screenReady = !!family && !!session && route.name !== 'join' && (route.name !== 'mine' || !!personalListFor(family.store.lists(), session.name));
  useScrollMemory(routeKey, screenReady, !!route.focus);

  if (!session || route.name === 'join') {
    return (
      <AppCtx.Provider value={api}>
        <Join prefillCode={route.name === 'join' ? route.code : ''} alreadyIn={!!session} />
      </AppCtx.Provider>
    );
  }

  if (error) {
    return (
      <div class="screen center">
        <p class="error">{error}</p>
        <button class="btn" onClick={api.leave}>Leave family</button>
      </div>
    );
  }

  if (!family) {
    return (
      <div class="screen center">
        <div class="spinner" />
        <p class="muted">Opening your family…</p>
      </div>
    );
  }

  let page;
  const mine = personalListFor(family.store.lists(), session.name);
  if (route.name === 'mine')
    page = mine ? <ListView id={mine.id} focus={route.focus} asTab /> : (
      <div class="screen center">
        <div class="spinner" />
        <p class="muted">Setting up your list…</p>
      </div>
    );
  else if (route.name === 'list') page = <ListView id={route.id} focus={route.focus} asTab={!!mine && route.id === mine.id} />;
  else if (route.name === 'settings') page = <Settings />;
  else if (route.name === 'baby') page = <Baby focus={route.focus} />;
  else if (route.name === 'house') page = <House focus={route.focus} />;
  else if (route.name === 'activity') page = <Activity />;
  else page = <Home />;

  return (
    <AppCtx.Provider value={api}>
      {page}
      <Toast
        toast={toast}
        onDismiss={dismissToast}
        onUndo={() => {
          const undo = toast && toast.undo;
          dismissToast();
          if (undo) undo();
        }}
      />
    </AppCtx.Provider>
  );
}
