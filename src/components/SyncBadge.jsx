import { useApp } from '../app.jsx';

export function SyncBadge() {
  const { status, sync } = useApp();
  let cls = 'sync off';
  let label = 'Offline';
  if (status.connected >= 2) {
    cls = 'sync ok';
    label = 'Synced';
  } else if (status.connected === 1) {
    cls = 'sync warn';
    label = 'Syncing';
  } else if (status.total > 0) {
    cls = 'sync warn';
    label = 'Connecting';
  }
  const title = `${status.connected} of ${status.total} relays connected`;
  return (
    <button class={cls} title={title} aria-label={`${label}. ${title}`} onClick={() => sync && sync.reconnectAll()}>
      <span class="dot" /> {label}
    </button>
  );
}
