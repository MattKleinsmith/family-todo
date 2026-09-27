import { iconId, iconSrc, iconName } from '../icons.js';

/** Renders a list's icon: a themed SVG for "icon:<id>" tokens (or none), otherwise the typed emoji. */
export function ListIcon({ value, size = 26 }) {
  const id = iconId(value) || (value ? null : 'memo');
  if (id) return <img class="list-icon" src={iconSrc(id)} width={size} height={size} alt={iconName(value) || 'List'} draggable={false} />;
  return <span class="list-icon-emoji" style={{ fontSize: `${size}px` }}>{value}</span>;
}
