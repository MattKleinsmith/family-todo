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
  cadenceText,
  MAX_TIMES,
  QUICK_TIMES,
  periodWord,
  timesOf,
  STARTER_CHORES,
  choreStatus,
  doneList,
  dueLabel,
  missedLabel,
  whenLabel,
  daysLabel,
  nextDayLabel,
  normalizeDays,
  WEEK_ORDER,
  DAY_CADENCES,
  WEEKDAYS,
  WEEKENDS,
  DAY_LONG,
} from '../house.js';



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
  const { store, navigate } = useApp();
  const [, tick] = useReducer((x) => x + 1, 0);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null); // cadence
  const [flash, setFlash] = useState(null);
  useStarterChores();
  useMarkSeen('house', newestOf(Object.values(store.get().chores).filter((c) => !c.listId)));

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
  const chores = store.houseChores().map((c) => ({ chore: c, status: choreStatus(c, now) }));
  // Always in the family's own order, done or not.
  const byCadence = Object.fromEntries(CADENCES.map((k) => [k, chores.filter((x) => x.status.cadence === k)]));

  const toggle = useChoreToggle(highlight);

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

/** Tap to tick off one more time; once it's all done, a tap takes the last one back. */
export function useChoreToggle(highlight = () => {}) {
  const { store, session, deleted: showUndo } = useApp();
  return ({ chore, status }) => {
    if (status.done) {
      store.unmarkChore(chore.id, status.done.at);
      return;
    }
    const at = Date.now();
    store.markChore(chore.id, { at, by: session.name });
    highlight(chore.id);
    if (status.target > 1 && status.count + 1 < status.target)
      showUndo(`${chore.name}: ${status.count + 1} of ${status.target} ${periodWord(status.period)}`, () => store.unmarkChore(chore.id, at));
  };
}

function Summary({ chores, now }) {
  if (chores.length === 0) return null;
  const overdue = chores.filter((x) => x.status.state === 'overdue').sort((a, b) => b.status.missed - a.status.missed);
  // A chore having its day off (not on today) isn't part of today.
  const left = (k) => chores.filter((x) => x.status.cadence === k && x.status.state !== 'done' && x.status.state !== 'off').length;
  const total = (k) => chores.filter((x) => x.status.cadence === k && x.status.state !== 'off').length;
  const month = new Date(now).toLocaleDateString([], { month: 'long' });
  const periods = [
    { k: 'daily', label: 'Today' },
    { k: 'weekly', label: 'This week' },
    { k: 'biweekly', label: 'These 2 weeks' },
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
  const days = useDaysOff(rows);
  return (
    <section class="day chores">
      <div class="day-head">
        <span>{cadenceText(cadence).section}</span>
        {rows.length > 0 && <span class="day-stats">{days.stats}</span>}
      </div>
      <ul class="items" ref={listRef}>
        {days.shown.map((x) => (
          <ChoreRow key={x.chore.id} {...x} now={now} flash={flash === x.chore.id} grip={days.shown.length > 1 ? grip : null} onToggle={() => onToggle(x)} onEdit={() => onEdit(x.chore.id)} onDelete={() => remove(x.chore)} />
        ))}
        {days.toggle}
        <li class="add-row">
          <button class="add-chore" onClick={onAdd}>
            <span class="add-plus" aria-hidden="true">+</span> {cadenceText(cadence).add}
          </button>
        </li>
      </ul>
    </section>
  );
}

/**
 * Chores that only come up on some days are left out on their days off, with
 * a quiet row at the end to show them (to tick one anyway, or to edit it).
 * `stats` is "2 of 3 done" for what's on today.
 */
export function useDaysOff(rows) {
  const [showOff, setShowOff] = useState(false);
  const today = rows.filter((x) => x.status.state !== 'off');
  const off = rows.length - today.length;
  const done = today.filter((x) => x.status.done).length;
  return {
    shown: showOff ? rows : today,
    stats: today.length ? `${done} of ${today.length} done` : 'Nothing today',
    toggle: off ? (
      <li class="off-row">
        <button type="button" class="off-toggle" aria-expanded={showOff} onClick={() => setShowOff((v) => !v)}>
          <span>{off} not on today</span>
          <span class="off-action">{showOff ? 'Hide' : 'Show'}</span>
        </button>
      </li>
    ) : null,
  };
}

/** One chore. `showCadence` prefixes the status line with how often it repeats, for lists that mix them. */
export function ChoreRow({ chore, status, now, flash, grip, onToggle, onEdit, onDelete, showCadence = false }) {
  const { session } = useApp();
  const swipe = swipeDelete(onDelete);
  const mine = sameName(chore.owner, session.name);
  const level = status.state === 'overdue' ? (status.missed >= 2 ? 'late' : 'behind') : '';
  const multi = status.target > 1;
  const by = (d) => (d.by ? ` · ${d.by}` : '');
  let sub;
  if (status.done && multi) sub = <>Done {status.target}× · last {whenLabel(status.done.at, now)}{by(status.done)}</>;
  else if (status.done) sub = <>Done {whenLabel(status.done.at, now)}{by(status.done)}</>;
  else if (status.latest)
    sub = (
      <>
        {/* The section header already says every day, week or month (or the row does, in a list). */}
        <b class="progress">{status.count} of {status.target}</b> · last {whenLabel(status.latest.at, now)}{by(status.latest)}
      </>
    );
  else if (status.state === 'off') sub = <>Not today · {nextDayLabel(status.nextDay, now)}{status.last ? ` · last done ${whenLabel(status.last.at, now)}` : ''}</>;
  else if (status.state === 'overdue')
    sub = (
      <>
        <b class="missed">{missedLabel(status.cadence, status.missed, status.missedDay, now)}</b>
        {status.last ? ` · last done ${whenLabel(status.last.at, now)}` : ''}
      </>
    );
  else sub = <>{dueLabel(status)}{status.last ? ` · last done ${whenLabel(status.last.at, now)}` : ''}</>;

  return (
    <li id={`chore-${chore.id}`} data-id={chore.id} {...swipe.row} class={'item chore swipe-row' + (status.done ? ' is-done' : '') + (status.state === 'off' ? ' off' : '') + (level ? ` ${level}` : '') + (flash ? ' flash' : '')}>
      <button
        class={'check' + (multi && !status.done ? ' multi' : '')}
        aria-label={status.done ? `Take back the last ${chore.name}` : multi ? `Mark ${chore.name} done (${status.count} of ${status.target} so far)` : `Mark ${chore.name} done`}
        aria-pressed={!!status.done}
        onClick={onToggle}
      >
        {multi && !status.done ? <ProgressRing count={status.count} target={status.target} /> : <span class="check-mark">{status.done ? '✓' : ''}</span>}
      </button>
      <button class="item-text chore-text" onClick={onEdit}>
        {chore.icon && <span class="chore-icon"><ListIcon value={chore.icon} size={26} /></span>}
        <span class="chore-lines">
          <span class="chore-name">{chore.name}</span>
          <span class="item-by chore-sub">
            {chore.owner && <span class={'owner-pill' + (mine ? ' mine' : '')} aria-label={mine ? 'Yours:' : `${chore.owner}’s:`}>{mine ? 'You' : chore.owner}</span>}
            {status.days ? (
              <span class="cadence-tag">{daysLabel(status.days)} · </span>
            ) : (
              showCadence && <span class="cadence-tag">{{ daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }[status.cadence]} · </span>
            )}
            {sub}
          </span>
        </span>
      </button>
      {grip && <span class="grip" role="button" aria-label={`Drag to reorder ${chore.name}`} {...grip}><GripIcon /></span>}
      {swipe.action}
    </li>
  );
}

/**
 * Who did one completion. Ticking something off says you did it; a tap here
 * hands it to the other person (with two in the family), or, with more,
 * picks from a menu.
 */
function WhoPill({ value, onChange }) {
  const { store, session } = useApp();
  const people = familyNames(store.members(), [session.name]);
  // Someone who has since left still shows on what they did.
  if (value && !people.some((p) => sameName(p, value))) people.push(value);
  const label = (p) => (sameName(p, session.name) ? `${p} (you)` : p);
  const at = people.findIndex((p) => sameName(p, value));
  if (people.length <= 2) {
    const next = people[(at + 1) % people.length];
    return (
      <button type="button" class="who-pill" aria-label={value ? `Done by ${value}. Tap to make it ${next}` : `Who did it? Tap for ${next}`} disabled={people.length < 2 && !!value} onClick={() => onChange(next)}>
        {value ? label(value) : 'Who?'}
      </button>
    );
  }
  return (
    <select class="who-pill" aria-label="Done by" value={at >= 0 ? people[at] : ''} onChange={(e) => onChange(e.currentTarget.value)}>
      {at < 0 && <option value="">Who?</option>}
      {people.map((p) => (
        <option key={p} value={p}>{label(p)}</option>
      ))}
    </select>
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

/** The check circle split into one segment per time, filled as they're done (a smooth ring past 8). */
function ProgressRing({ count, target }) {
  const r = 12.5;
  const c = 2 * Math.PI * r;
  if (target > 8) {
    const filled = (c * Math.min(count, target)) / target;
    return (
      <svg class="ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle class="seg" cx="15" cy="15" r={r} fill="none" stroke-width="3" />
        {count > 0 && (
          <circle class="seg on" cx="15" cy="15" r={r} fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray={`${filled} ${c - filled}`} transform="rotate(-90 15 15)" />
        )}
        {count > 0 && <text x="15" y="19.5" text-anchor="middle" class="ring-count">{count}</text>}
      </svg>
    );
  }
  const gap = 3.2; // px between segments
  const seg = c / target - gap;
  return (
    <svg class="ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      {Array.from({ length: target }, (_, i) => (
        <circle
          key={i}
          class={i < count ? 'seg on' : 'seg'}
          cx="15" cy="15" r={r}
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray={`${seg} ${c - seg}`}
          stroke-dashoffset={-(i * (c / target)) - gap / 2}
          transform="rotate(-90 15 15)"
        />
      ))}
      {count > 0 && <text x="15" y="19.5" text-anchor="middle" class="ring-count">{count}</text>}
    </svg>
  );
}

/** How many times each day, week or month. */
/** How many times each day, week or month: quick choices, or type any number. */
function TimesPicker({ cadence, value, onChange }) {
  const { per } = cadenceText(cadence);
  const custom = !QUICK_TIMES.includes(value);
  const [typing, setTyping] = useState(custom);
  const [draft, setDraft] = useState(custom ? String(value) : '');
  const commit = (raw) => {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 1) onChange(Math.min(MAX_TIMES, n));
  };
  return (
    <div class="field">
      <label>How many times {per}</label>
      <div class="chips" role="radiogroup" aria-label={`How many times ${per}`}>
        {QUICK_TIMES.map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n && !typing}
            class={'chip' + (value === n && !typing ? ' on' : '')}
            onClick={() => {
              setTyping(false);
              onChange(n);
            }}
          >
            {n === 1 ? 'Once' : `${n}×`}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={typing}
          class={'chip' + (typing ? ' on' : '')}
          onClick={() => {
            setTyping(true);
            setDraft(custom ? String(value) : '');
          }}
        >
          {custom && !typing ? `${value}×` : 'Other…'}
        </button>
      </div>
      {typing && (
        <div class="row times-other">
          <input
            type="number"
            inputmode="numeric"
            min="1"
            max={MAX_TIMES}
            placeholder="e.g. 6"
            aria-label={`Times ${per}`}
            value={draft}
            autoFocus
            onInput={(e) => setDraft(e.currentTarget.value)}
            // Saved once you've finished typing (not "1" then "12").
            onChange={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            }}
          />
          <span class="muted">times {per}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Which days a chore comes up on. For a daily chore: every day, weekdays,
 * weekends, then a toggle per day to fine-tune (say, weekdays but not
 * Wednesday). For a weekly one: any day of the week, or pick its days ("every
 * Wednesday"). `value` is null for no particular days.
 */
function DaysPicker({ cadence, value, onChange }) {
  const weekly = cadence === 'weekly';
  const picked = normalizeDays(value);
  // With no particular days, a daily chore is on all of them and a weekly one on none in particular.
  const days = picked || (weekly ? [] : [0, 1, 2, 3, 4, 5, 6]);
  const set = (d) => onChange(normalizeDays(d));
  const quick = weekly
    ? [{ label: 'Any day', days: null }]
    : [
        { label: 'Every day', days: null },
        { label: 'Weekdays', days: WEEKDAYS },
        { label: 'Weekends', days: WEEKENDS },
      ];
  const current = (picked || []).join();
  const toggle = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    if (next.length || weekly) set(next); // a daily chore keeps at least one day
  };
  const label = picked && daysLabel(picked);
  return (
    <div class="field">
      <label>{weekly ? 'On a set day' : 'On these days'}</label>
      <div class="chips" role="radiogroup" aria-label={weekly ? 'On a set day' : 'On these days'}>
        {quick.map((q) => {
          const on = (q.days || []).join() === current;
          return (
            <button type="button" key={q.label} role="radio" aria-checked={on} class={'chip' + (on ? ' on' : '')} onClick={() => set(q.days)}>{q.label}</button>
          );
        })}
      </div>
      <div class="weekdays" role="group" aria-label="Days of the week">
        {WEEK_ORDER.map((d) => {
          const on = days.includes(d);
          return (
            <button type="button" key={d} class={'weekday' + (on ? ' on' : '')} aria-pressed={on} aria-label={DAY_LONG[d]} onClick={() => toggle(d)}>
              {DAY_LONG[d].slice(0, 1)}
            </button>
          );
        })}
      </div>
      {picked ? (
        <p class="hint">It only shows on {label === 'Weekdays' || label === 'Weekends' ? label.toLowerCase() : label}, and only those days count if it’s missed.</p>
      ) : weekly ? (
        <p class="hint">Any day this week counts. Pick a day to make it, say, every Wednesday.</p>
      ) : null}
    </div>
  );
}

const CADENCE_HINT = {
  daily: 'Resets every morning. If a whole day goes by without it, it’s flagged as overdue.',
  weekly: 'Weeks run Monday to Sunday. If a whole week goes by without it, it’s flagged as overdue.',
  biweekly: 'Runs in two-week blocks, Monday to Sunday. If two whole weeks go by without it, it’s flagged as overdue.',
  monthly: 'Any day in the month counts. If a whole month goes by without it, it’s flagged as overdue.',
};

/**
 * How a chore or repeating item repeats: how often, on which days (daily and
 * weekly), and how many times. The one set of controls for House chores and
 * list items alike, whether adding, editing, or making a one-off repeat.
 * With `never`, "Never" is a choice too (cadence null), for a one-off item.
 */
export function RepeatFields({ cadence, days, times, onCadence, onDays, onTimes, never = false }) {
  const withDays = DAY_CADENCES.includes(cadence);
  return (
    <>
      <div class="field">
        <label>{never ? 'Repeat' : 'How often'}</label>
        {never ? (
          <div class="chips" role="radiogroup" aria-label="Repeat">
            {[null, ...CADENCES].map((k) => (
              <button type="button" key={k || 'never'} role="radio" aria-checked={cadence === k} class={'chip' + (cadence === k ? ' on' : '')} onClick={() => onCadence(k)}>
                {k ? (k === 'biweekly' ? 'Every 2 weeks' : CADENCE_LABEL[k]) : 'Never'}
              </button>
            ))}
          </div>
        ) : (
          <CadencePicker value={cadence} onChange={onCadence} />
        )}
        {!never && !withDays && <p class="hint">{CADENCE_HINT[cadence]}</p>}
        {!never && cadence === 'daily' && !normalizeDays(days) && <p class="hint">{CADENCE_HINT.daily}</p>}
      </div>
      {withDays && <DaysPicker cadence={cadence} value={days} onChange={onDays} />}
      {/* On set days, each of those days is its own round. */}
      {cadence && <TimesPicker cadence={withDays && normalizeDays(days) ? 'daily' : cadence} value={times} onChange={onTimes} />}
    </>
  );
}

// Icons that suit household chores, shown first in the chore icon picker.
const CHORE_ICONS = ['sponge', 'plate', 'broom', 'soap', 'bubbles', 'bucket', 'droplet', 'shower', 'bed', 'wastebasket', 'basket', 'toilet-paper', 'clover', 'potted-plant', 'cat', 'dog', 'tools', 'cooking'];

function CadencePicker({ value, onChange }) {
  return (
    <div class="segmented" role="radiogroup" aria-label="How often">
      {CADENCES.map((k) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} class={value === k ? 'on' : ''} onClick={() => onChange(k)}>{CADENCE_LABEL[k]}</button>
      ))}
    </div>
  );
}

/** Add a House chore, or, with `listId`, a repeating item for that list. */
export function NewChoreSheet({ cadence: initial, onClose, onCreated, listId = null }) {
  const { store, session } = useApp();
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState(initial);
  const [icon, setIcon] = useState(null); // null: follow the cadence's default
  const [owner, setOwner] = useState(null); // null: anyone
  const [times, setTimes] = useState(1);
  const [days, setDays] = useState(null); // null: every day

  const submit = (e) => {
    e.preventDefault();
    const c = store.addChore({ name, cadence, icon: icon || (listId ? '' : DEFAULT_ICON[cadence]), owner, times, days, createdBy: session.name, listId });
    if (!c) return;
    onClose();
    onCreated(c);
  };

  return (
    <Sheet title={listId ? 'New repeating item' : 'New chore'} onClose={onClose}>
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label for="chore-name">{listId ? 'What to repeat' : 'What needs doing'}</label>
          <input
            id="chore-name"
            type="text"
            placeholder={listId ? { daily: 'Practice Chinese', weekly: 'Call Mom', biweekly: 'Get a haircut', monthly: 'Review the budget' }[cadence] : { daily: 'Sweep the kitchen', weekly: 'Take out the trash', biweekly: 'Change the sheets', monthly: 'Change the air filter' }[cadence]}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
          />
          {listId && <p class="hint">It stays in this list, resets every day, week or month, and doesn’t show on the House tab.</p>}
        </div>
        <RepeatFields cadence={cadence} days={days} times={times} onCadence={setCadence} onDays={setDays} onTimes={setTimes} />
        {!listId && <OwnerPicker value={owner} onChange={setOwner} />}
        <EmojiPicker value={icon || (listId ? '' : DEFAULT_ICON[cadence])} onChange={setIcon} prefer={listId ? [] : CHORE_ICONS} />
        <button class="btn primary big" type="submit" disabled={!name.trim()}>{listId ? 'Add repeating item' : 'Add chore'}</button>
      </form>
    </Sheet>
  );
}

const dateInput = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ChoreSheet({ chore, onClose }) {
  const { store, session, deleted } = useApp();
  const inList = !!chore.listId;
  const [name, setName] = useState(chore.name);
  const [cadence, setCadence] = useState(chore.cadence);
  const [icon, setIcon] = useState(chore.icon || (inList ? '' : DEFAULT_ICON[chore.cadence]));
  const [pastDay, setPastDay] = useState(dateInput(Date.now() - 24 * 3600 * 1000));
  const history = doneList(chore);
  const today = dateInput(Date.now());

  // Changes save as they're made, so closing the sheet any way at all keeps them.
  const change = (changes) => store.updateChore(chore.id, changes);
  const pickCadence = (k) => {
    setCadence(k);
    if (k !== chore.cadence) change({ cadence: k });
  };
  const pickTimes = (n) => {
    if (n !== timesOf(chore)) change({ times: n });
  };
  const [days, setDays] = useState(normalizeDays(chore.days));
  const pickDays = (d) => {
    setDays(d);
    if ((d || []).join() !== (normalizeDays(chore.days) || []).join()) change({ days: d });
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
    <Sheet title={inList ? 'Repeating item' : 'Chore'} onClose={close}>
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label for="chore-edit-name">Name</label>
          <input id="chore-edit-name" type="text" value={name} enterkeyhint="done" onInput={(e) => setName(e.currentTarget.value)} onBlur={commitName} />
        </div>
        <div class="field">
          <label>Done</label>
          {history.length === 0 ? (
            <p class="hint">Not done yet.</p>
          ) : (
            <ul class="history">
              {history.map((d) => (
                <li key={d.at}>
                  <span class="history-when">
                    {new Date(d.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    {history.filter((x) => dateInput(x.at) === dateInput(d.at)).length > 1 && (
                      <span class="muted"> {new Date(d.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </span>
                  <WhoPill value={d.by || ''} onChange={(by) => store.setDoneBy(chore.id, d.at, by)} />
                  <button type="button" class="icon-btn small" aria-label="Remove this one" onClick={() => store.unmarkChore(chore.id, d.at)}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <div class="row past-day">
            <input type="date" aria-label="Day it was done" value={pastDay} max={today} onInput={(e) => setPastDay(e.currentTarget.value)} />
            <button type="button" class="btn" onClick={logPast} disabled={!pastDay || pastDay > today}>Mark done</button>
          </div>
          <p class="hint">Forgot to tick it off? Pick the day it was done. Tap a name to change who did it.</p>
        </div>
        <RepeatFields cadence={cadence} days={days} times={timesOf(chore)} onCadence={pickCadence} onDays={pickDays} onTimes={pickTimes} />
        {(!inList || chore.owner) && <OwnerPicker value={chore.owner || null} onChange={pickOwner} />}
        <EmojiPicker value={icon} onChange={pickIcon} prefer={inList ? [] : CHORE_ICONS} />
        <button class="btn primary big" type="submit">Done</button>
        {inList && (
          <button
            class="btn big"
            type="button"
            onClick={() => {
              commitName();
              store.stopRepeating(chore.id);
              onClose();
            }}
          >
            Stop repeating (make it a one-off)
          </button>
        )}
        <button class="btn danger big" type="button" onClick={() => { store.deleteChore(chore.id); onClose(); deleted(`Deleted “${chore.name}”`, () => store.updateChore(chore.id, { deleted: false })); }}>{inList ? 'Delete' : 'Delete chore'}</button>
      </form>
    </Sheet>
  );
}
