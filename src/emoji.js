// Emoji search for the list icon picker. The full emoji table is loaded lazily
// (it's ~100 KB) the first time the picker opens.

const RECENT_KEY = 'ft:recent-emoji';
const RECENT_MAX = 24;

/** Shown when the search box is empty: things households actually make lists for. */
export const SUGGESTED = [
  '🛒', '🥦', '🏠', '📝', '✅', '🧺', '🍎', '🧹', '🔧', '🎁', '💊', '🧳', '✈️', '🐶', '🐱', '👶',
  '📚', '🎉', '🎂', '⭐', '💡', '🚗', '💰', '🌱', '🍽️', '🍕', '☕', '🍷', '🏋️', '🎬', '🎮', '🎨',
  '💻', '📦', '🧾', '🏥', '🦷', '🏫', '🎒', '🏖️', '⛺', '🎄', '🎃', '💐', '🛠️', '🧼', '🧻', '🥫',
];

let tablePromise = null;
export function loadEmojiTable() {
  if (!tablePromise) tablePromise = import('./emoji-data.json').then((m) => m.default || m);
  return tablePromise;
}

/** Search the table by name/keyword. Whole-word matches rank above prefix matches, which rank above substrings. */
export function searchEmoji(table, query, limit = 60) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored = [];
  for (let i = 0; i < table.length; i++) {
    const [emoji, words] = table[i];
    let score = 0;
    for (const term of terms) {
      const idx = words.indexOf(term);
      if (idx === -1) {
        score = -1;
        break;
      }
      const atWordStart = idx === 0 || words[idx - 1] === ' ';
      const end = idx + term.length;
      const atWordEnd = end === words.length || words[end] === ' ';
      let s = 1; // substring
      if (atWordStart && atWordEnd) s = 4; // whole word
      else if (atWordStart) s = 2; // prefix
      if (idx === 0) s += 1; // the emoji's primary name
      score += s;
    }
    if (score > 0) scored.push([score, i, emoji]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, , e]) => e);
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const pictographic = /\p{Extended_Pictographic}/u;

/** First emoji typed into a string (so pasting or using the keyboard's emoji page just works), or null. */
export function extractEmoji(input) {
  if (!input) return null;
  const graphemes = segmenter ? [...segmenter.segment(input)].map((s) => s.segment) : Array.from(input);
  for (const g of graphemes) {
    if (pictographic.test(g) || /[\u{1F1E6}-\u{1F1FF}]/u.test(g)) return g;
  }
  return null;
}

export function loadRecent(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(emoji, storage = globalThis.localStorage) {
  const next = [emoji, ...loadRecent(storage).filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
