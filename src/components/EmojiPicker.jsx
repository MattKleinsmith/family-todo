import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SUGGESTED, loadEmojiTable, searchEmoji, extractEmoji, loadRecent, pushRecent } from '../emoji.js';

/**
 * Icon picker. Type a word to search every emoji, or switch the phone keyboard
 * to emoji and type one directly to use it as-is.
 */
export function EmojiPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [table, setTable] = useState(null);
  const [recent, setRecent] = useState(() => loadRecent());
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadEmojiTable().then((t) => alive && setTable(t));
    return () => {
      alive = false;
    };
  }, []);

  const typed = extractEmoji(query);
  const results = useMemo(() => (table && !typed ? searchEmoji(table, query) : []), [table, query, typed]);

  const pick = (emoji) => {
    onChange(emoji);
    setRecent(pushRecent(emoji));
    setQuery('');
  };

  useEffect(() => {
    if (typed) pick(typed);
  }, [typed]);

  const searching = query.trim().length > 0 && !typed;
  let grid;
  if (searching) {
    grid = table ? results : [];
  } else {
    const seen = new Set();
    grid = [...recent, ...SUGGESTED].filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
  }

  return (
    <div class="field">
      <label for="emoji-search">Icon</label>
      <div class="emoji-search-row">
        <div class="emoji-current" aria-label="Current icon">{value || '📝'}</div>
        <input
          id="emoji-search"
          ref={inputRef}
          type="text"
          placeholder="Search, or type any emoji"
          value={query}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div class="emoji-grid" role="radiogroup" aria-label="Emoji">
        {grid.map((e) => (
          <button
            type="button"
            key={e}
            role="radio"
            aria-checked={value === e}
            class={'emoji-opt' + (value === e ? ' selected' : '')}
            onClick={() => pick(e)}
          >
            {e}
          </button>
        ))}
      </div>
      {searching && table && results.length === 0 && <p class="hint">No matches. Try another word, or type the emoji itself.</p>}
      {searching && !table && <p class="hint">Loading emoji…</p>}
    </div>
  );
}
