import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';

export function ListView({ id }) {
  const { store, session, navigate } = useApp();
  const list = store.get().lists[id];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // item id
  const [menu, setMenu] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const inputRef = useRef(null);

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

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    store.addItem({ listId: id, text, createdBy: session.name });
    setText('');
    inputRef.current && inputRef.current.focus();
  };

  return (
    <div class="screen has-input">
      <header class="topbar">
        <button class="icon-btn back" aria-label="Back" onClick={() => navigate('/')}>‹</button>
        <h1 class="title-with-emoji">
          <span>{list.emoji || '📝'}</span> {list.name}
        </h1>
        <div class="topbar-actions">
          <SyncBadge />
          <button class="icon-btn" aria-label="List options" onClick={() => setMenu(true)}>⋯</button>
        </div>
      </header>

      {items.length === 0 && (
        <div class="empty">
          <p>Nothing here yet. Add something below.</p>
        </div>
      )}

      <ul class="items">
        {open.map((item) => (
          <ItemRow key={item.id} item={item} onToggle={() => store.toggleItem(item.id)} onEdit={() => setEditing(item.id)} />
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <button class="section-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Done ({done.length})
          </button>
          {showDone && (
            <ul class="items done">
              {done.map((item) => (
                <ItemRow key={item.id} item={item} onToggle={() => store.toggleItem(item.id)} onEdit={() => setEditing(item.id)} />
              ))}
            </ul>
          )}
        </>
      )}

      <form class="add-bar" onSubmit={add}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Add an item…"
          value={text}
          enterkeyhint="done"
          autocomplete="off"
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button class="btn primary" type="submit" disabled={!text.trim()} aria-label="Add">Add</button>
      </form>

      {editing && store.get().items[editing] && (
        <EditItemSheet item={store.get().items[editing]} onClose={() => setEditing(null)} />
      )}
      {menu && <ListMenuSheet list={list} counts={{ open: open.length, done: done.length }} onClose={() => setMenu(false)} />}
    </div>
  );
}

function ItemRow({ item, onToggle, onEdit }) {
  return (
    <li class={'item' + (item.done ? ' is-done' : '')}>
      <button class="check" aria-label={item.done ? 'Mark not done' : 'Mark done'} aria-pressed={item.done} onClick={onToggle}>
        <span class="check-mark">{item.done ? '✓' : ''}</span>
      </button>
      <button class="item-text" onClick={onEdit}>
        <span>{item.text}</span>
        {item.createdBy && <span class="item-by">{item.createdBy}</span>}
      </button>
    </li>
  );
}

function EditItemSheet({ item, onClose }) {
  const { store } = useApp();
  const [text, setText] = useState(item.text);
  const save = (e) => {
    e.preventDefault();
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
        <button class="btn primary big" type="submit" disabled={!text.trim()}>Save</button>
        <button
          class="btn danger big"
          type="button"
          onClick={() => {
            store.deleteItem(item.id);
            onClose();
          }}
        >
          Delete
        </button>
      </form>
    </Sheet>
  );
}

function ListMenuSheet({ list, counts, onClose }) {
  const { store, navigate } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [emoji, setEmoji] = useState(list.emoji || '📝');

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
        <button
          class="btn danger big"
          onClick={() => {
            if (confirm(`Delete "${list.name}" and everything in it?`)) {
              store.deleteList(list.id);
              onClose();
              navigate('/');
            }
          }}
        >
          Delete list
        </button>
      </div>
    </Sheet>
  );
}
