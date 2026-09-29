import { useEffect, useRef } from 'preact/hooks';

const CLOSE_DISTANCE = 110; // px pulled down
const CLOSE_VELOCITY = 0.6; // px per ms

/**
 * Bottom sheet used for all editing. Close it by tapping the backdrop,
 * pressing Escape, or dragging it down (from the handle, or from anywhere
 * once the sheet's own content is scrolled to the top).
 */
export function Sheet({ title, onClose, children }) {
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    /** True if the touch is inside something scrolled away from its top (the sheet itself or an inner list like the icon grid). */
    const inScrolledArea = (target) => {
      for (let n = target; n && n !== el.parentNode; n = n.parentNode) {
        if (n.nodeType !== 1) continue;
        if (n.scrollTop > 0) {
          const oy = getComputedStyle(n).overflowY;
          if (n === el || oy === 'auto' || oy === 'scroll') return true;
        }
        if (n === el) break;
      }
      return false;
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('.grip')) return; // dragging a row to reorder, not the sheet
      const fromHandle = !!e.target.closest('.sheet-handle, .sheet-title');
      // A pull only closes the sheet if everything under the finger is at its
      // top; otherwise the finger is scrolling that area back up.
      if (!fromHandle && inScrolledArea(e.target)) return;
      drag.current = { startY: e.touches[0].clientY, startT: performance.now(), dy: 0, active: false };
    };

    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.touches[0].clientY - d.startY;
      if (!d.active) {
        if (dy < -6) {
          drag.current = null; // they're scrolling up inside the sheet
          return;
        }
        if (dy < 6) return;
        d.active = true;
      }
      d.dy = Math.max(0, dy);
      el.style.transition = 'none';
      el.style.transform = `translateY(${d.dy}px)`;
      if (backdropRef.current) backdropRef.current.style.background = `rgba(0, 0, 0, ${Math.max(0, 0.4 * (1 - d.dy / 400))})`;
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      const d = drag.current;
      drag.current = null;
      if (!d || !d.active) return;
      const velocity = d.dy / Math.max(1, performance.now() - d.startT);
      if (d.dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        el.style.transition = 'transform 0.18s ease-in';
        el.style.transform = 'translateY(110%)';
        if (backdropRef.current) backdropRef.current.style.background = 'rgba(0, 0, 0, 0)';
        setTimeout(onClose, 170);
      } else {
        el.style.transition = 'transform 0.2s ease-out';
        el.style.transform = '';
        if (backdropRef.current) backdropRef.current.style.background = '';
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [onClose]);

  return (
    <div class="backdrop" ref={backdropRef} onClick={onClose}>
      <div class="sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-handle" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
