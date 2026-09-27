import { useState } from 'preact/hooks';
import { extractEmoji } from '../emoji.js';

/** Icon field: switch the keyboard to emoji and type one. Anything else typed is ignored. */
export function EmojiPicker({ value, onChange }) {
  const [text, setText] = useState('');
  const onInput = (e) => {
    const v = e.currentTarget.value;
    const emoji = extractEmoji(v);
    if (emoji) {
      onChange(emoji);
      setText('');
    } else {
      setText(v.length > 1 ? '' : v);
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
          placeholder="Type an emoji"
          value={text}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={onInput}
        />
      </div>
      <p class="hint">Use your keyboard's emoji page. Any emoji works.</p>
    </div>
  );
}
