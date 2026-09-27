// Keep the installed (home-screen) app fresh. iOS keeps PWAs alive for days
// without a real page load, so the browser rarely checks for a new service
// worker on its own. We check whenever the app comes to the foreground and
// once an hour; when a new build has been installed, the page reloads itself.
import { registerSW } from 'virtual:pwa-register';

let registration = null;
let listeners = new Set();

export function setupPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) return;
      const check = () => {
        if (navigator.onLine) r.update().catch(() => {});
      };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
    },
    onNeedRefresh() {
      // Only reached in "prompt" mode; in autoUpdate mode the page reloads on its own.
      for (const fn of listeners) fn();
    },
  });
}

/** Ask the browser to look for a newer build right now. Resolves true if one is being installed. */
export async function checkForUpdate() {
  if (!registration) return false;
  try {
    await registration.update();
  } catch {
    return false;
  }
  return !!(registration.installing || registration.waiting);
}

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
