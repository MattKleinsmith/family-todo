import { useEffect, useReducer, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { TabBar } from './TabBar.jsx';
import { GearIcon } from './Icons.jsx';
import { Bell } from './Bell.jsx';
import { Glyph } from './Glyph.jsx';
import { swipeDelete } from './SwipeAction.jsx';
import { newestOf, useMarkSeen } from './useSeen.js';
import {
  DEFAULT_FEED_INTERVAL_MIN,
  DEFAULT_NAP_AFTER_FEED_MIN,
  currentState,
  dayLabel,
  dayStart,
  dayStats,
  formatDuration,
  formatTime,
  fromInputValue,
  groupByDay,
  nextFeedAt,
  nextNapAt,
  countdown,
  relative,
  toInputValue,
} from '../baby.js';

const INTERVALS = [120, 150, 180, 210, 240];
const NAP_AFTER = [60, 90, 120, 150, 180];

export function Baby({ focus }) {
  const { store, session, navigate, deleted } = useApp();
  const [, tick] = useReducer((x) => x + 1, 0);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  useMarkSeen('baby', newestOf([...Object.values(store.get().logs), store.getMeta('baby')]));

  // Durations on screen need to keep moving.
  useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  // Arriving from the activity feed: scroll to the log entry in question and highlight it.
  useEffect(() => {
    if (!focus) return;
    setJustAdded(focus);
    const t = setTimeout(() => document.getElementById(`log-${focus}`)?.scrollIntoView({ block: 'center' }), 50);
    const clear = setTimeout(() => setJustAdded((cur) => (cur === focus ? null : cur)), 2000);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [focus]);

  const now = Date.now();
  const logs = store.logs();
  const profile = store.getMeta('baby') || {};
  const name = profile.name || 'Baby';
  const feedEvery = profile.feedIntervalMin || DEFAULT_FEED_INTERVAL_MIN;
  const napAfter = profile.napAfterFeedMin || DEFAULT_NAP_AFTER_FEED_MIN;
  const state = currentState(logs, now);

  const flash = (log) => {
    setJustAdded(log.id);
    setTimeout(() => setJustAdded((cur) => (cur === log.id ? null : cur)), 1500);
  };

  const fedNow = () => flash(store.addLog({ kind: 'feed', startAt: Date.now(), createdBy: session.name }));
  const sleepNow = () => {
    if (state.asleep) return;
    flash(store.addLog({ kind: 'sleep', startAt: Date.now(), createdBy: session.name }));
  };
  const wokeNow = () => {
    if (!state.asleep) return;
    store.updateLog(state.asleep.id, { endAt: Date.now() });
  };

  const feedDue = nextFeedAt(state.lastFeed, feedEvery);
  const sleepDue = nextNapAt(state, napAfter);
  const groups = groupByDay(logs);
  const older = store.summaries();
  const [showOlder, setShowOlder] = useState(false);

  return (
    <div class="screen has-tabs">
      <header class="topbar">
        <h1>{name}</h1>
        <div class="topbar-actions">
          <SyncBadge />
          <Bell />
          <button class="icon-btn gear" aria-label="Baby settings" onClick={() => setMenu(true)}><GearIcon /></button>
        </div>
      </header>

      <div class="content">
      <section class={'status baby-status ' + (state.asleep ? 'asleep' : 'awake')} aria-live="polite">
        {/* What's coming up leads; how things stand now is the small print. */}
        <div class="next-tiles">
          {state.asleep ? (
            <NextTile glyph="sleeping" title="Napping" value={formatDuration(now - state.asleep.startAt)} lead="asleep for" note={`since ${formatTime(state.asleep.startAt)}`} />
          ) : sleepDue ? (
            <NextTile glyph="sleeping" title="Next nap" {...countdown(sleepDue, now)} />
          ) : (
            <NextTile glyph="sleeping" title="Next nap" value="—" note={state.lastFeed ? 'napped since the last feed' : 'log a feed to see'} quiet />
          )}
          {feedDue ? (
            <NextTile glyph="bottle" title="Next feed" {...countdown(feedDue, now)} />
          ) : (
            <NextTile glyph="bottle" title="Next feed" value="—" note="no feeds logged yet" quiet />
          )}
        </div>
        <div class="status-now">
          <Glyph name={state.asleep ? 'sleeping' : 'sun'} size={18} />
          <span>
            {[
              // While he's asleep the nap tile already says so.
              state.asleep ? null : state.awakeSince ? `Awake ${formatDuration(now - state.awakeSince)} (since ${formatTime(state.awakeSince)})` : 'Awake · no sleep logged yet',
              state.lastFeed ? `${state.asleep ? 'Last' : 'last'} fed ${formatTime(state.lastFeed.startAt)} (${relative(state.lastFeed.startAt, now)})` : state.asleep ? 'No feeds logged yet' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </section>

      {logs.length === 0 && (
        <div class="empty">
          <p>Tap a button below when {name} eats or falls asleep. Both phones see it right away.</p>
        </div>
      )}

      {groups.map((g) => {
        const st = dayStats(logs, g.key, now);
        return (
          <section key={g.key} class="day">
            <div class="day-head">
              <span>{dayLabel(g.key, now)}</span>
              <span class="day-stats">
                {st.feeds} feed{st.feeds === 1 ? '' : 's'} · {formatDuration(st.sleepMs)} sleep
              </span>
            </div>
            <ul class="items">
              {g.logs.map((l) => {
                const swipe = swipeDelete(() => {
                  store.deleteLog(l.id);
                  deleted(l.kind === 'feed' ? `Deleted the ${formatTime(l.startAt)} feed` : `Deleted the ${formatTime(l.startAt)} sleep`, () => store.updateLog(l.id, { deleted: false }));
                });
                return (
                <li key={l.id} id={`log-${l.id}`} class={'log swipe-row' + (justAdded === l.id ? ' flash' : '')} {...swipe.row}>
                  <button class="log-row" onClick={() => setEditing(l.id)}>
                    <span class="log-emoji"><Glyph name={l.kind === 'feed' ? 'bottle' : 'sleeping'} size={26} /></span>
                    <span class="log-body">
                      <span class="log-title">
                        {l.kind === 'feed' ? 'Feed' : l.endAt == null ? 'Sleeping…' : `Slept ${formatDuration(l.endAt - l.startAt)}`}
                        {l.note ? <span class="log-note"> · {l.note}</span> : null}
                      </span>
                      <span class="log-sub">
                        {formatTime(l.startAt)}
                        {l.kind === 'sleep' && l.endAt != null ? ` – ${formatTime(l.endAt)}` : ''}
                        {l.createdBy ? ` · ${l.createdBy}` : ''}
                      </span>
                    </span>
                  </button>
                  {swipe.action}
                </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {older.length > 0 && (
        <>
          <button class="section-toggle" onClick={() => setShowOlder(!showOlder)}>
            {showOlder ? '▾' : '▸'} Older days ({older.length})
          </button>
          {showOlder && (
            <ul class="items done">
              {older.map((s) => (
                <li key={s.id} class="log">
                  <div class="log-row">
                    <span class="log-emoji"><Glyph name="calendar" size={26} /></span>
                    <span class="log-body">
                      <span class="log-title">{new Date(dayStart(s.day)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span class="log-sub">
                        {s.feeds} feed{s.feeds === 1 ? '' : 's'} · {s.sleeps} nap{s.sleeps === 1 ? '' : 's'} · {formatDuration(s.sleepMs)} sleep
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p class="hint" style="padding: 8px 4px 0">Days older than 90 days are kept as daily totals to keep the app fast.</p>
        </>
      )}
      </div>

      <div class="bottom-bar actions">
        <button class="btn primary big" onClick={fedNow}><Glyph name="bottle" size={24} /> Fed now</button>
        {state.asleep ? (
          <button class="btn big wake" onClick={wokeNow}><Glyph name="sun" size={24} /> Woke up</button>
        ) : (
          <button class="btn big sleep" onClick={sleepNow}><Glyph name="sleeping" size={24} /> Fell asleep</button>
        )}
      </div>
      <TabBar active="baby" />

      {editing && store.getEntity('log', editing) && <EditLogSheet log={store.getEntity('log', editing)} onClose={() => setEditing(null)} />}
      {menu && <BabyMenuSheet profile={profile} onClose={() => setMenu(false)} />}
    </div>
  );
}

/** One of the two big countdowns at the top: next nap, next feed. */
function NextTile({ glyph, title, lead = '', value, note = '', state = 'later', quiet = false }) {
  return (
    <div class={'next-tile ' + state + (quiet ? ' quiet' : '')}>
      <div class="next-head"><Glyph name={glyph} size={20} /> {title}</div>
      {lead && <div class="next-lead">{lead}</div>}
      <div class="next-value">{value}</div>
      {note && <div class="next-note">{note}</div>}
    </div>
  );
}

function EditLogSheet({ log, onClose }) {
  const { store, deleted } = useApp();
  const [kind, setKind] = useState(log.kind);
  const [startAt, setStartAt] = useState(log.startAt);
  const [endAt, setEndAt] = useState(log.endAt);
  const [note, setNote] = useState(log.note || '');
  const ongoing = kind === 'sleep' && endAt == null;

  const save = (e) => {
    e.preventDefault();
    const changes = { kind, startAt, note: note.trim(), endAt: kind === 'sleep' ? endAt : null };
    if (kind === 'sleep' && endAt != null && endAt < startAt) changes.endAt = startAt;
    store.updateLog(log.id, changes);
    onClose();
  };

  const nudge = (min) => setStartAt((t) => t + min * 60_000);

  return (
    <Sheet title={log.kind === 'feed' ? 'Edit feed' : 'Edit sleep'} onClose={onClose}>
      <form class="stack" onSubmit={save}>
        <div class="segmented" role="radiogroup" aria-label="Type">
          <button type="button" role="radio" aria-checked={kind === 'feed'} class={kind === 'feed' ? 'on' : ''} onClick={() => setKind('feed')}><Glyph name="bottle" size={20} /> Feed</button>
          <button type="button" role="radio" aria-checked={kind === 'sleep'} class={kind === 'sleep' ? 'on' : ''} onClick={() => setKind('sleep')}><Glyph name="sleeping" size={20} /> Sleep</button>
        </div>
        <div class="field">
          <label for="log-start">{kind === 'sleep' ? 'Fell asleep at' : 'Fed at'}</label>
          <input id="log-start" type="datetime-local" value={toInputValue(startAt)} onInput={(e) => { const t = fromInputValue(e.currentTarget.value); if (t != null) setStartAt(t); }} />
          <div class="row nudges">
            <button type="button" class="btn" onClick={() => nudge(-30)}>−30m</button>
            <button type="button" class="btn" onClick={() => nudge(-15)}>−15m</button>
            <button type="button" class="btn" onClick={() => nudge(-5)}>−5m</button>
            <button type="button" class="btn" onClick={() => nudge(5)}>+5m</button>
          </div>
        </div>
        {kind === 'sleep' && (
          <div class="field">
            <label class="toggle">
              <input type="checkbox" checked={ongoing} onChange={(e) => setEndAt(e.currentTarget.checked ? null : Math.max(startAt, Date.now()))} />
              <span>Still asleep</span>
            </label>
            {!ongoing && (
              <>
                <label for="log-end">Woke up at</label>
                <input id="log-end" type="datetime-local" value={toInputValue(endAt)} onInput={(e) => { const t = fromInputValue(e.currentTarget.value); if (t != null) setEndAt(t); }} />
                <p class="hint">Slept {formatDuration(endAt - startAt)}</p>
              </>
            )}
          </div>
        )}
        <div class="field">
          <label for="log-note">Note</label>
          <input id="log-note" type="text" placeholder={kind === 'feed' ? 'e.g. 5 oz, left side' : 'e.g. in the stroller'} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
          {log.createdBy && <p class="hint">Logged by {log.createdBy}</p>}
        </div>
        <button class="btn primary big" type="submit">Save</button>
        <button class="btn danger big" type="button" onClick={() => { store.deleteLog(log.id); onClose(); deleted(`Deleted the ${formatTime(log.startAt)} ${log.kind === 'feed' ? 'feed' : 'sleep'}`, () => store.updateLog(log.id, { deleted: false })); }}>Delete</button>
      </form>
    </Sheet>
  );
}

function BabyMenuSheet({ profile, onClose }) {
  const { store, navigate } = useApp();
  const [name, setName] = useState(profile.name || '');
  const [feedEvery, setFeedEvery] = useState(profile.feedIntervalMin || DEFAULT_FEED_INTERVAL_MIN);
  const [napAfter, setNapAfter] = useState(profile.napAfterFeedMin || DEFAULT_NAP_AFTER_FEED_MIN);
  const save = (e) => {
    e.preventDefault();
    store.setMeta('baby', { name: name.trim(), feedIntervalMin: feedEvery, napAfterFeedMin: napAfter });
    onClose();
  };
  const label = (m) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
  return (
    <Sheet title="Baby settings" onClose={onClose}>
      <form class="stack" onSubmit={save}>
        <div class="field">
          <label for="baby-name">Name</label>
          <input id="baby-name" type="text" placeholder="Baby" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label>Feeds about every</label>
          <div class="chips" role="radiogroup">
            {INTERVALS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={feedEvery === m} class={'chip' + (feedEvery === m ? ' on' : '')} onClick={() => setFeedEvery(m)}>{label(m)}</button>
            ))}
          </div>
        </div>
        <div class="field">
          <label>Nap about this long after a feed starts</label>
          <div class="chips" role="radiogroup">
            {NAP_AFTER.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={napAfter === m} class={'chip' + (napAfter === m ? ' on' : '')} onClick={() => setNapAfter(m)}>{label(m)}</button>
            ))}
          </div>
          <p class="hint">Used only for the "next feed" and "next nap" hints, both counted from when the last feed started. Adjust as his rhythm changes.</p>
        </div>
        <button class="btn primary big" type="submit">Save</button>
        <button class="btn link" type="button" onClick={() => { onClose(); navigate('/settings'); }}>Family code, sync & app settings</button>
      </form>
    </Sheet>
  );
}
