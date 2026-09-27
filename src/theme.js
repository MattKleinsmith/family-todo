// Appearance: 'light' (default), 'dark', or 'auto' (follow the phone). Per phone.
const KEY = 'ft:theme';
export const THEMES = ['light', 'dark', 'auto'];

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.includes(t) ? t : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Sets data-theme on <html> and keeps the browser chrome colour in step. */
export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', bg);
}

/** Re-apply when the phone flips between light and dark while in auto. */
export function watchSystemTheme() {
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) mq.addEventListener('change', () => applyTheme());
}
