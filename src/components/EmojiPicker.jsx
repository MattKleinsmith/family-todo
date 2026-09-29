import { useEffect, useRef, useState } from 'preact/hooks';
import { extractEmoji } from '../emoji.js';
import { ICONS, iconToken, iconSrc } from '../icons.js';
import { ListIcon } from './ListIcon.jsx';
import { ChevronIcon } from './Icons.jsx';

/**
 * Icon field: pick one of the themed icons, or switch the keyboard to emoji
 * and type any emoji. There is no way for a web page to open the phone's
 * emoji keyboard, so the field explains itself when letters arrive.
 *
 * The grid never scrolls on its own inside the (already scrolling) sheet: it
 * shows two rows, the current icon and the `prefer`red ones first, and
 * "More icons" opens the rest in place so the sheet scrolls as one.
 */
export function EmojiPicker({ value, onChange, prefer = [] }) {
  const [text, setText] = useState('');
  const [nudge, setNudge] = useState(false);
  const [all, setAll] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onInput = (e) => {
    const v = e.currentTarget.value;
    e.currentTarget.value = ''; // the field never holds text; state alone won't clear an already-empty controlled input
    const emoji = extractEmoji(v);
    if (emoji) {
      onChange(emoji);
      setText('');
      setNudge(false);
      return;
    }
    setText('');
    if (v.trim()) {
      setNudge(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNudge(false), 3000);
    }
  };

  return (
    <div class="field">
      <label for="emoji-input">Icon</label>
      <div class="emoji-search-row">
        <div class="emoji-current" aria-label="Current icon"><ListIcon value={value} size={30} /></div>
        <input
          id="emoji-input"
          type="text"
          placeholder="Type any emoji…"
          value={text}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={onInput}
        />
      </div>
      <p class={'hint' + (nudge ? ' warn' : '')} aria-live="polite">
        {nudge ? 'Just emoji here. Tap the 😀 or 🌐 key on your keyboard to pick one.' : 'Pick one below, or type any emoji from your keyboard.'}
      </p>
      <div class={'icon-grid' + (all ? '' : ' collapsed')} role="radiogroup" aria-label="Themed icons">
        {ordered(value, prefer).slice(0, all ? undefined : COLLAPSED).map((i) => {
          const token = iconToken(i.id);
          return (
            <button type="button" key={i.id} role="radio" aria-checked={value === token} aria-label={i.name} class={'icon-opt' + (value === token ? ' selected' : '')} onClick={() => onChange(token)}>
              <img src={iconSrc(i.id)} alt="" width="32" height="32" draggable={false} />
            </button>
          );
        })}
      </div>
      <button type="button" class={'btn more-icons' + (all ? ' open' : '')} aria-expanded={all} onClick={() => setAll(!all)}>
        {all ? 'Fewer icons' : `More icons (${ICONS.length})`}
        <span class="more-chev" aria-hidden="true"><ChevronIcon /></span>
      </button>
    </div>
  );
}

// Enough to fill two rows on a wide screen; CSS shows only the first two rows.
const COLLAPSED = 20;

/** The current icon first, then the preferred ones, then everything else in the usual order. */
function ordered(value, prefer) {
  const byId = new Map(ICONS.map((i) => [i.id, i]));
  const current = typeof value === 'string' && value.startsWith('icon:') ? value.slice(5) : null;
  const first = [current, ...prefer].filter((id, k, arr) => id && byId.has(id) && arr.indexOf(id) === k);
  return [...first.map((id) => byId.get(id)), ...ICONS.filter((i) => !first.includes(i.id))];
}
