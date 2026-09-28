// Focus a text field from a tap without letting iOS scroll the page to
// "reveal" it. Safari otherwise pans the page when the keyboard opens, even if
// the field is already clear of it, and the app then moves back: a bounce.
// Taking over the tap and focusing with preventScroll leaves everything still;
// the keyboard just slides up.
export function focusWithoutScrolling(event) {
  const el = event.currentTarget;
  if (document.activeElement === el) return; // already typing: let taps move the caret
  if (event.cancelable) event.preventDefault(); // stops Safari's own focus-and-scroll
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}
