import { useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { generateCode, normalizeCode, isWeakCode } from '../codes.js';

export function Join({ prefillCode = '', alreadyIn = false }) {
  const { join, navigate } = useApp();
  const [mode, setMode] = useState(prefillCode ? 'join' : 'pick');
  const [code, setCode] = useState(prefillCode);
  const [name, setName] = useState('');
  const [generated] = useState(generateCode);
  const [busy, setBusy] = useState(false);

  const normalized = normalizeCode(mode === 'create' ? generated : code);
  const canGo = normalized.length > 0 && name.trim().length > 0 && !busy;

  const submit = (e) => {
    e.preventDefault();
    if (!canGo) return;
    setBusy(true);
    join({ code: normalized, name });
  };

  return (
    <div class="screen join">
      <div class="join-hero">
        <div class="logo">✓</div>
        <h1>Family To-Do</h1>
        <p class="muted">Shared lists for the two of you. One code, every phone in sync.</p>
      </div>

      {mode === 'pick' && (
        <div class="stack">
          <button class="btn primary big" onClick={() => setMode('create')}>Start a new family</button>
          <button class="btn big" onClick={() => setMode('join')}>I have a family code</button>
          {alreadyIn && <button class="btn link" onClick={() => navigate('/')}>Back to my lists</button>}
        </div>
      )}

      {mode !== 'pick' && (
        <form class="stack" onSubmit={submit}>
          {mode === 'create' ? (
            <div class="field">
              <label>Your new family code</label>
              <div class="code-display">{generated}</div>
              <p class="hint">Write this down or share it with your partner. Anyone with the code can read and edit your lists, so keep it between you.</p>
            </div>
          ) : (
            <div class="field">
              <label for="code">Family code</label>
              <input
                id="code"
                type="text"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck={false}
                placeholder="lucky-river-cabin-orbit"
                value={code}
                onInput={(e) => setCode(e.currentTarget.value)}
              />
              {code && isWeakCode(code) && <p class="hint warn">Short codes are easier to guess. Longer is safer.</p>}
            </div>
          )}

          <div class="field">
            <label for="name">Your name</label>
            <input
              id="name"
              type="text"
              autocomplete="given-name"
              placeholder="e.g. Matt"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <p class="hint">Shown next to things you add, and used for your personal lists.</p>
          </div>

          <button class="btn primary big" type="submit" disabled={!canGo}>
            {busy ? 'Opening…' : mode === 'create' ? 'Create family' : 'Join family'}
          </button>
          <button class="btn link" type="button" onClick={() => setMode('pick')}>Back</button>
        </form>
      )}
    </div>
  );
}
