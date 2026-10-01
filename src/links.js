// Links on items and chores, like the Google Form a daily task is about.
// They arrive from other phones, so only web links are ever opened.

/** A web address from what someone typed or pasted ("forms.gle/abc" gets https://), or null. */
export function normalizeLink(raw) {
  const t = (raw || '').trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.href;
}

/** A stored link that's safe to open, or null. */
export function safeLink(link) {
  return typeof link === 'string' ? normalizeLink(link) : null;
}

/** Short label for a link: its site, "docs.google.com". */
export function linkLabel(link) {
  const url = safeLink(link);
  if (!url) return '';
  return new URL(url).hostname.replace(/^www\./, '');
}
