import { useEffect, useReducer, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet } from './Sheet.jsx';
import { SyncBadge } from './SyncBadge.jsx';
import { TabBar } from './TabBar.jsx';
import { GearIcon } from './Icons.jsx';
import {
  DEFAULT_FEED_INTERVAL_MIN,
  DEFAULT_SLEEP_INTERVAL_MIN,
  currentState,
  dayLabel,
  dayStats,
  formatDuration,
  formatTime,
  fromInputValue,
  groupByDay,
  nextFeedAt,
  nextSleepAt,
  relative,
  toInputValue,
} from '../baby.js';

const INTERVALS = [120, 150, 180, 210, 240];

export function Baby() {
  const { store, session, navigate } = useApp();
  const [, tick] = useReducer((x) => x + 1, 0);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  const [justAdded, setJustAdded] = useState(null);

  // Durations on screen need to keep moving.
  useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const logs = store.logs();
  const profile = store.getMeta('baby') || {};
  const name = profile.name || 'Baby';
  const feedEvery = profile.feedIntervalMin || DEFAULT_FEED_INTERVAL_MIN;
  const sleepEvery = profile.sleepIntervalMin || DEFAULT_SLEEP_INTERVAL_MIN;
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
  const sleepDue = nextSleepAt(state, sleepEvery);
  const groups = groupByDay(logs);

  return (
    <div class="screen has-tabs">
      <header class="topbar">
        <h1>{name}</h1>
        <div class="topbar-actions">
          <SyncBadge />
          <button class="icon-btn gear" aria-label="Baby settings" onClick={() => setMenu(true)}><GearIcon /></button>
        </div>
      </header>

      <div class="content">
      <section class={'status ' + (state.asleep ? 'asleep' : 'awake')} aria-live="polite">
        {state.asleep ? (
          <>
            <div class="status-main">
              <span class="status-emoji">😴</span>
              <div>
                <div class="status-title">Asleep {formatDuration(now - state.asleep.startAt)}</div>
                <div class="status-sub">since {formatTime(state.asleep.startAt)}</div>
              </div>
            </div>
          </>
        ) : (
          <div class="status-main">
            <span class="status-emoji">☀️</span>
            <div>
              <div class="status-title">{state.awakeSince ? `Awake ${formatDuration(now - state.awakeSince)}` : 'Awake'}</div>
              <div class="status-sub">
                {state.awakeSince ? `up since ${formatTime(state.awakeSince)}` : 'no sleep logged yet'}
                {sleepDue ? ` · nap ${relative(sleepDue, now)}` : ''}
              </div>
            </div>
          </div>
        )}
        <div class="status-row">
          <span class="status-emoji small">🍼</span>
          <div>
            <div class="status-line">
              {state.lastFeed ? `Last fed ${formatTime(state.lastFeed.startAt)} (${relative(state.lastFeed.startAt, now)})` : 'No feeds logged yet'}
            </div>
            {feedDue && (
              <div class={'status-sub' + (feedDue <= now ? ' due' : '')}>
                {feedDue <= now ? `Feed due · ${relative(feedDue, now)}` : `Next feed ~${formatTime(feedDue)} (${relative(feedDue, now)})`}
              </div>
            )}
          </div>
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
              {g.logs.map((l) => (
                <li key={l.id} class={'log' + (justAdded === l.id ? ' flash' : '')}>
                  <button class="log-row" onClick={() => setEditing(l.id)}>
                    <span class="log-emoji">{l.kind === 'feed' ? '🍼' : '😴'}</span>
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
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      </div>

      <div class="bottom-bar actions">
        <button class="btn primary big" onClick={fedNow}>🍼 Fed now</button>
        {state.asleep ? (
          <button class="btn big wake" onClick={wokeNow}>☀️ Woke up</button>
        ) : (
          <button class="btn big sleep" onClick={sleepNow}>😴 Fell asleep</button>
        )}
      </div>
      <TabBar active="baby" />

      {editing && store.getEntity('log', editing) && <EditLogSheet log={store.getEntity('log', editing)} onClose={() => setEditing(null)} />}
      {menu && <BabyMenuSheet profile={profile} onClose={() => setMenu(false)} />}
    </div>
  );
}

function EditLogSheet({ log, onClose }) {
  const { store } = useApp();
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
          <button type="button" role="radio" aria-checked={kind === 'feed'} class={kind === 'feed' ? 'on' : ''} onClick={() => setKind('feed')}>🍼 Feed</button>
          <button type="button" role="radio" aria-checked={kind === 'sleep'} class={kind === 'sleep' ? 'on' : ''} onClick={() => setKind('sleep')}>😴 Sleep</button>
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
        <button class="btn danger big" type="button" onClick={() => { store.deleteLog(log.id); onClose(); }}>Delete</button>
      </form>
    </Sheet>
  );
}

function BabyMenuSheet({ profile, onClose }) {
  const { store, navigate } = useApp();
  const [name, setName] = useState(profile.name || '');
  const [feedEvery, setFeedEvery] = useState(profile.feedIntervalMin || DEFAULT_FEED_INTERVAL_MIN);
  const [sleepEvery, setSleepEvery] = useState(profile.sleepIntervalMin || DEFAULT_SLEEP_INTERVAL_MIN);
  const save = (e) => {
    e.preventDefault();
    store.setMeta('baby', { name: name.trim(), feedIntervalMin: feedEvery, sleepIntervalMin: sleepEvery });
    onClose();
  };
  const label = (m) => (m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
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
          <label>Naps about every</label>
          <div class="chips" role="radiogroup">
            {INTERVALS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={sleepEvery === m} class={'chip' + (sleepEvery === m ? ' on' : '')} onClick={() => setSleepEvery(m)}>{label(m)}</button>
            ))}
          </div>
          <p class="hint">Used only for the "next feed" and "nap" hints. Adjust as his rhythm changes.</p>
        </div>
        <button class="btn primary big" type="submit">Save</button>
        <button class="btn link" type="button" onClick={() => { onClose(); navigate('/settings'); }}>Family code, sync & app settings</button>
      </form>
    </Sheet>
  );
}
