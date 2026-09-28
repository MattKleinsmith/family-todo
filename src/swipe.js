// Swipe a row left to delete it, the way iOS lists do: a short swipe leaves
// a red Delete button showing, a long swipe deletes straight away, and a tap
// anywhere else (or a scroll) closes the open row without doing anything else.
//
// The row itself slides; its `.swipe-action` child sits just past its right
// edge and grows to fill the gap. Vertical scrolling is left to the browser
// (touch-action: pan-y), and touches that start on a drag grip or a text
// field are ignored.

const ACTION_W = 88; // px showing when a row is left open
const FULL_SWIPE = 0.55; // fraction of the row's width past which letting go deletes
const DECIDE = 8; // px of movement before we decide between swipe and scroll

let open = null; // { row, close }
let swallowUntil = 0; // swallow the click that follows a tap which only closed a row

function actionOf(row) {
  return row.querySelector(':scope > .swipe-action');
}

function place(row, x, animate) {
  const action = actionOf(row);
  const t = animate ? 'transform 0.22s ease, height 0.22s ease' : 'none';
  row.style.transition = t;
  row.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  if (action) {
    action.style.transition = animate ? 'width 0.22s ease' : 'none';
    action.style.width = `${Math.max(0, -x)}px`;
  }
  if (x) row.dataset.swipe = row.dataset.swipe === 'armed' ? 'armed' : 'moving';
  else delete row.dataset.swipe;
}

function setArmed(row, armed) {
  if (armed) row.dataset.swipe = 'armed';
  else if (row.dataset.swipe === 'armed') row.dataset.swipe = 'moving';
}

/** Close whichever row is open. */
export function closeOpenRow(animate = true) {
  if (!open) return;
  const { row } = open;
  open = null;
  place(row, 0, animate);
}

function onDocPointerDown(e) {
  if (!open) return;
  const action = actionOf(open.row);
  if (action && action.contains(e.target)) return; // pressing Delete
  closeOpenRow();
  swallowUntil = Date.now() + 700;
  removeDocListeners();
}
function onDocClick(e) {
  if (Date.now() < swallowUntil) {
    swallowUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }
}
function onDocScroll() {
  closeOpenRow();
  removeDocListeners();
}
function addDocListeners() {
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('scroll', onDocScroll, true);
}
function removeDocListeners() {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('scroll', onDocScroll, true);
}
if (typeof document !== 'undefined') document.addEventListener('click', onDocClick, true);

/** Slide the row out and fold it away, then call `done`. */
function removeRow(row, done) {
  const h = row.offsetHeight;
  place(row, -row.offsetWidth, true);
  setTimeout(() => {
    row.style.overflow = 'hidden';
    row.style.height = `${h}px`;
    // Force the starting height before animating to zero.
    void row.offsetHeight;
    row.style.transition = 'height 0.2s ease';
    row.style.height = '0px';
    setTimeout(done, 200);
  }, 200);
}

/**
 * Pointer handlers for a row. `onDelete` runs when the row is deleted by a
 * long swipe or by pressing its Delete button. With `confirm`, the row
 * springs back instead of folding away, because `onDelete` will ask first.
 */
export function swipeHandlers({ onDelete, confirm = false }) {
  const commit = (row) => {
    open = null;
    removeDocListeners();
    if (confirm) {
      place(row, 0, true);
      setTimeout(onDelete, 0);
    } else removeRow(row, onDelete);
  };

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const row = e.currentTarget;
      if (e.target.closest('.grip, input, textarea, .swipe-action')) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const base = open && open.row === row ? -ACTION_W : 0;
      let mode = null; // 'swipe' | 'scroll'
      let x = base;
      let lastX = startX;
      let lastT = performance.now();
      let velocity = 0;

      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!mode) {
          if (Math.abs(dx) > DECIDE && Math.abs(dx) > Math.abs(dy) * 1.2 && (dx < 0 || base < 0)) {
            mode = 'swipe';
            if (open && open.row !== row) closeOpenRow();
            try {
              row.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          } else if (Math.abs(dy) > DECIDE || Math.abs(dx) > DECIDE) {
            mode = 'scroll';
            return finish(false);
          } else return;
        }
        if (ev.cancelable) ev.preventDefault();
        const now = performance.now();
        velocity = (ev.clientX - lastX) / Math.max(1, now - lastT);
        lastX = ev.clientX;
        lastT = now;
        x = Math.min(0, base + dx);
        place(row, x, false);
        setArmed(row, -x > row.offsetWidth * FULL_SWIPE);
      };

      const finish = (commitGesture) => {
        row.removeEventListener('pointermove', move);
        row.removeEventListener('pointerup', up);
        row.removeEventListener('pointercancel', cancel);
        if (mode !== 'swipe') return;
        row.dataset.swiped = '1'; // the click that follows is not a tap
        setTimeout(() => delete row.dataset.swiped, 400);
        if (!commitGesture) {
          place(row, base, true);
          return;
        }
        const width = row.offsetWidth;
        if (-x > width * FULL_SWIPE || (velocity < -1.2 && -x > ACTION_W)) return commit(row);
        if (-x > ACTION_W / 2 || velocity < -0.5) {
          setArmed(row, false);
          place(row, -ACTION_W, true);
          open = { row };
          addDocListeners();
        } else {
          if (open && open.row === row) open = null;
          place(row, 0, true);
          removeDocListeners();
        }
      };
      const up = () => finish(true);
      const cancel = () => finish(false);

      row.addEventListener('pointermove', move);
      row.addEventListener('pointerup', up);
      row.addEventListener('pointercancel', cancel);
    },
    onClickCapture(e) {
      if (e.currentTarget.dataset.swiped) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onActionClick(e) {
      e.preventDefault();
      e.stopPropagation();
      commit(e.currentTarget.parentElement);
    },
  };
}
