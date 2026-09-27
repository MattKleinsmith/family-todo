import { iconSrc } from '../icons.js';

/**
 * The app's own pictures (tab bar, baby card, buttons) drawn from the bundled
 * Noto artwork, so they look soft and flat on every phone instead of picking
 * up each platform's emoji style. `name` is a file in public/icons/set.
 */
export function Glyph({ name, size = 24, label = '' }) {
  return (
    <img
      class="glyph"
      src={iconSrc(name)}
      width={size}
      height={size}
      alt={label}
      aria-hidden={label ? undefined : 'true'}
      draggable={false}
    />
  );
}
