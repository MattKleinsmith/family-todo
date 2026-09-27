import { useEffect } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { BackIcon, ChevronIcon } from './Icons.jsx';
import { Glyph } from './Glyph.jsx';
import { dayKey, dayLabel, formatTime } from '../baby.js';

/** Where an entry should take you, or null when there's nowhere sensible to go. */
export function targetFor(entry, store) {
  switch (entry.entityType) {
    case 'item': {
      const list = entry.listId && store.getEntity('list', entry.listId);
      if (!list || list.deleted) return null;
      const item = store.getEntity('item', entry.entityId);
      return `#/list/${list.id}${item && !item.deleted ? `?focus=${item.id}` : ''}`;
    }
    case 'list': {
      const list = store.getEntity('list', entry.entityId);
      return list && !list.deleted ? `#/list/${list.id}` : null;
    }
    case 'log': {
      const log = store.getEntity('log', entry.entityId);
      return `#/baby${log && !log.deleted ? `?focus=${log.id}` : ''}`;
    }
    case 'meta':
      return '#/baby';
    case 'member':
      return '#/settings';
    default:
      return null;
  }
}

export function Activity() {
  const { activity, navigate, store } = useApp();
  const entries = activity.visibleEntries();
  const showMine = activity.showMine();
  const hasMine = activity.entries().some((e) => e.mine);

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
        <label class="toggle activity-toggle">
          <input type="checkbox" checked={showMine} onChange={(e) => activity.setShowMine(e.currentTarget.checked)} />
          <span>Show my own changes</span>
        </label>
        {entries.length === 0 && (
          <div class="empty">
            <p class="big-emoji"><Glyph name="eyes" size={56} /></p>
            <p>
              {showMine || !hasMine
                ? 'Nothing yet. When someone adds, changes or removes anything, it shows up here.'
                : 'Nothing from anyone else yet. Turn on “Show my own changes” to see yours.'}
            </p>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} class="day">
            <div class="day-head"><span>{dayLabel(g.key)}</span></div>
            <ul class="items">
              {g.entries.map((e) => {
                const href = targetFor(e, store);
                const inner = (
                  <>
                    <span class="avatar" aria-hidden="true">{(e.actor || '?').slice(0, 1).toUpperCase()}</span>
                    <span class="act-body">
                      <span class="act-text"><b>{e.mine ? 'You' : e.actor}</b> {e.text}</span>
                      <span class="act-time">{formatTime(e.at)}</span>
                    </span>
                    {href && <span class="chev"><ChevronIcon /></span>}
                  </>
                );
                const cls = 'act' + (e.seen ? '' : ' unseen') + (e.mine ? ' mine' : '') + (href ? ' link' : '');
                return (
                  <li key={e.id}>
                    {href ? <a class={cls} href={href}>{inner}</a> : <div class={cls}>{inner}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
