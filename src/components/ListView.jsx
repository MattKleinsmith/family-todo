import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';
import { BackIcon, DotsIcon, GripIcon } from './Icons.jsx';
import { gripProps } from '../drag.js';
import { focusWithoutScrolling } from '../focus.js';
import { ListIcon } from './ListIcon.jsx';
import { iconToken } from '../icons.js';
import { swipeDelete } from './SwipeAction.jsx';
import { newestOf, useMarkSeen } from './useSeen.js';
import { ChoreRow, ChoreSheet, NewChoreSheet, useChoreToggle } from './House.jsx';
import { CADENCES, CADENCE_LABEL, choreStatus } from '../house.js';
import { TabBar } from './TabBar.jsx';
import { isOfficialPersonal } from '../personal.js';

/** One list. `asTab`: it's your own list on the My list tab (no back button, tab bar underneath). */
export function ListView({ id, focus, asTab = false }) {
  const { store, session, navigate, deleted } = useApp();
  const list = store.get().lists[id];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // item id
  const [editingChore, setEditingChore] = useState(null); // repeating item id
  const [addingRepeat, setAddingRepeat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, tick] = useReducer((x) => x + 1, 0);
  const repRef = useRef(null);
  const repGrip = gripProps(() => ({ container: repRef.current, onDrop: (ids, moved) => store.moveTo('chore', moved, ids) }));
  const [showDone, setShowDone] = useState(true);
  const [flash, setFlash] = useState(null);
  const inputRef = useRef(null);
  const openRef = useRef(null);
  const grip = gripProps(() => ({ container: openRef.current, onDrop: (ids, moved) => store.moveTo('item', moved, ids) }));
  // Deleted items count too: seeing that they're gone is seeing the change.
  useMarkSeen(`list:${id}`, newestOf([list, ...Object.values(store.get().items).filter((i) => i.listId === id), ...Object.values(store.get().chores).filter((c) => c.listId === id)]));
  const highlight = (cid) => {
    setFlash(cid);
    setTimeout(() => setFlash((cur) => (cur === cid ? null : cur)), 1500);
  };
  const toggleChore = useChoreToggle(highlight);

  // Repeating items roll over at midnight (and on Mondays, and the 1st) while the list is open.
  useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  // Arriving from the activity feed: scroll to the item in question and highlight it briefly.
  useEffect(() => {
    if (!focus) return;
    setShowDone(true);
    setFlash(focus);
    const t = setTimeout(() => {
      (document.getElementById(`item-${focus}`) || document.getElementById(`chore-${focus}`))?.scrollIntoView({ block: 'center' });
    }, 50);
    const clear = setTimeout(() => setFlash(null), 2000);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [focus]);

  useEffect(() => {
    if (list && list.deleted) navigate('/');
  }, [list?.deleted]);

  if (!list || list.deleted) {
    return (
      <div class="screen center">
        <p class="muted">This list is gone.</p>
        <button class="btn" onClick={() => navigate('/')}>Back to lists</button>
      </div>
    );
  }

  const items = store.itemsFor(id);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const now = Date.now();
  const repeating = store.choresFor(id).map((c) => ({ chore: c, status: choreStatus(c, now) }));
  const repeatingDone = repeating.filter((x) => x.status.done).length;
  const removeChore = (c) => {
    store.deleteChore(c.id);
    deleted(`Deleted “${c.name}”`, () => store.updateChore(c.id, { deleted: false }));
  };

  const remove = (item) => {
    store.deleteItem(item.id);
    deleted(`Deleted “${item.text}”`, () => store.updateItem(item.id, { deleted: false }));
  };

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const added = store.addItem({ listId: id, text, createdBy: session.name });
    setText('');
    inputRef.current && inputRef.current.focus({ preventScroll: true });
    if (added) requestAnimationFrame(() => document.getElementById(`item-${added.id}`)?.scrollIntoView({ block: 'nearest' }));
  };

  return (
    <div class={asTab ? 'screen has-tabs list-tab' : 'screen'}>
      <header class="topbar">
        {!asTab && <button class="icon-btn back" aria-label="Back" onClick={() => navigate('/')}><BackIcon /></button>}
        <h1 class="title-with-emoji">
          {/* On the My list tab the tab itself shows the icon. */}
          {!asTab && <span class="title-icon"><ListIcon value={list.emoji} size={28} /></span>} {list.name}
        </h1>
        <div class="topbar-actions">
          <SyncBadge />
          <button class="icon-btn" aria-label="List options" onClick={() => setMenu(true)}><DotsIcon /></button>
        </div>
      </header>

      <div class="content">
      {items.length === 0 && repeating.length === 0 && (
        <div class="empty small">
          <p>Nothing here yet. Add your first item.</p>
        </div>
      )}

      {/* Only lists that have repeating items get this group; it's how they're told apart from one-offs. */}
      {repeating.length > 0 && (
        <section class="list-group">
          <div class="day-head">
            <span>Repeating</span>
            <span class="day-stats">{repeatingDone} of {repeating.length} done</span>
          </div>
          <ul class="items" ref={repRef}>
            {repeating.map((x) => (
              <ChoreRow
                key={x.chore.id}
                {...x}
                now={now}
                showCadence
                flash={flash === x.chore.id}
                grip={repeating.length > 1 ? repGrip : null}
                onToggle={() => toggleChore(x)}
                onEdit={() => setEditingChore(x.chore.id)}
                onDelete={() => removeChore(x.chore)}
              />
            ))}
          </ul>
        </section>
      )}
      {repeating.length > 0 && open.length > 0 && (
        <div class="day-head list-head"><span>To do</span></div>
      )}

      {open.length > 0 && (
        <ul class="items" ref={openRef}>
          {open.map((item) => (
            <ItemRow key={item.id} item={item} grip={open.length > 1 ? grip : null} flash={flash === item.id} onToggle={() => store.toggleItem(item.id)} onEdit={() => setEditing(item.id)} onDelete={() => remove(item)} />
          ))}
        </ul>
      )}

      {/* Right under the list, so the keyboard moves things as little as possible;
          on a long list it sticks to the bottom of the visible area. */}
      <form class="add-bar inline" onSubmit={add}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Add an item…"
          value={text}
          enterkeyhint="done"
          autocomplete="off"
          onTouchEnd={focusWithoutScrolling}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button class="btn primary" type="submit" disabled={!text.trim()} aria-label="Add">Add</button>
      </form>

      {done.length > 0 && (
        <>
          <button class="section-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Done ({done.length})
          </button>
          {showDone && (
            <ul class="items done">
              {done.map((item) => (
                <ItemRow key={item.id} item={item} flash={flash === item.id} onToggle={() => store.toggleItem(item.id)} onEdit={() => setEditing(item.id)} onDelete={() => remove(item)} />
              ))}
            </ul>
          )}
        </>
      )}
      </div>


      {asTab && <TabBar active="mine" />}

      {editing && store.get().items[editing] && !store.get().items[editing].deleted && (
        <EditItemSheet
          item={store.get().items[editing]}
          onClose={() => setEditing(null)}
          onRepeat={(c) => {
            setEditing(null);
            highlight(c.id);
            requestAnimationFrame(() => document.getElementById(`chore-${c.id}`)?.scrollIntoView({ block: 'nearest' }));
          }}
        />
      )}
      {editingChore && store.getEntity('chore', editingChore) && !store.getEntity('chore', editingChore).deleted && (
        <ChoreSheet chore={store.getEntity('chore', editingChore)} onClose={() => setEditingChore(null)} />
      )}
      {addingRepeat && (
        <NewChoreSheet
          cadence="daily"
          listId={id}
          onClose={() => setAddingRepeat(false)}
          onCreated={(c) => {
            highlight(c.id);
            requestAnimationFrame(() => document.getElementById(`chore-${c.id}`)?.scrollIntoView({ block: 'nearest' }));
          }}
        />
      )}
      {menu && (
        <ListMenuSheet
          list={list}
          counts={{ open: open.length, done: done.length }}
          onClose={() => setMenu(false)}
          onAddRepeating={() => {
            setMenu(false);
            setAddingRepeat(true);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({ item, flash, grip, onToggle, onEdit, onDelete }) {
  const swipe = swipeDelete(onDelete);
  return (
    <li id={`item-${item.id}`} data-id={item.id} class={'item swipe-row' + (item.done ? ' is-done' : '') + (flash ? ' flash' : '')} {...swipe.row}>
      <button class="check" aria-label={item.done ? 'Mark not done' : 'Mark done'} aria-pressed={item.done} onClick={onToggle}>
        <span class="check-mark">{item.done ? '✓' : ''}</span>
      </button>
      <button class="item-text" onClick={onEdit}>
        <span>{item.text}</span>
        {item.createdBy && <span class="item-by">{item.createdBy}</span>}
      </button>
      {grip && (
        <span class="grip" role="button" aria-label={`Drag to reorder ${item.text}`} {...grip}>
          <GripIcon />
        </span>
      )}
      {swipe.action}
    </li>
  );
}

function EditItemSheet({ item, onClose, onRepeat }) {
  const { store, deleted } = useApp();
  const [text, setText] = useState(item.text);
  const [repeat, setRepeat] = useState(null); // null: a one-off; otherwise a cadence
  const save = (e) => {
    e.preventDefault();
    if (repeat) {
      const c = store.repeatItem(item.id, { cadence: repeat, name: text.trim() || item.text });
      if (c) onRepeat(c);
      return;
    }
    if (text.trim() && text.trim() !== item.text) store.updateItem(item.id, { text: text.trim() });
    onClose();
  };
  return (
    <Sheet title="Edit item" onClose={onClose}>
      <form class="stack" onSubmit={save}>
        <div class="field">
          <input type="text" value={text} onInput={(e) => setText(e.currentTarget.value)} autoFocus />
          {item.createdBy && <p class="hint">Added by {item.createdBy}</p>}
        </div>
        <div class="field">
          <label>Repeat</label>
          <div class="chips" role="radiogroup" aria-label="Repeat">
            {[null, ...CADENCES].map((k) => (
              <button type="button" key={k || 'never'} role="radio" aria-checked={repeat === k} class={'chip' + (repeat === k ? ' on' : '')} onClick={() => setRepeat(k)}>
                {k ? (k === 'biweekly' ? 'Every 2 weeks' : CADENCE_LABEL[k]) : 'Never'}
              </button>
            ))}
          </div>
          <p class="hint">
            {repeat
              ? 'It moves to “Repeating” at the top of this list and comes back every time. It won’t show on the House tab.'
              : 'For habits like practicing a language: repeating items reset every day, week or month.'}
          </p>
        </div>
        <button class="btn primary big" type="submit" disabled={!text.trim()}>{repeat ? 'Make it repeat' : 'Save'}</button>
        <button
          class="btn danger big"
          type="button"
          onClick={() => {
            store.deleteItem(item.id);
            deleted(`Deleted “${item.text}”`, () => store.updateItem(item.id, { deleted: false }));
            onClose();
          }}
        >
          Delete
        </button>
      </form>
    </Sheet>
  );
}

function ListMenuSheet({ list, counts, onClose, onAddRepeating }) {
  const { store, navigate, deleted } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [emoji, setEmoji] = useState(list.emoji || iconToken('memo'));

  if (renaming) {
    const save = (e) => {
      e.preventDefault();
      if (name.trim()) store.updateList(list.id, { name: name.trim(), emoji });
      onClose();
    };
    return (
      <Sheet title="Edit list" onClose={onClose}>
        <form class="stack" onSubmit={save}>
          <div class="field">
            <label for="rename">Name</label>
            <input id="rename" type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
          </div>
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <button class="btn primary big" type="submit" disabled={!name.trim()}>Save</button>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet title={list.name} onClose={onClose}>
      <div class="stack">
        <button class="btn big" onClick={() => setRenaming(true)}>Rename or change icon</button>
        <button class="btn big" onClick={onAddRepeating}>Add a repeating item</button>
        <button
          class="btn big"
          disabled={counts.done === 0}
          onClick={() => {
            store.uncheckAll(list.id);
            onClose();
          }}
        >
          Uncheck everything
        </button>
        <button
          class="btn big"
          disabled={counts.done === 0}
          onClick={() => {
            store.clearCompleted(list.id);
            onClose();
          }}
        >
          Remove done items
        </button>
        {isOfficialPersonal(list, store.lists()) ? (
          <p class="hint">This is {list.owner}’s own list, so it can’t be deleted. Everyone in the family can see it.</p>
        ) : (
        <button
          class="btn danger big"
          onClick={() => {
            if (confirm(`Delete "${list.name}" and everything in it?`)) {
              const itemIds = store.itemsFor(list.id).map((i) => i.id);
              const choreIds = store.choresFor(list.id).map((c) => c.id);
              store.deleteList(list.id);
              onClose();
              navigate('/');
              deleted(`Deleted “${list.name}”`, () => store.restoreList(list.id, itemIds, choreIds));
            }
          }}
        >
          Delete list
        </button>
        )}
      </div>
    </Sheet>
  );
}
