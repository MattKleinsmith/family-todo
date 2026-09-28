/** A short message at the bottom of the screen, with an Undo button when there's something to undo. */
export function Toast({ toast, onUndo, onDismiss }) {
  if (!toast) return null;
  return (
    <div class="toast" role="status" key={toast.id}>
      <span class="toast-text">{toast.text}</span>
      {toast.undo && (
        <button type="button" class="toast-undo" onClick={onUndo}>Undo</button>
      )}
      <button type="button" class="toast-close" aria-label="Dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}
