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
import { choreStatus } from '../house.js';
import { isOfficialPersonal, personalListFor } from '../personal.js';
import { swipeDelete } from './SwipeAction.jsx';

export function Home() {
  const { store, activity, navigate, deleted, session } = useApp();
  const [creating, setCreating] = useState(false);
  const all = store.lists();
  // Your own list has its own tab; everyone else's, and the shared ones, are here.
  const mine = personalListFor(all, session.name);
  const lists = all.filter((l) => !mine || l.id !== mine.id);
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
            const repeating = store.choresFor(l.id);
            const repeatLeft = repeating.filter((c) => choreStatus(c).state !== 'done').length;
            const count = items.length + repeating.length;
            const fresh = activity ? activity.unseenForList(l.id) : 0;
            // Someone's own list can be emptied but not deleted.
            const official = isOfficialPersonal(l, all);
            const swipe = official ? { row: {}, action: null } : swipeDelete(
              () => {
                const what = count ? `“${l.name}” and its ${count} item${count === 1 ? '' : 's'}` : `“${l.name}”`;
                if (!confirm(`Delete ${what}?`)) return;
                const itemIds = items.map((i) => i.id);
                const choreIds = repeating.map((c) => c.id);
                store.deleteList(l.id);
                deleted(`Deleted “${l.name}”`, () => store.restoreList(l.id, itemIds, choreIds));
              },
              { confirm: true },
            );
            return (
              <li key={l.id} data-id={l.id} class={'card-row' + (official ? '' : ' swipe-row')} {...swipe.row}>
                <a class="card" href={`#/list/${l.id}`}>
                  <span class="card-emoji"><ListIcon value={l.emoji} size={28} /></span>
                  <span class="card-body">
                    <span class="card-title">{l.name}</span>
                    <span class="card-sub">
                      {left === 0 ? (items.length ? 'All done' : repeating.length ? '' : 'Empty') : `${left} to go`}
                      {repeating.length > 0 && (
                        <span>
                          {left || items.length ? ' · ' : ''}
                          {repeatLeft ? `${repeatLeft} repeating left` : 'repeating all done'}
                        </span>
                      )}
                      {fresh > 0 && <span class="fresh"> · {fresh} new change{fresh === 1 ? '' : 's'}</span>}
                    </span>
                  </span>
                  <span class="grip" role="button" aria-label={`Drag to reorder ${l.name}`} {...grip}><GripIcon /></span>
                </a>
                {swipe.action}
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
