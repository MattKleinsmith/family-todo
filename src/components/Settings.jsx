import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { DEFAULT_RELAYS, relaySizeOf } from '../sync.js';
import { APP_VERSION, BUILD_TIME, checkForUpdate } from '../pwa.js';
import { BackIcon } from './Icons.jsx';
import { getTheme, setTheme } from '../theme.js';
import { Glyph } from './Glyph.jsx';
import { dedupeMembers } from '../members.js';

export function Settings() {
  const { session, status, setName, leave, navigate, store, sync, activity } = useApp();
  const [leaving, setLeaving] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const pickTheme = (t) => {
    setTheme(t);
    setThemeState(t);
  };
  const members = store ? dedupeMembers(store.members()) : [];
  const [name, setNameInput] = useState(session.name);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  const update = async () => {
    setUpdateMsg('Checking…');
    const found = await checkForUpdate();
    setUpdateMsg(found ? 'Update found, installing… the app will reload.' : 'You have the latest version.');
  };

  const joinLink = `${location.origin}${location.pathname}#/join/${encodeURIComponent(session.code)}`;

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this:', text);
    }
  };

  const share = async () => {
    const data = { title: 'Join our family lists', text: `Join our family to-do lists. Family code: ${session.code}`, url: joinLink };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* cancelled */
      }
    }
    copy(joinLink);
  };

  return (
    <div class="screen">
      <header class="topbar">
        <button class="icon-btn back" aria-label="Back" onClick={() => navigate('/')}><BackIcon /></button>
        <h1>Settings</h1>
        <div class="topbar-actions" />
      </header>

      <div class="content">
      <section class="section">
        <h2>Family code</h2>
        <p class="hint">Your partner enters this code (or opens the link) to see and edit the same lists.</p>
        <div class="code-display" onClick={() => setShowCode(!showCode)}>
          {showCode ? session.code : '•••• tap to reveal ••••'}
        </div>
        <div class="row">
          <button class="btn" onClick={() => copy(session.code)}>{copied ? 'Copied!' : 'Copy code'}</button>
          <button class="btn primary" onClick={share}>Share invite link</button>
        </div>
      </section>

      <section class="section">
        <h2>Your name</h2>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setName(name);
          }}
        >
          <input type="text" value={name} onInput={(e) => setNameInput(e.currentTarget.value)} />
          <button class="btn" type="submit" disabled={!name.trim() || name.trim() === session.name}>Save</button>
        </form>
      </section>

      <section class="section">
        <h2>Appearance</h2>
        <div class="segmented" role="radiogroup" aria-label="Appearance">
          {[
            ['light', 'sun', 'Light'],
            ['dark', 'moon', 'Dark'],
            ['auto', null, 'Auto'],
          ].map(([t, glyph, label]) => (
            <button type="button" key={t} role="radio" aria-checked={theme === t} class={theme === t ? 'on' : ''} onClick={() => pickTheme(t)}>
              {glyph && <Glyph name={glyph} size={18} />} {label}
            </button>
          ))}
        </div>
        <p class="hint">Auto follows your phone's light or dark setting. This is per phone.</p>
      </section>

      <section class="section">
        <h2>Family members</h2>
        <p class="hint">Everyone who has joined with your code, one row per person per kind of device. Joins, leaves and name changes also show in Activity.</p>
        <ul class="members">
          {members.map((m) => (
            <li key={m.id} class={m.leftAt ? 'left' : ''}>
              <span class="avatar" aria-hidden="true">{(m.name || '?').slice(0, 1).toUpperCase()}</span>
              <span class="member-body">
                <span class="member-name">{m.name || 'Unnamed'}{m.leftAt ? ' (left)' : ''}</span>
                <span class="hint">{m.device || 'device'}{m.joinedAt ? ` · joined ${new Date(m.joinedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section class="section">
        <h2>Sync</h2>
        <p class="hint">
          Connected to {status.connected} of {status.total} relays.
          {status.lastSyncAt ? ` Last synced ${new Date(status.lastSyncAt).toLocaleTimeString()}.` : ''}
        </p>
        <p class="hint">
          Lists are stored on your phone and mirrored, encrypted, to public relays so your partner's phone can pick
          them up. Only people with the family code can read them.
        </p>
        <details>
          <summary class="hint">Relays</summary>
          <ul class="hint">
            {DEFAULT_RELAYS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </section>

      <section class="section">
        <h2>Add to your home screen</h2>
        <p class="hint">
          On iPhone: open this page in Safari, tap the Share button, then "Add to Home Screen". It then opens
          full-screen like a normal app and works offline.
        </p>
      </section>

      <section class="section">
        <h2>App version</h2>
        <p class="hint">
          {APP_VERSION}
          {BUILD_TIME ? ` · built ${new Date(BUILD_TIME).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </p>
        <p class="hint">
          New versions install on their own whenever you open the app, and it reloads once one is ready. Stuck on an old one? Check here.
        </p>
        <div class="row">
          <button class="btn" onClick={update}>Check for updates</button>
        </div>
        {updateMsg && <p class="hint">{updateMsg}</p>}
      </section>

      <section class="section">
        <h2>Leave family</h2>
        <p class="hint">Removes the code and lists from this phone only. Your partner keeps everything, and you can rejoin with the code.</p>
        <button
          class="btn danger"
          disabled={leaving}
          onClick={async () => {
            if (!confirm('Leave this family on this phone?')) return;
            setLeaving(true);
            await leave();
          }}
        >
          {leaving ? 'Leaving…' : 'Leave family'}
        </button>
      </section>

      <DebugSection store={store} sync={sync} activity={activity} status={status} />
      </div>
    </div>
  );
}

function fmtBytes(n) {
  if (n == null || !Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}


function DebugSection({ store, sync, activity, status }) {
  const [estimate, setEstimate] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => alive && setEstimate(e)).catch(() => {});
      tick((x) => x + 1);
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!store) return null;
  const sizes = store.sizes();
  const stats = sync ? sync.stats() : null;
  const relays = sync ? sync.relayStates() : [];
  const relayBytes = store.all().reduce((n, e) => n + relaySizeOf(e), 0);
  const envelope = sizes.totalRecords ? Math.round((relayBytes - sizes.totalBytes) / sizes.totalRecords) : 0;
  const label = { list: 'Lists', item: 'Items', log: 'Baby logs', summary: 'Day summaries', member: 'Members', meta: 'Settings', activity: 'Activity chunks' };
  return (
    <section class="section debug">
      <h2>Debug</h2>
      <p class="hint">For keeping an eye on things. Nothing here needs attention unless a number looks wild.</p>

      <h3>Records on this phone</h3>
      <table class="debug-table">
        <tbody>
          {Object.entries(sizes.byType).map(([type, s]) => (
            <tr key={type}>
              <td>{label[type] || type}</td>
              <td>{s.live}{s.deleted ? <span class="hint"> + {s.deleted} deleted</span> : null}</td>
              <td class="num">{fmtBytes(s.bytes)}</td>
            </tr>
          ))}
          <tr class="total">
            <td>Total</td>
            <td>{sizes.totalRecords} records</td>
            <td class="num">{fmtBytes(sizes.totalBytes)}</td>
          </tr>
          <tr>
            <td>Activity entries</td>
            <td>{activity ? activity.entries().length : 0} (synced, kept 180 days)</td>
            <td class="num">in chunks above</td>
          </tr>
        </tbody>
      </table>

      <h3>Storage on this phone</h3>
      <p class="hint">
        {estimate ? `${fmtBytes(estimate.usage)} used of ${fmtBytes(estimate.quota)} available (${((estimate.usage / estimate.quota) * 100).toFixed(2)}%).` : 'Browser did not report storage usage.'}
      </p>

      <h3>On the relays</h3>
      <p class="hint">
        {fmtBytes(relayBytes)} for this family on each relay: the {fmtBytes(sizes.totalBytes)} of records above, each encrypted and wrapped in a signed envelope
        (id, key, signature, timestamp, tag) that adds about {envelope} B per record. Small records are mostly envelope. Relays keep only the newest version of each record.
      </p>
      <ul class="hint relay-list">
        {relays.map((r) => (
          <li key={r.url}>
            <span class={'dot ' + (r.connected ? 'ok' : r.connecting ? 'warn' : 'off')} /> {r.url.replace('wss://', '')}
            {r.connected ? ` · ${r.known} records confirmed` : r.connecting ? ' · connecting' : ' · reconnecting'}
            {r.lastCount != null ? ` · holds ${r.lastCount}` : ''}
            {r.throttled ? ` · asked us to slow down ${r.throttled}×` : ''}
          </li>
        ))}
      </ul>

      <h3>Traffic from this phone</h3>
      {stats && (
        <table class="debug-table">
          <tbody>
            <tr><td>Sent</td><td>{stats.sentEvents} events</td><td class="num">{fmtBytes(stats.sentBytes)}</td></tr>
            <tr><td>Received</td><td>{stats.recvEvents} events</td><td class="num">{fmtBytes(stats.recvBytes)}</td></tr>
          </tbody>
        </table>
      )}
      <p class="hint">
        Counting since {stats && stats.since ? new Date(stats.since).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}, across all relays.
        Opening the app fetches only what changed since this phone last synced (with a 10-minute overlap), and re-sends nothing a relay has confirmed.
        Every two weeks each relay is asked how many records it holds; only one that is short, or can't say, gets a full re-download.
        Sent is higher than received partly because relays echo our own writes back.
        {status.lastSyncAt ? ` Last sync ${new Date(status.lastSyncAt).toLocaleTimeString()}.` : ''}
      </p>
      <div class="row">
        <button class="btn" onClick={() => { sync && sync.resetStats(); tick((x) => x + 1); }}>Reset counters</button>
      </div>
    </section>
  );
}
