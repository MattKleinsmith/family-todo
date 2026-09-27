import { useApp } from '../app.jsx';
import { BellIcon } from './Icons.jsx';

/** Header bell: how many changes from other people you haven't looked at yet. */
export function Bell() {
  const { activity, navigate } = useApp();
  const n = activity ? activity.unseenCount() : 0;
  return (
    <button class={'icon-btn bell' + (n ? ' has-new' : '')} aria-label={n ? `${n} new changes` : 'Activity'} onClick={() => navigate('/activity')}>
      <BellIcon />
      {n > 0 && <span class="badge">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}
