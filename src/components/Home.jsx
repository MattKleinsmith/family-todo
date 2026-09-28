import { useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';
import { TabBar } from './TabBar.jsx';
import { GearIcon, GripIcon } from './Icons.jsx';
import { gripProps } from '../drag.js';
import { Bell } from './Bell.jsx';
import { ListIcon } from './ListIcon.jsx';
import { Glyph } from './Glyph.jsx';
import { iconToken } from '../icons.js';

export function Home() {
  const { store, activity, navigate } = useApp();
  const [creating, setCreating] = useState(false);
  const lists = store.lists();
  const cardsRef = useRef(null);
  const grip = gripProps(() => ({ container: cardsRef.current, onDrop: (ids, moved) => store.moveTo('list', moved, ids) }));

  return (
    <div class="screen has-tabs">
      <header class="topbar">
        <h1>Lists</h1>
        <div class="topbar-actions">
          <SyncBadge />
          <Bell />
          <button class="icon-btn gear" aria-label="Settings" onClick={() => navigate('/settings')}><GearIcon /></button>
        </div>
      </header>

      <div class="content">
      {lists.length === 0 ? (
        <div class="empty">
          <p class="big-emoji"><Glyph name="shopping-cart" size={56} /></p>
          <p>No lists yet. Make a grocery list, a house to-do list, or one just for you.</p>
        </div>
      ) : (
        <ul class="cards" ref={cardsRef}>
          {lists.map((l) => {
            const items = store.itemsFor(l.id);
            const left = items.filter((i) => !i.done).length;
            const fresh = activity ? activity.unseenForList(l.id) : 0;
            return (
              <li key={l.id} data-id={l.id} class="card-row">
                <a class="card" href={`#/list/${l.id}`}>
                  <span class="card-emoji"><ListIcon value={l.emoji} size={28} /></span>
                  <span class="card-body">
                    <span class="card-title">{l.name}</span>
                    <span class="card-sub">
                      {left === 0 ? (items.length ? 'All done' : 'Empty') : `${left} to go`}
                      {fresh > 0 && <span class="fresh"> · {fresh} new change{fresh === 1 ? '' : 's'}</span>}
                    </span>
                  </span>
                  <span class="grip" role="button" aria-label={`Drag to reorder ${l.name}`} {...grip}><GripIcon /></span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      </div>

      <div class="bottom-bar">
        <button class="btn primary big" onClick={() => setCreating(true)}>+ New list</button>
      </div>
      <TabBar active="lists" />

      {creating && <NewListSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewListSheet({ onClose }) {
  const { store, session, navigate } = useApp();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(iconToken('shopping-cart'));

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const list = store.createList({ name, emoji, createdBy: session.name });
    onClose();
    navigate(`/list/${list.id}`);
  };

  return (
    <Sheet title="New list" onClose={onClose}>
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label for="listname">Name</label>
          <input id="listname" type="text" placeholder="Groceries" value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
        </div>
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <button class="btn primary big" type="submit" disabled={!name.trim()}>Create</button>
      </form>
    </Sheet>
  );
}
