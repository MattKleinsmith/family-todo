import { iconId, iconSrc, iconName } from '../icons.js';

/** Renders a list's icon: a themed SVG for "icon:<id>" tokens, otherwise the emoji character. */
export function ListIcon({ value, size = 26, fallback = '📝' }) {
  const id = iconId(value);
  if (id) return <img class="list-icon" src={iconSrc(id)} width={size} height={size} alt={iconName(value)} draggable={false} />;
  return <span class="list-icon-emoji" style={{ fontSize: `${size}px` }}>{value || fallback}</span>;
}
