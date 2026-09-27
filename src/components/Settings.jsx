import { useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { DEFAULT_RELAYS } from '../sync.js';
import { APP_VERSION, BUILD_TIME, checkForUpdate } from '../pwa.js';
import { BackIcon } from './Icons.jsx';

export function Settings() {
  const { session, status, setName, leave, navigate, store } = useApp();
  const [leaving, setLeaving] = useState(false);
  const members = store ? store.members() : [];
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
        <h2>Family members</h2>
        <p class="hint">Every phone that has joined with your code. Joins, leaves and name changes also show in Activity.</p>
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
      </div>
    </div>
  );
}
