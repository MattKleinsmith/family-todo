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
  DEFAULT_NAP_AFTER_WAKE_MIN,
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
  feedDueAt,
  isNightStart,
  couldBeNight,
  DEFAULT_BEDTIME_MIN,
  DEFAULT_NIGHT_AFTER_FEED,
  sleepEndedByFeed,
  followFeedMove,
  relative,
  toInputValue,
} from '../baby.js';

const INTERVALS = [120, 150, 180, 210, 240];
const NAP_AFTER = [60, 90, 120, 150, 180];
const BEDTIMES = [19 * 60, 19 * 60 + 30, 20 * 60, 20 * 60 + 30, 21 * 60, 21 * 60 + 30, 22 * 60];
const NIGHT_AFTER = [3, 4, 5, 6, 0];

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
  const napAfter = profile.napAfterWakeMin || DEFAULT_NAP_AFTER_WAKE_MIN;
  const nightRules = {
    bedtimeMin: profile.bedtimeMin ?? DEFAULT_BEDTIME_MIN,
    nightAfterFeed: profile.nightAfterFeed ?? DEFAULT_NIGHT_AFTER_FEED,
  };
  const state = currentState(logs, now);

  const flash = (log) => {
    setJustAdded(log.id);
    setTimeout(() => setJustAdded((cur) => (cur === log.id ? null : cur)), 1500);
  };

  const fedNow = () => {
    const at = Date.now();
    const feed = store.addLog({ kind: 'feed', startAt: at, createdBy: session.name });
    flash(feed);
    // Fed while the app thinks he's asleep: someone forgot "Woke up", so the nap ends now.
    // A dream feed (fed without waking) is the exception, hence Undo.
    const nap = sleepEndedByFeed(logs, at);
    if (nap) {
      store.updateLog(nap.id, { endAt: at, endedByFeed: feed.id });
      deleted(`Also ended the nap: woke by ${formatTime(at)} (slept ${formatDuration(at - nap.startAt)})`, () =>
        store.updateLog(nap.id, { endAt: null, endedByFeed: null }),
      );
    }
  };
  const sleepNow = () => {
    if (state.asleep) return;
    const at = Date.now();
    // After bedtime, or after his usual number of feeds in the evening, this is his night sleep.
    flash(store.addLog({ kind: 'sleep', startAt: at, createdBy: session.name, night: isNightStart(at, logs, nightRules) }));
  };
  const wokeNow = () => {
    if (!state.asleep) return;
    store.updateLog(state.asleep.id, { endAt: Date.now() });
  };

  const feedDue = feedDueAt(state, feedEvery);
  const downForNight = !!(state.asleep && state.asleep.night);
  const afterNight = !state.asleep && state.lastSleep?.night && state.lastFeed && state.lastSleep.startAt > state.lastFeed.startAt;
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
          {downForNight ? (
            <NextTile glyph="moon" title="Night sleep" value={formatDuration(now - state.asleep.startAt)} lead="asleep for" note={`since ${formatTime(state.asleep.startAt)}`} />
          ) : state.asleep ? (
            <NextTile glyph="sleeping" title="Napping" value={formatDuration(now - state.asleep.startAt)} lead="asleep for" note={`since ${formatTime(state.asleep.startAt)}`} />
          ) : sleepDue ? (
            <NextTile glyph="sleeping" title="Next nap" {...countdown(sleepDue, now)} />
          ) : (
            <NextTile glyph="sleeping" title="Next nap" value="—" note="log a sleep to see" quiet />
          )}
          {downForNight ? (
            // No feeds during the night sleep, so nothing counts down or goes overdue.
            <NextTile glyph="bottle" title="Next feed" value="—" note={`when ${name} wakes`} quiet />
          ) : feedDue ? (
            <NextTile glyph="bottle" title="Next feed" {...(afterNight ? { ...countdown(feedDue, now), note: 'morning feed' } : countdown(feedDue, now))} />
          ) : (
            <NextTile glyph="bottle" title="Next feed" value="—" note="no feeds logged yet" quiet />
          )}
        </div>
        {state.asleep && (downForNight || couldBeNight(state.asleep.startAt)) && (
          <button type="button" class="night-switch" onClick={() => store.updateLog(state.asleep.id, { night: !downForNight })}>
            {downForNight ? 'Just a nap? Count it as a nap' : 'Down for the night? Make it night sleep'}
          </button>
        )}
        <div class="status-now">
          <Glyph name={downForNight ? 'moon' : state.asleep ? 'sleeping' : 'sun'} size={18} />
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
                    <span class="log-emoji"><Glyph name={l.kind === 'feed' ? 'bottle' : l.night ? 'moon' : 'sleeping'} size={26} /></span>
                    <span class="log-body">
                      <span class="log-title">
                        {l.kind === 'feed'
                          ? 'Feed'
                          : l.endAt == null
                            ? l.night ? 'Night sleep…' : 'Sleeping…'
                            : `${l.night ? 'Night sleep' : 'Slept'} ${formatDuration(l.endAt - l.startAt)}`}
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

/** Quick fixes for "I forgot to tap it": the same row for any time field. */
function Nudges({ onNudge }) {
  return (
    <div class="row nudges">
      {[-30, -15, -5, 5].map((m) => (
        <button key={m} type="button" class="btn" onClick={() => onNudge(m)}>{m < 0 ? `−${-m}m` : `+${m}m`}</button>
      ))}
    </div>
  );
}

function EditLogSheet({ log, onClose }) {
  const { store, deleted } = useApp();
  const [kind, setKind] = useState(log.kind);
  const [startAt, setStartAt] = useState(log.startAt);
  const [endAt, setEndAt] = useState(log.endAt);
  const [note, setNote] = useState(log.note || '');
  const [night, setNight] = useState(!!log.night);
  const ongoing = kind === 'sleep' && endAt == null;

  const save = (e) => {
    e.preventDefault();
    const changes = { kind, startAt, note: note.trim(), endAt: kind === 'sleep' ? endAt : null, night: kind === 'sleep' ? night : false };
    if (kind === 'sleep' && endAt != null && endAt < startAt) changes.endAt = startAt;
    // Moving a feed that ended a nap moves the nap's end with it.
    if (log.kind === 'feed' && kind === 'feed' && startAt !== log.startAt) {
      for (const s of store.logs()) {
        const end = followFeedMove(s, log, startAt);
        if (end != null) store.updateLog(s.id, { endAt: end });
      }
    }
    store.updateLog(log.id, changes);
    onClose();
  };

  const nudge = (min) => setStartAt((t) => t + min * 60_000);
  // Waking can't come before falling asleep.
  const nudgeEnd = (min) => setEndAt((t) => Math.max(startAt, t + min * 60_000));

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
          <Nudges onNudge={nudge} />
        </div>
        {kind === 'sleep' && (
          <label class="toggle">
            <input type="checkbox" checked={night} onChange={(e) => setNight(e.currentTarget.checked)} />
            <span>Night sleep <span class="muted">(no feed countdown during it)</span></span>
          </label>
        )}
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
                <Nudges onNudge={nudgeEnd} />
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
  // Every choice takes effect the moment it's made; closing the sheet (Save,
  // a swipe down or a tap outside) just closes it. The name is written when
  // the field is left or the sheet closes, not on every keystroke.
  const [name, setName] = useState(profile.name || '');
  const [feedEvery, setFeedEvery] = useState(profile.feedIntervalMin || DEFAULT_FEED_INTERVAL_MIN);
  const [napAfter, setNapAfter] = useState(profile.napAfterWakeMin || DEFAULT_NAP_AFTER_WAKE_MIN);
  const [bedtime, setBedtime] = useState(profile.bedtimeMin ?? DEFAULT_BEDTIME_MIN);
  const [nightAfter, setNightAfter] = useState(profile.nightAfterFeed ?? DEFAULT_NIGHT_AFTER_FEED);
  const pick = (setter, field) => (v) => {
    setter(v);
    if ((store.getMeta('baby') || {})[field] !== v) store.setMeta('baby', { [field]: v });
  };
  const commitName = () => {
    const n = name.trim();
    if (n !== ((store.getMeta('baby') || {}).name || '')) store.setMeta('baby', { name: n });
  };
  const close = () => {
    commitName();
    onClose();
  };
  const save = (e) => {
    e.preventDefault();
    close();
  };
  const choose = { feedEvery: pick(setFeedEvery, 'feedIntervalMin'), napAfter: pick(setNapAfter, 'napAfterWakeMin'), bedtime: pick(setBedtime, 'bedtimeMin'), nightAfter: pick(setNightAfter, 'nightAfterFeed') };
  const clock = (m) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const label = (m) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
  return (
    <Sheet title="Baby settings" onClose={close}>
      <form class="stack" onSubmit={save}>
        <button class="btn settings-link" type="button" onClick={() => { close(); navigate('/settings'); }}>
          <GearIcon /> <span>App settings</span> <span class="hint">family code, members, sync</span>
        </button>
        <div class="field">
          <label for="baby-name">Name</label>
          <input id="baby-name" type="text" placeholder="Baby" value={name} onInput={(e) => setName(e.currentTarget.value)} onChange={commitName} />
        </div>
        <div class="field">
          <label>Feeds about every</label>
          <div class="chips" role="radiogroup">
            {INTERVALS.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={feedEvery === m} class={'chip' + (feedEvery === m ? ' on' : '')} onClick={() => choose.feedEvery(m)}>{label(m)}</button>
            ))}
          </div>
        </div>
        <div class="field">
          <label>Nap about this long after waking up</label>
          <div class="chips" role="radiogroup">
            {NAP_AFTER.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={napAfter === m} class={'chip' + (napAfter === m ? ' on' : '')} onClick={() => choose.napAfter(m)}>{label(m)}</button>
            ))}
          </div>
          <p class="hint">Used only for the countdowns: the next feed counts from when the last feed started, the next nap from when he last woke up. Adjust as his rhythm changes.</p>
        </div>
        <div class="field">
          <label>Night sleep: “Fell asleep” after this time</label>
          <div class="chips" role="radiogroup">
            {BEDTIMES.map((m) => (
              <button type="button" key={m} role="radio" aria-checked={bedtime === m} class={'chip' + (bedtime === m ? ' on' : '')} onClick={() => choose.bedtime(m)}>{clock(m)}</button>
            ))}
          </div>
        </div>
        <div class="field">
          <label>…or in the evening, after this many feeds that day</label>
          <div class="chips" role="radiogroup">
            {NIGHT_AFTER.map((n) => (
              <button type="button" key={n} role="radio" aria-checked={nightAfter === n} class={'chip' + (nightAfter === n ? ' on' : '')} onClick={() => choose.nightAfter(n)}>{n ? `${n} feeds` : 'Don’t use'}</button>
            ))}
          </div>
          <p class="hint">During night sleep there’s no feed countdown and nothing goes overdue; in the morning the next feed is due when he wakes. You can switch any sleep between nap and night sleep on the card or by tapping it.</p>
        </div>
        <p class="hint">Changes apply as soon as you pick them.</p>
        <button class="btn primary big" type="submit">Save</button>
      </form>
    </Sheet>
  );
}
