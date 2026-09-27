import { useEffect, useState } from 'preact/hooks';

export function parseRoute(hash) {
  const path = (hash || '').replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'list' && parts[1]) return { name: 'list', id: parts[1] };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'baby') return { name: 'baby' };
  if (parts[0] === 'join') return { name: 'join', code: decodeURIComponent(parts.slice(1).join('/')) };
  return { name: 'home' };
}

export function navigate(path) {
  location.hash = path;
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
