import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';
import { BackIcon, DotsIcon, GearIcon, GripIcon, PlusIcon } from './Icons.jsx';
import { gripProps } from '../drag.js';
import { LinkButton, LinkField } from './Link.jsx';
import { focusWithoutScrolling } from '../focus.js';
import { ListIcon } from './ListIcon.jsx';
import { iconToken } from '../icons.js';
import { swipeDelete } from './SwipeAction.jsx';
import { newestOf, useMarkSeen } from './useSeen.js';
import { ChoreRow, ChoreSheet, NewChoreSheet, RepeatFields, useChoreToggle, useDaysOff } from './House.jsx';
import { choreStatus } from '../house.js';
import { TabBar } from './TabBar.jsx';
import { isOfficialPersonal, personalListFor } from '../personal.js';

/** One list. `asTab`: it's your own list on the Me tab (no back button, tab bar underneath). */
export function ListView({ id, focus, asTab = false }) {
  const { store, session, navigate, deleted } = useApp();
  const list = store.get().lists[id];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // item id
  const [editingChore, setEditingChore] = useState(null); // repeating item id
  const [addingRepeat, setAddingRepeat] = useState(false);
  const [moving, setMoving] = useState(false);
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

  // When the keyboard opens (the app shrinks to the space above it), keep the add row in view.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const keep = () => {
      const input = inputRef.current;
      if (input && document.activeElement === input) input.closest('li')?.scrollIntoView({ block: 'nearest' });
    };
    vv.addEventListener('resize', keep);
    return () => vv.removeEventListener('resize', keep);
  }, []);

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
    // Only if we're still looking at it (moving everything out and deleting it navigates elsewhere first).
    if (list && list.deleted && location.hash.includes(id)) navigate('/');
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
  // Always in your own order, done or not.
  const repeating = store.choresFor(id).map((c) => ({ chore: c, status: choreStatus(c, now) }));
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
    // Keep the new item and the add row (just below it) in view.
    if (added) requestAnimationFrame(() => inputRef.current?.closest('li')?.scrollIntoView({ block: 'nearest' }));
  };

  // The header's + jumps to the add row at the end of the list and starts typing.
  const startAdding = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    input.closest('li')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div class={asTab ? 'screen has-tabs list-tab' : 'screen'}>
      <header class="topbar">
        {!asTab && <button class="icon-btn back" aria-label="Back" onClick={() => navigate('/')}><BackIcon /></button>}
        <h1 class="title-with-emoji">
          {/* On the Me tab the tab itself shows the icon. */}
          {!asTab && <span class="title-icon"><ListIcon value={list.emoji} size={28} /></span>} {list.name}
        </h1>
        <div class="topbar-actions">
          <SyncBadge />
          <button class="icon-btn add-btn" aria-label="Add an item" onClick={startAdding}><PlusIcon /></button>
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
        <RepeatingGroup
          rows={repeating}
          now={now}
          flash={flash}
          listRef={repRef}
          grip={repGrip}
          onToggle={toggleChore}
          onEdit={(cid) => setEditingChore(cid)}
          onDelete={removeChore}
        />
      )}
      {repeating.length > 0 && open.length > 0 && (
        <div class="day-head list-head"><span>To do</span></div>
      )}

      {/* Adding happens in the list itself, as its last row (like Reminders),
          so nothing ever floats over the items. */}
      <ul class="items" ref={openRef}>
        {open.map((item) => (
          <ItemRow key={item.id} item={item} grip={open.length > 1 ? grip : null} flash={flash === item.id} onToggle={() => store.toggleItem(item.id)} onEdit={() => setEditing(item.id)} onDelete={() => remove(item)} />
        ))}
        <li class="add-row">
          <form class="add-item" onSubmit={add}>
            <span class="add-plus" aria-hidden="true">+</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Add an item…"
              aria-label="Add an item"
              value={text}
              enterkeyhint="done"
              autocomplete="off"
              onTouchEnd={focusWithoutScrolling}
              onInput={(e) => setText(e.currentTarget.value)}
            />
            {text.trim() && <button class="btn primary add-go" type="submit">Add</button>}
          </form>
        </li>
      </ul>

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
          counts={{ open: open.length, done: done.length, all: items.length + repeating.length }}
          onClose={() => setMenu(false)}
          onAddRepeating={() => {
            setMenu(false);
            setAddingRepeat(true);
          }}
          onMove={() => {
            setMenu(false);
            setMoving(true);
          }}
        />
      )}
      {moving && <MoveAllSheet list={list} counts={{ open: open.length, done: done.length, repeating: repeating.length }} onClose={() => setMoving(false)} />}
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
      <LinkButton link={item.link} name={item.text} />
      {grip && (
        <span class="grip" role="button" aria-label={`Drag to reorder ${item.text}`} {...grip}>
          <GripIcon />
        </span>
      )}
      {swipe.action}
    </li>
  );
}

/** The list's repeating items, in your order; ones not on today wait behind a "Show" row. */
function RepeatingGroup({ rows, now, flash, listRef, grip, onToggle, onEdit, onDelete }) {
  const days = useDaysOff(rows);
  return (
    <section class="list-group">
      <div class="day-head">
        <span>Repeating</span>
        <span class="day-stats">{days.stats}</span>
      </div>
      <ul class="items" ref={listRef}>
        {days.shown.map((x) => (
          <ChoreRow
            key={x.chore.id}
            {...x}
            now={now}
            showCadence
            flash={flash === x.chore.id}
            grip={days.shown.length > 1 ? grip : null}
            onToggle={() => onToggle(x)}
            onEdit={() => onEdit(x.chore.id)}
            onDelete={() => onDelete(x.chore)}
          />
        ))}
        {days.toggle}
      </ul>
    </section>
  );
}

function EditItemSheet({ item, onClose, onRepeat }) {
  const { store, deleted } = useApp();
  const [text, setText] = useState(item.text);
  const [repeat, setRepeat] = useState(null); // null: a one-off; otherwise a cadence
  const [times, setTimes] = useState(1);
  const [days, setDays] = useState(null); // null: every day
  const save = (e) => {
    e.preventDefault();
    if (repeat) {
      const c = store.repeatItem(item.id, { cadence: repeat, name: text.trim() || item.text, times, days });
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
        <LinkField value={item.link || null} onCommit={(link) => store.updateItem(item.id, { link })} />
        {/* The same repeat controls as everywhere else, shown as soon as it repeats so it's set up in one go. */}
        <RepeatFields never cadence={repeat} days={days} times={times} onCadence={setRepeat} onDays={setDays} onTimes={setTimes} />
        <p class="hint">
          {repeat
            ? 'It moves to “Repeating” at the top of this list and comes back every time. It won’t show on the House tab.'
            : 'For habits like practicing a language: repeating items reset every day, week or month.'}
        </p>
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

function ListMenuSheet({ list, counts, onClose, onAddRepeating, onMove }) {
  const { store, navigate, deleted, session } = useApp();
  // Your own list is a tab with no other way to the app's settings.
  const own = personalListFor(store.lists(), session.name)?.id === list.id;
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
        {own && (
          <button class="btn settings-link" type="button" onClick={() => { onClose(); navigate('/settings'); }}>
            <GearIcon /> <span>App settings</span> <span class="hint">family code, members, sync</span>
          </button>
        )}
        <button class="btn big" onClick={() => setRenaming(true)}>Rename or change icon</button>
        <button class="btn big" onClick={onAddRepeating}>Add a repeating item</button>
        <button class="btn big" disabled={counts.all === 0} onClick={onMove}>Move everything to another list</button>
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

/**
 * Move every item in this list (done or not, repeating ones with their
 * history) into another list, and optionally delete this one: for folding an
 * old list into your own.
 */
function MoveAllSheet({ list, counts, onClose }) {
  const { store, session, navigate, deleted: showUndo } = useApp();
  const all = store.lists();
  const mine = personalListFor(all, session.name);
  const official = isOfficialPersonal(list, all);
  // Your own list first, then the rest in their usual order.
  const targets = [...(mine && mine.id !== list.id ? [mine] : []), ...all.filter((l) => l.id !== list.id && l.id !== mine?.id)];
  const [to, setTo] = useState(targets[0]?.id || null);
  const [deleteAfter, setDeleteAfter] = useState(!official);
  const total = counts.open + counts.done + counts.repeating;
  const parts = [
    counts.open && `${counts.open} to do`,
    counts.done && `${counts.done} done`,
    counts.repeating && `${counts.repeating} repeating`,
  ].filter(Boolean);

  const go = (e) => {
    e.preventDefault();
    const dest = store.getEntity('list', to);
    const move = to && store.moveAllItems(list.id, to);
    if (!move) return;
    if (deleteAfter && !official) store.deleteList(list.id);
    onClose();
    navigate(mine && to === mine.id ? '/mine' : `/list/${to}`);
    showUndo(`Moved ${move.count} item${move.count === 1 ? '' : 's'} to “${dest.name}”`, () => {
      store.undoMoveAll(move);
      navigate(`/list/${list.id}`);
    });
  };

  return (
    <Sheet title="Move everything" onClose={onClose}>
      <form class="stack" onSubmit={go}>
        <p class="hint">
          All {total} item{total === 1 ? '' : 's'} in “{list.name}” ({parts.join(', ')}) move as they are: ticked-off items stay ticked off, and repeating ones keep their history.
        </p>
        <div class="field">
          <label>Move to</label>
          {targets.length === 0 ? (
            <p class="hint">There’s no other list to move them to yet.</p>
          ) : (
            <ul class="items move-targets" role="radiogroup" aria-label="Move to">
              {targets.map((l) => (
                <li key={l.id} class="item">
                  <button type="button" role="radio" aria-checked={to === l.id} class={'move-target' + (to === l.id ? ' on' : '')} onClick={() => setTo(l.id)}>
                    <span class="move-icon"><ListIcon value={l.emoji} size={24} /></span>
                    <span class="move-name">{l.name}{mine && l.id === mine.id ? <span class="muted"> · Me</span> : null}</span>
                    <span class="move-radio" aria-hidden="true">{to === l.id ? '✓' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!official && (
          <label class="toggle">
            <input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.currentTarget.checked)} />
            <span>Then delete “{list.name}”</span>
          </label>
        )}
        <button class="btn primary big" type="submit" disabled={!to}>
          Move {total} item{total === 1 ? '' : 's'}
        </button>
      </form>
    </Sheet>
  );
}
