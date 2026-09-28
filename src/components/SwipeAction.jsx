import { swipeHandlers } from '../swipe.js';

/**
 * Swipe-to-delete for a row: spread `row` onto the <li> (which needs the
 * "swipe-row" class) and render `action` as its last child.
 */
export function swipeDelete(onDelete, { confirm = false, label = 'Delete' } = {}) {
  const h = swipeHandlers({ onDelete, confirm });
  return {
    row: { onPointerDown: h.onPointerDown, onClickCapture: h.onClickCapture },
    action: (
      <button type="button" class="swipe-action" tabIndex={-1} aria-hidden="true" onClick={h.onActionClick}>
        <span class="swipe-fill"><span class="swipe-label">{label}</span></span>
      </button>
    ),
  };
}
