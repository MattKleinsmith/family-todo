import { useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';

export function Home() {
  const { store, navigate } = useApp();
  const [creating, setCreating] = useState(false);
  const lists = store.lists();

  return (
    <div class="screen">
      <header class="topbar">
        <h1>Lists</h1>
        <div class="topbar-actions">
          <SyncBadge />
          <button class="icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>⚙︎</button>
        </div>
      </header>

      {lists.length === 0 ? (
        <div class="empty">
          <p class="big-emoji">🛒</p>
          <p>No lists yet. Make a grocery list, a house to-do list, or one just for you.</p>
        </div>
      ) : (
        <ul class="cards">
          {lists.map((l) => {
            const items = store.itemsFor(l.id);
            const left = items.filter((i) => !i.done).length;
            return (
              <li key={l.id}>
                <a class="card" href={`#/list/${l.id}`}>
                  <span class="card-emoji">{l.emoji || '📝'}</span>
                  <span class="card-body">
                    <span class="card-title">{l.name}</span>
                    <span class="card-sub">
                      {left === 0 ? (items.length ? 'All done' : 'Empty') : `${left} to go`}
                    </span>
                  </span>
                  <span class="chev">›</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <div class="bottom-bar">
        <button class="btn primary big" onClick={() => setCreating(true)}>+ New list</button>
      </div>

      {creating && <NewListSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewListSheet({ onClose }) {
  const { store, session, navigate } = useApp();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛒');

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
