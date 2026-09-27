import { useEffect } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { BackIcon } from './Icons.jsx';
import { dayKey, dayLabel, formatTime } from '../baby.js';

export function Activity() {
  const { activity, navigate } = useApp();
  const entries = activity.entries();

  // Seen once you've looked.
  useEffect(() => {
    const t = setTimeout(() => activity.markAllSeen(), 600);
    return () => {
      clearTimeout(t);
      activity.markAllSeen();
    };
  }, [activity]);

  const groups = [];
  for (const e of entries) {
    const key = dayKey(e.at);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, entries: [] });
    groups[groups.length - 1].entries.push(e);
  }

  return (
    <div class="screen">
      <header class="topbar">
        <button class="icon-btn back" aria-label="Back" onClick={() => history.length > 1 ? history.back() : navigate('/')}><BackIcon /></button>
        <h1>Activity</h1>
        <div class="topbar-actions" />
      </header>
      <div class="content">
        {entries.length === 0 && (
          <div class="empty">
            <p class="big-emoji">👀</p>
            <p>Nothing yet. When someone else adds, changes or removes anything, it shows up here.</p>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} class="day">
            <div class="day-head"><span>{dayLabel(g.key)}</span></div>
            <ul class="items">
              {g.entries.map((e) => (
                <li key={e.id} class={'act' + (e.seen ? '' : ' unseen')}>
                  <span class="avatar" aria-hidden="true">{(e.actor || '?').slice(0, 1).toUpperCase()}</span>
                  <span class="act-body">
                    <span class="act-text"><b>{e.mine ? 'You' : e.actor}</b> {e.text}</span>
                    <span class="act-time">{formatTime(e.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
