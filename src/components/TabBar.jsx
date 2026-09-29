import { useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Glyph } from './Glyph.jsx';
import { ListIcon } from './ListIcon.jsx';
import { Sheet } from './Sheet.jsx';
import { GripIcon } from './Icons.jsx';
import { overdueChores } from '../house.js';
import { personalListFor } from '../personal.js';
import { loadTabOrder, saveTabOrder, TAB_KEYS } from '../tabs.js';
import { gripProps } from '../drag.js';

const HOLD_MS = 500;

/**
 * The bottom bar. Press and hold any tab to rearrange them; the order is this
 * phone's own.
 */
export function TabBar({ active }) {
  const { store, session } = useApp();
  const [order, setOrder] = useState(loadTabOrder);
  const [arranging, setArranging] = useState(false);
  const hold = useRef(null);

  const overdue = store ? overdueChores(store.houseChores()).length : 0;
  const mine = store ? personalListFor(store.lists(), session?.name) : null;
  const TABS = {
    baby: { href: '#/baby', label: 'Baby', icon: <Glyph name="baby" size={24} /> },
    house: { href: '#/house', label: 'House', icon: <Glyph name="house" size={24} />, badge: overdue },
    mine: { href: '#/mine', label: 'Me', icon: mine && mine.emoji ? <ListIcon value={mine.emoji} size={24} /> : <Glyph name="seedling" size={24} /> },
    lists: { href: '#/', label: 'Lists', icon: <Glyph name="memo" size={24} /> },
  };

  // Press and hold: a long press opens the arrange sheet instead of switching tabs.
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
  };
  const onPointerDown = (e) => {
    cancelHold();
    const start = { x: e.clientX, y: e.clientY, fired: false };
    start.timer = setTimeout(() => {
      start.fired = true;
      setArranging(true);
    }, HOLD_MS);
    hold.current = start;
  };
  const onPointerMove = (e) => {
    const h = hold.current;
    if (h && !h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) clearTimeout(h.timer);
  };
  const onClickCapture = (e) => {
    if (hold.current && hold.current.fired) {
      e.preventDefault();
      e.stopPropagation();
    }
    hold.current = null;
  };

  return (
    <>
      <nav
        class="tabbar"
        aria-label="Sections (press and hold to rearrange)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onClickCapture={onClickCapture}
        onContextMenu={(e) => e.preventDefault()}
      >
        {order.map((key) => {
          const t = TABS[key];
          const on = active === key;
          return (
            <a key={key} href={t.href} class={'tab' + (on ? ' active' : '')} aria-current={on ? 'page' : undefined} aria-label={t.badge ? `${t.label}, ${t.badge} overdue` : undefined} draggable={false}>
              <span class="tab-icon">
                {t.icon}
                {t.badge > 0 && <span class="badge tab-badge">{t.badge}</span>}
              </span>
              <span>{t.label}</span>
            </a>
          );
        })}
      </nav>
      {arranging && (
        <ArrangeSheet
          order={order}
          tabs={TABS}
          onChange={(next) => {
            setOrder(next);
            saveTabOrder(next);
          }}
          onClose={() => setArranging(false)}
        />
      )}
    </>
  );
}

function ArrangeSheet({ order, tabs, onChange, onClose }) {
  const listRef = useRef(null);
  const grip = gripProps(() => ({ container: listRef.current, onDrop: (ids) => onChange(ids) }));
  const isDefault = order.join() === TAB_KEYS.join();
  return (
    <Sheet title="Arrange tabs" onClose={onClose}>
      <div class="stack">
        <p class="hint">Drag to change the order of the tabs at the bottom. This is just for this phone.</p>
        <ul class="items arrange" ref={listRef}>
          {order.map((key) => (
            <li key={key} data-id={key} class="item arrange-row">
              <span class="arrange-icon">{tabs[key].icon}</span>
              <span class="arrange-label">{tabs[key].label}</span>
              <span class="grip" role="button" aria-label={`Drag to move ${tabs[key].label}`} {...grip}><GripIcon /></span>
            </li>
          ))}
        </ul>
        <button class="btn big" type="button" disabled={isDefault} onClick={() => onChange([...TAB_KEYS])}>Back to the usual order</button>
        <button class="btn primary big" type="button" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}
