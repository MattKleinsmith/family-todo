import { useEffect, useState } from 'preact/hooks';

export function parseRoute(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const focus = params.get('focus') || null; // an entity to scroll to and highlight
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'list' && parts[1]) return { name: 'list', id: parts[1], focus };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'baby') return { name: 'baby', focus };
  if (parts[0] === 'house') return { name: 'house', focus };
  if (parts[0] === 'mine') return { name: 'mine', focus };
  if (parts[0] === 'activity') return { name: 'activity' };
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
