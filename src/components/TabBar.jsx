import { useApp } from '../app.jsx';
import { Glyph } from './Glyph.jsx';
import { overdueChores } from '../house.js';

export function TabBar({ active }) {
  const { store } = useApp();
  const overdue = store ? overdueChores(store.chores()).length : 0;
  const tab = (key, href, glyph, label, badge = 0) => (
    <a href={href} class={'tab' + (active === key ? ' active' : '')} aria-current={active === key ? 'page' : undefined} aria-label={badge ? `${label}, ${badge} overdue` : undefined}>
      <span class="tab-icon">
        <Glyph name={glyph} size={24} />
        {badge > 0 && <span class="badge tab-badge">{badge}</span>}
      </span>
      <span>{label}</span>
    </a>
  );
  return (
    <nav class="tabbar" aria-label="Sections">
      {tab('lists', '#/', 'memo', 'Lists')}
      {tab('baby', '#/baby', 'baby', 'Baby')}
      {tab('house', '#/house', 'house', 'House', overdue)}
    </nav>
  );
}
