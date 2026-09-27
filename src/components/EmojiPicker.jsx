import { useEffect, useRef, useState } from 'preact/hooks';
import { extractEmoji } from '../emoji.js';
import { ICONS, iconToken, iconSrc } from '../icons.js';
import { ListIcon } from './ListIcon.jsx';

/**
 * Icon field: pick one of the themed icons, or switch the keyboard to emoji
 * and type any emoji. There is no way for a web page to open the phone's
 * emoji keyboard, so the field explains itself when letters arrive.
 */
export function EmojiPicker({ value, onChange }) {
  const [text, setText] = useState('');
  const [nudge, setNudge] = useState(false);
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
      <div class="icon-grid" role="radiogroup" aria-label="Themed icons">
        {ICONS.map((i) => {
          const token = iconToken(i.id);
          return (
            <button type="button" key={i.id} role="radio" aria-checked={value === token} aria-label={i.name} class={'icon-opt' + (value === token ? ' selected' : '')} onClick={() => onChange(token)}>
              <img src={iconSrc(i.id)} alt="" width="32" height="32" draggable={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
