import { Glyph } from './Glyph.jsx';

export function TabBar({ active }) {
  return (
    <nav class="tabbar" aria-label="Sections">
      <a href="#/" class={'tab' + (active === 'lists' ? ' active' : '')} aria-current={active === 'lists' ? 'page' : undefined}>
        <span class="tab-icon"><Glyph name="memo" size={24} /></span>
        <span>Lists</span>
      </a>
      <a href="#/baby" class={'tab' + (active === 'baby' ? ' active' : '')} aria-current={active === 'baby' ? 'page' : undefined}>
        <span class="tab-icon"><Glyph name="baby" size={24} /></span>
        <span>Baby</span>
      </a>
    </nav>
  );
}
