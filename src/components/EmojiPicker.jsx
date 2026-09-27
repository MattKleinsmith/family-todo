const EMOJIS = ['🛒', '🏠', '📝', '✅', '🧺', '🍎', '🎁', '💊', '🧳', '🐶', '👶', '🔧', '📚', '🎉', '⭐', '💡', '🚗', '💰', '🌱', '🍽️'];

export function EmojiPicker({ value, onChange }) {
  return (
    <div class="field">
      <label>Icon</label>
      <div class="emoji-grid" role="radiogroup">
        {EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            role="radio"
            aria-checked={value === e}
            class={'emoji-opt' + (value === e ? ' selected' : '')}
            onClick={() => onChange(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
