import { useEffect } from 'preact/hooks';
import { useApp } from '../app.jsx';

/**
 * While this screen is on show, changes the activity feed has for it count as
 * seen, including ones that arrive while you're looking. `shownUpTo` is the
 * newest change among the records on screen (their largest updatedAt). Not
 * while the app is in the background.
 */
export function useMarkSeen(area, shownUpTo = 0) {
  const { activity } = useApp();
  const unseen = activity && area ? activity.unseenForArea(area) : 0;
  useEffect(() => {
    if (!activity || !area) return undefined;
    const mark = () => document.visibilityState === 'visible' && activity.markAreaSeen(area, shownUpTo);
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [activity, area, unseen, shownUpTo]);
}

/** Newest updatedAt among some records. */
export const newestOf = (records) => records.reduce((m, r) => Math.max(m, (r && r.updatedAt) || 0), 0);
