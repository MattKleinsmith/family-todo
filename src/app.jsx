import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { loadSession, saveSession, clearSession } from './session.js';
import { deriveKeys } from './keys.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { useRoute, navigate } from './router.js';
import { Join } from './components/Join.jsx';
import { Home } from './components/Home.jsx';
import { ListView } from './components/ListView.jsx';
import { Settings } from './components/Settings.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function App() {
  const [session, setSession] = useState(loadSession);
  const [family, setFamily] = useState(null); // { keys, store, sync }
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
        const store = createStore({ storageKey: `ft:data:${keys.pk}` });
        sync = createSync({ keys, store, onStatus: setStatus });
        sync.start();
        setFamily({ keys, store, sync });
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

  // Re-render on every store change.
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => (family ? family.store.subscribe(bump) : undefined), [family]);

  const api = useMemo(
    () => ({
      session,
      status,
      store: family?.store,
      sync: family?.sync,
      navigate,
      join({ code, name }) {
        const s = { code, name: name.trim() };
        saveSession(s);
        setSession(s);
        navigate('/');
      },
      setName(name) {
        const s = { ...session, name: name.trim() };
        saveSession(s);
        setSession(s);
      },
      leave() {
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
  else page = <Home />;

  return <AppCtx.Provider value={api}>{page}</AppCtx.Provider>;
}
