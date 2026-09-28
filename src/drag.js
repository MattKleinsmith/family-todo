// Drag-to-reorder for a vertical list of rows, driven by a grip handle.
// Works with touch, pen and mouse through pointer events. The dragged row
// follows the finger, the others slide out of the way, and the scrolling
// pane auto-scrolls near its edges. On release, `onDrop(newIds, movedId)`
// gets the new order; nothing changes if the row ends where it started.

const EDGE = 64; // px from the pane's top/bottom where auto-scroll kicks in
const MAX_SPEED = 14; // px per frame

export function startDrag(event, { container, rowSelector = '[data-id]', onDrop }) {
  if (event.button != null && event.button !== 0) return;
  const handle = event.currentTarget;
  const row = handle.closest(rowSelector);
  if (!row || !container) return;
  event.preventDefault();
  event.stopPropagation();

  const rows = [...container.querySelectorAll(rowSelector)];
  const from = rows.indexOf(row);
  if (from < 0 || rows.length < 2) return;
  const rects = rows.map((r) => r.getBoundingClientRect());
  const gap = rows.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
  const shift = rects[from].height + gap;
  const scroller = container.closest('.content') || document.scrollingElement;
  const startScroll = scroller.scrollTop;
  const startY = event.clientY;
  let lastY = startY;
  let to = from;
  let raf = 0;
  let done = false;

  row.classList.add('dragging');
  for (const r of rows) r.style.transition = r === row ? 'none' : 'transform 0.15s ease';
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }

  const layout = () => {
    const dy = lastY - startY + (scroller.scrollTop - startScroll);
    row.style.transform = `translateY(${dy}px)`;
    const center = rects[from].top + rects[from].height / 2 + dy;
    let target = 0;
    rows.forEach((r, j) => {
      if (j !== from && center > rects[j].top + rects[j].height / 2) target++;
    });
    to = target;
    rows.forEach((r, j) => {
      if (j === from) return;
      let t = 0;
      if (from < to && j > from && j <= to) t = -shift;
      if (from > to && j >= to && j < from) t = shift;
      r.style.transform = t ? `translateY(${t}px)` : '';
    });
  };

  const tick = () => {
    if (done) return;
    const box = scroller.getBoundingClientRect ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    let v = 0;
    if (lastY < box.top + EDGE) v = -MAX_SPEED * Math.min(1, (box.top + EDGE - lastY) / EDGE);
    else if (lastY > box.bottom - EDGE) v = MAX_SPEED * Math.min(1, (lastY - (box.bottom - EDGE)) / EDGE);
    if (v) scroller.scrollTop += v;
    layout();
    raf = requestAnimationFrame(tick);
  };

  const onMove = (e) => {
    lastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  };

  const finish = (commit) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    if (commit && to !== from) {
      const ids = rows.map((r) => r.dataset.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      onDrop(ids, moved);
    }
    // Let the re-render move the rows before clearing the temporary offsets.
    requestAnimationFrame(() => {
      for (const r of rows) {
        r.style.transition = '';
        r.style.transform = '';
      }
      row.classList.remove('dragging');
    });
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  raf = requestAnimationFrame(tick);
}

/** Props for a grip element: starts the drag and swallows the click so the row isn't opened. */
export function gripProps(getOptions) {
  return {
    onPointerDown: (e) => startDrag(e, getOptions()),
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
