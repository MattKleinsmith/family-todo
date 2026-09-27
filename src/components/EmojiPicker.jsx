import { useEffect, useRef, useState } from 'preact/hooks';
import { extractEmoji } from '../emoji.js';

/**
 * Icon field. There is no way for a web page to open the phone's emoji
 * keyboard, so the field asks for it and explains itself when letters arrive.
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
    // Letters typed: keep the field clear and say why, briefly.
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
        <div class="emoji-current" aria-label="Current icon">{value || '📝'}</div>
        <input
          id="emoji-input"
          type="text"
          placeholder="Tap 😀 on your keyboard, pick one"
          value={text}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={onInput}
        />
      </div>
      <p class={'hint' + (nudge ? ' warn' : '')} aria-live="polite">
        {nudge ? 'Just emoji here. Tap the 😀 or 🌐 key on your keyboard to pick one.' : 'Any emoji works. The 😀 or 🌐 key on your keyboard opens the emoji picker.'}
      </p>
    </div>
  );
}
