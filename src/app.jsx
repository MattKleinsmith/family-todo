import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { loadSession, saveSession, clearSession } from './session.js';
import { deriveKeys } from './keys.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { createActivity } from './activity.js';
import { deviceId, describeDevice } from './device.js';
import { useRoute, navigate } from './router.js';
import { Join } from './components/Join.jsx';
import { Home } from './components/Home.jsx';
import { ListView } from './components/ListView.jsx';
import { Settings } from './components/Settings.jsx';
import { Baby } from './components/Baby.jsx';
import { Activity } from './components/Activity.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function App() {
  const [session, setSession] = useState(loadSession);
  const [family, setFamily] = useState(null); // { keys, store, sync, activity }
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [status, setStatus] = useState({ connected: 0, total: 0, lastSyncAt: null, online: false });
  const [error, setError] = useState(null);
  const route = useRoute();

  // Boot (or re-boot) the store + sync whenever the family code changes.
  useEffect(() => {
    if (!session) {
      setFamily(null);
      return;
    }
    let cancelled = false;
    let sync = null;
    (async () => {
      try {
        const keys = await deriveKeys(session.code);
        if (cancelled) return;
        const store = createStore({ storageKey: `ft:data:${keys.pk}`, actor: () => sessionRef.current?.name || '' });
        const activity = createActivity({
          store,
          storageKey: `ft:activity:${keys.pk}`,
          since: () => sessionRef.current?.joinedAt || 0,
          self: () => sessionRef.current?.name || '',
        });
        sync = createSync({ keys, store, onStatus: setStatus });
        sync.start();
        // Make sure this phone is listed as a member of the family.
        const me = store.getEntity('member', deviceId());
        const current = sessionRef.current;
        if (!me || me.leftAt) {
          store.setMember(deviceId(), {
            name: current.name,
            device: describeDevice(),
            joinedAt: current.joinedAt || Date.now(),
            leftAt: null,
            // Existing installs upgrading to this version get a record without announcing a "join".
            backfilled: !current.announceJoin,
          });
          if (current.announceJoin) {
            const s = { ...current };
            delete s.announceJoin;
            saveSession(s);
            setSession(s);
          }
        } else if (me.name !== current.name) {
          store.setMember(deviceId(), { name: current.name });
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
      join({ code, name }) {
        const s = { code, name: name.trim(), joinedAt: Date.now(), announceJoin: true };
        saveSession(s);
        setSession(s);
        navigate('/');
      },
      setName(name) {
        const s = { ...session, name: name.trim() };
        saveSession(s);
        setSession(s);
        if (family) family.store.setMember(deviceId(), { name: s.name });
      },
      async leave() {
        // Tell the others, give the relays a moment to take it, then forget the family on this phone.
        if (family) {
          family.store.setMember(deviceId(), { leftAt: Date.now() });
          await new Promise((r) => setTimeout(r, 1500));
        }
        clearSession();
        setSession(null);
        navigate('/');
      },
    }),
    [session, status, family],
  );

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
  if (route.name === 'list') page = <ListView id={route.id} />;
  else if (route.name === 'settings') page = <Settings />;
  else if (route.name === 'baby') page = <Baby />;
  else if (route.name === 'activity') page = <Activity />;
  else page = <Home />;

  return <AppCtx.Provider value={api}>{page}</AppCtx.Provider>;
}
