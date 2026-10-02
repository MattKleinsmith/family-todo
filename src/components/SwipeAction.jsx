import { swipeHandlers } from '../swipe.js';

/**
 * Swipe-to-delete for a row: spread `row` onto the <li> (which needs the
 * "swipe-row" class) and render `action` as its last child (and `lead`, if
 * asked for, as its first).
 */
export function swipeDelete(onDelete, { confirm = false, label = 'Delete', lead = null } = {}) {
  const h = swipeHandlers({ onDelete, confirm, onLead: lead ? lead.onCommit : null });
  return {
    row: { onPointerDown: h.onPointerDown, onClickCapture: h.onClickCapture },
    // With `lead` ({ label, onCommit }), swiping right runs it: render `lead` as the row's first child.
    lead: lead ? (
      <span class="swipe-lead" aria-hidden="true">
        <span class="swipe-lead-fill"><span class="swipe-label">{lead.label}</span></span>
      </span>
    ) : null,
    action: (
      <button type="button" class="swipe-action" tabIndex={-1} aria-hidden="true" onClick={h.onActionClick}>
        <span class="swipe-fill"><span class="swipe-label">{label}</span></span>
      </button>
    ),
  };
}
