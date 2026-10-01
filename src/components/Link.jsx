import { useEffect, useRef, useState } from 'preact/hooks';
import { LinkOutIcon } from './Icons.jsx';
import { linkLabel, normalizeLink, safeLink } from '../links.js';

/**
 * The link on a row: opens the page (a form, say) in the browser, leaving the
 * app as it is to come back to and tick the item off. Nothing if there's no
 * safe link.
 */
export function LinkButton({ link, name }) {
  const url = safeLink(link);
  if (!url) return null;
  return (
    <a class="link-btn" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open the link for ${name} (${linkLabel(url)})`} onClick={(e) => e.stopPropagation()}>
      <LinkOutIcon />
    </a>
  );
}

/**
 * Edit a link: paste or type it, and it's saved when you leave the field or
 * press return ("forms.gle/abc" is fine). Empty removes it.
 */
export function LinkField({ value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(value || ''), [value]);
  // A sheet swiped away with the keyboard up may never blur the field: save what was typed.
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: save } = latest.current;
      const url = normalizeLink(d);
      if (url && url !== v) save(url);
    },
    [],
  );
  const commit = () => {
    const t = draft.trim();
    if (!t) {
      setBad(false);
      if (value) onCommit(null);
      return;
    }
    const url = normalizeLink(t);
    setBad(!url);
    if (url && url !== value) onCommit(url);
    if (url) setDraft(url);
  };
  const url = safeLink(value);
  return (
    <div class="field">
      <label for="item-link">Link</label>
      <div class="row link-field">
        <input
          id="item-link"
          type="url"
          inputmode="url"
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
          placeholder="Paste a link, like a form to fill in"
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onChange={commit}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }}
        />
        {url && (
          <a class="btn link-open" href={url} target="_blank" rel="noopener noreferrer">
            <LinkOutIcon /> Open
          </a>
        )}
      </div>
      {bad ? <p class="hint warn">That doesn’t look like a web address.</p> : <p class="hint">It shows as a ↗ on the item in the list, to open it straight from there.</p>}
    </div>
  );
}
