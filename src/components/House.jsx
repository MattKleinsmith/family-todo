import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { TabBar } from './TabBar.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';
import { ListIcon } from './ListIcon.jsx';
import { Glyph } from './Glyph.jsx';
import { Bell } from './Bell.jsx';
import { GearIcon, GripIcon } from './Icons.jsx';
import { gripProps } from '../drag.js';
import { swipeDelete } from './SwipeAction.jsx';
import { familyNames, sameName } from '../members.js';
import { newestOf, useMarkSeen } from './useSeen.js';
import {
  CADENCES,
  CADENCE_LABEL,
  DEFAULT_ICON,
  STARTER_CHORES,
  choreStatus,
  doneList,
  dueLabel,
  missedLabel,
  whenLabel,
} from '../house.js';

const SECTION_TITLE = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
const NOUN = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };

/** Starter chores, set up once per family, preferably after this phone has caught up with the others. */
function useStarterChores() {
  const { store, status } = useApp();
  const caughtUp = !!status.caughtUp;
  useEffect(() => {
    const seed = () => {
      if (store.hasAnyChores() || store.getMeta('house')?.seeded) return;
      // Dated to the start of today, so every phone seeding today writes the same records.
      const d = new Date();
      store.seedChores(STARTER_CHORES, new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    };
    if (caughtUp) {
      seed();
      return undefined;
    }
    // Offline, or the relays are slow: don't leave the screen empty for long.
    const t = setTimeout(seed, 8000);
    return () => clearTimeout(t);
  }, [caughtUp]);
}

export function House({ focus }) {
  const { store, session, navigate } = useApp();
  const [, tick] = useReducer((x) => x + 1, 0);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null); // cadence
  const [flash, setFlash] = useState(null);
  useStarterChores();
  useMarkSeen('house', newestOf(Object.values(store.get().chores)));

  // Days and weeks roll over while the app is open.
  useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const highlight = (id, ms = 1500) => {
    setFlash(id);
    setTimeout(() => setFlash((cur) => (cur === id ? null : cur)), ms);
  };

  // Arriving from the activity feed: scroll to the chore and highlight it.
  useEffect(() => {
    if (!focus) return undefined;
    highlight(focus, 2000);
    const t = setTimeout(() => document.getElementById(`chore-${focus}`)?.scrollIntoView({ block: 'center' }), 50);
    return () => clearTimeout(t);
  }, [focus]);

  const now = Date.now();
  const chores = store.chores().map((c) => ({ chore: c, status: choreStatus(c, now) }));
  const byCadence = Object.fromEntries(CADENCES.map((k) => [k, chores.filter((x) => x.status.cadence === k)]));

  const toggle = ({ chore, status }) => {
    if (status.done) store.unmarkChore(chore.id, status.done.at);
    else {
      store.markChore(chore.id, { at: Date.now(), by: session.name });
      highlight(chore.id);
    }
  };

  return (
    <div class="screen has-tabs">
      <header class="topbar">
        <h1>House</h1>
        <div class="topbar-actions">
          <SyncBadge />
          <Bell />
          <button class="icon-btn gear" aria-label="Settings" onClick={() => navigate('/settings')}><GearIcon /></button>
        </div>
      </header>

      <div class="content">
        <Summary chores={chores} now={now} />
        {CADENCES.map((k) => (
          <Section
            key={k}
            cadence={k}
            rows={byCadence[k]}
            now={now}
            flash={flash}
            onToggle={toggle}
            onEdit={(id) => setEditing(id)}
            onAdd={() => setAdding(k)}
          />
        ))}
      </div>

      <TabBar active="house" />

      {editing && store.getEntity('chore', editing) && !store.getEntity('chore', editing).deleted && (
        <ChoreSheet chore={store.getEntity('chore', editing)} onClose={() => setEditing(null)} />
      )}
      {adding && (
        <NewChoreSheet
          cadence={adding}
          onClose={() => setAdding(null)}
          onCreated={(c) => {
            highlight(c.id);
            requestAnimationFrame(() => document.getElementById(`chore-${c.id}`)?.scrollIntoView({ block: 'nearest' }));
          }}
        />
      )}
    </div>
  );
}

function Summary({ chores, now }) {
  if (chores.length === 0) return null;
  const overdue = chores.filter((x) => x.status.state === 'overdue').sort((a, b) => b.status.missed - a.status.missed);
  const left = (k) => chores.filter((x) => x.status.cadence === k && x.status.state !== 'done').length;
  const total = (k) => chores.filter((x) => x.status.cadence === k).length;
  const month = new Date(now).toLocaleDateString([], { month: 'long' });
  const periods = [
    { k: 'daily', label: 'Today' },
    { k: 'weekly', label: 'This week' },
    { k: 'monthly', label: month },
  ].filter((p) => total(p.k) > 0);
  const allDone = periods.every((p) => left(p.k) === 0);

  let glyph = 'house';
  let title;
  let sub;
  if (overdue.length) {
    glyph = 'broom';
    title = `${overdue.length} overdue`;
    sub = overdue.map((x) => (x.chore.owner ? `${x.chore.name} (${x.chore.owner})` : x.chore.name)).join(', ');
  } else if (allDone) {
    glyph = 'sparkles';
    title = 'All caught up';
    sub = 'Nice work, everyone.';
  } else if (total('daily') && left('daily')) {
    title = `${left('daily')} left today`;
    sub = 'Nothing overdue.';
  } else {
    title = 'Today’s done';
    sub = 'Nothing overdue.';
  }

  return (
    <section class={'status house-status' + (overdue.length ? ' behind' : allDone ? ' clear' : '')} aria-live="polite">
      <div class="status-main">
        <span class="status-emoji"><Glyph name={glyph} size={32} /></span>
        <div>
          <div class="status-title">{title}</div>
          <div class="status-sub">{sub}</div>
        </div>
      </div>
      <div class="period-chips">
        {periods.map((p) => {
          const n = total(p.k);
          const d = n - left(p.k);
          return (
            <span key={p.k} class={'period-chip' + (d === n ? ' full' : '')}>
              <span class="period-label">{p.label}</span>
              <span class="period-count">{d}/{n}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Section({ cadence, rows, now, flash, onToggle, onEdit, onAdd }) {
  const { store, deleted } = useApp();
  const remove = (chore) => {
    store.deleteChore(chore.id);
    deleted(`Deleted “${chore.name}”`, () => store.updateChore(chore.id, { deleted: false }));
  };
  const listRef = useRef(null);
  const grip = gripProps(() => ({ container: listRef.current, onDrop: (ids, moved) => store.moveTo('chore', moved, ids) }));
  const doneCount = rows.filter((x) => x.status.done).length;
  return (
    <section class="day chores">
      <div class="day-head">
        <span>{SECTION_TITLE[cadence]}</span>
        {rows.length > 0 && <span class="day-stats">{doneCount} of {rows.length} done</span>}
      </div>
      <ul class="items" ref={listRef}>
        {rows.map((x) => (
          <ChoreRow key={x.chore.id} {...x} now={now} flash={flash === x.chore.id} grip={rows.length > 1 ? grip : null} onToggle={() => onToggle(x)} onEdit={() => onEdit(x.chore.id)} onDelete={() => remove(x.chore)} />
        ))}
        <li class="add-row">
          <button class="add-chore" onClick={onAdd}>
            <span class="add-plus" aria-hidden="true">+</span> Add a {NOUN[cadence]} chore
          </button>
        </li>
      </ul>
    </section>
  );
}

function ChoreRow({ chore, status, now, flash, grip, onToggle, onEdit, onDelete }) {
  const { session } = useApp();
  const swipe = swipeDelete(onDelete);
  const mine = sameName(chore.owner, session.name);
  const level = status.state === 'overdue' ? (status.missed >= 2 ? 'late' : 'behind') : '';
  let sub;
  if (status.done) sub = <>Done {whenLabel(status.done.at, now)}{status.done.by ? ` · ${status.done.by}` : ''}</>;
  else if (status.state === 'overdue')
    sub = (
      <>
        <b class="missed">{missedLabel(status.cadence, status.missed)}</b>
        {status.last ? ` · last done ${whenLabel(status.last.at, now)}` : ''}
      </>
    );
  else sub = <>{dueLabel(status)}{status.last ? ` · last done ${whenLabel(status.last.at, now)}` : ''}</>;

  return (
    <li id={`chore-${chore.id}`} data-id={chore.id} {...swipe.row} class={'item chore swipe-row' + (status.done ? ' is-done' : '') + (level ? ` ${level}` : '') + (flash ? ' flash' : '')}>
      <button class="check" aria-label={status.done ? `Mark ${chore.name} not done` : `Mark ${chore.name} done`} aria-pressed={!!status.done} onClick={onToggle}>
        <span class="check-mark">{status.done ? '✓' : ''}</span>
      </button>
      <button class="item-text chore-text" onClick={onEdit}>
        <span class="chore-icon"><ListIcon value={chore.icon} size={26} /></span>
        <span class="chore-lines">
          <span class="chore-name">{chore.name}</span>
          <span class="item-by chore-sub">
            {chore.owner && <span class={'owner-pill' + (mine ? ' mine' : '')} aria-label={mine ? 'Yours:' : `${chore.owner}’s:`}>{mine ? 'You' : chore.owner}</span>}
            {sub}
          </span>
        </span>
      </button>
      {grip && <span class="grip" role="button" aria-label={`Drag to reorder ${chore.name}`} {...grip}><GripIcon /></span>}
      {swipe.action}
    </li>
  );
}

/** Who looks after a chore: anyone, or one person in the family. */
function OwnerPicker({ value, onChange }) {
  const { store, session } = useApp();
  const people = familyNames(store.members(), [session.name]);
  // Someone who has since left still shows while they own it, so it can be changed.
  if (value && !people.some((p) => sameName(p, value))) people.push(value);
  const chip = (label, v) => {
    const on = v ? sameName(v, value) : !value;
    return (
      <button type="button" key={label} role="radio" aria-checked={on} class={'chip' + (on ? ' on' : '')} onClick={() => onChange(v)}>
        {label}
      </button>
    );
  };
  return (
    <div class="field">
      <label>Whose job</label>
      <div class="chips" role="radiogroup" aria-label="Whose job">
        {chip('Anyone', null)}
        {people.map((p) => chip(sameName(p, session.name) ? `${p} (you)` : p, p))}
      </div>
    </div>
  );
}

function CadencePicker({ value, onChange }) {
  return (
    <div class="segmented" role="radiogroup" aria-label="How often">
      {CADENCES.map((k) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} class={value === k ? 'on' : ''} onClick={() => onChange(k)}>{CADENCE_LABEL[k]}</button>
      ))}
    </div>
  );
}

function NewChoreSheet({ cadence: initial, onClose, onCreated }) {
  const { store, session } = useApp();
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState(initial);
  const [icon, setIcon] = useState(null); // null: follow the cadence's default
  const [owner, setOwner] = useState(null); // null: anyone

  const submit = (e) => {
    e.preventDefault();
    const c = store.addChore({ name, cadence, icon: icon || DEFAULT_ICON[cadence], owner, createdBy: session.name });
    if (!c) return;
    onClose();
    onCreated(c);
  };

  return (
    <Sheet title="New chore" onClose={onClose}>
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label for="chore-name">What needs doing</label>
          <input id="chore-name" type="text" placeholder={{ daily: 'Sweep the kitchen', weekly: 'Take out the trash', monthly: 'Change the air filter' }[cadence]} value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
        </div>
        <div class="field">
          <label>How often</label>
          <CadencePicker value={cadence} onChange={setCadence} />
        </div>
        <OwnerPicker value={owner} onChange={setOwner} />
        <EmojiPicker value={icon || DEFAULT_ICON[cadence]} onChange={setIcon} />
        <button class="btn primary big" type="submit" disabled={!name.trim()}>Add chore</button>
      </form>
    </Sheet>
  );
}

const dateInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ChoreSheet({ chore, onClose }) {
  const { store, session, deleted } = useApp();
  const [name, setName] = useState(chore.name);
  const [cadence, setCadence] = useState(chore.cadence);
  const [icon, setIcon] = useState(chore.icon || DEFAULT_ICON[chore.cadence]);
  const [pastDay, setPastDay] = useState(dateInput(Date.now() - 24 * 3600 * 1000));
  const history = doneList(chore);
  const today = dateInput(Date.now());

  // Changes save as they're made, so closing the sheet any way at all keeps them.
  const change = (changes) => store.updateChore(chore.id, changes);
  const pickCadence = (k) => {
    setCadence(k);
    if (k !== chore.cadence) change({ cadence: k });
  };
  const pickOwner = (v) => {
    const same = v ? sameName(v, chore.owner) : !chore.owner;
    if (!same) change({ owner: v });
  };
  const pickIcon = (v) => {
    setIcon(v);
    if (v !== chore.icon) change({ icon: v });
  };
  const commitName = () => {
    const n = name.trim();
    if (n && n !== chore.name) change({ name: n });
    else if (!n) setName(chore.name);
  };
  const close = () => {
    commitName();
    onClose();
  };
  const submit = (e) => {
    e.preventDefault();
    close();
  };

  const logPast = () => {
    if (!pastDay) return;
    const [y, m, d] = pastDay.split('-').map(Number);
    // A day in the past counts from midday, today counts from now.
    const at = pastDay === today ? Date.now() : new Date(y, m - 1, d, 12).getTime();
    if (at > Date.now()) return;
    store.markChore(chore.id, { at, by: session.name });
  };

  return (
    <Sheet title="Chore" onClose={close}>
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label for="chore-edit-name">Name</label>
          <input id="chore-edit-name" type="text" value={name} enterkeyhint="done" onInput={(e) => setName(e.currentTarget.value)} onBlur={commitName} />
        </div>
        <div class="field">
          <label>How often</label>
          <CadencePicker value={cadence} onChange={pickCadence} />
          <p class="hint">{cadence === 'weekly' ? 'Weeks run Monday to Sunday.' : cadence === 'monthly' ? 'Any day in the month counts.' : 'Resets every morning.'} If a whole {cadence === 'daily' ? 'day' : cadence === 'weekly' ? 'week' : 'month'} goes by without it, it’s flagged as overdue.</p>
        </div>
        <div class="field">
          <label>Done</label>
          {history.length === 0 ? (
            <p class="hint">Not done yet.</p>
          ) : (
            <ul class="history">
              {history.map((d) => (
                <li key={d.at}>
                  <span>
                    {new Date(d.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    {d.by ? <span class="muted"> · {d.by}</span> : null}
                  </span>
                  <button type="button" class="icon-btn small" aria-label="Remove this one" onClick={() => store.unmarkChore(chore.id, d.at)}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <div class="row past-day">
            <input type="date" aria-label="Day it was done" value={pastDay} max={today} onInput={(e) => setPastDay(e.currentTarget.value)} />
            <button type="button" class="btn" onClick={logPast} disabled={!pastDay || pastDay > today}>Mark done</button>
          </div>
          <p class="hint">Forgot to tick it off? Pick the day it was done.</p>
        </div>
        <OwnerPicker value={chore.owner || null} onChange={pickOwner} />
        <EmojiPicker value={icon} onChange={pickIcon} />
        <button class="btn primary big" type="submit">Done</button>
        <button class="btn danger big" type="button" onClick={() => { store.deleteChore(chore.id); onClose(); deleted(`Deleted “${chore.name}”`, () => store.updateChore(chore.id, { deleted: false })); }}>Delete chore</button>
      </form>
    </Sheet>
  );
}
