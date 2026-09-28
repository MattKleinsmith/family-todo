// Size the app to the *visible* viewport. On iOS the on-screen keyboard does
// not shrink the layout viewport; it covers the bottom of it, and Safari pans
// the page to reveal the focused input. Pinning #app to the visual viewport's
// height and offset keeps the header put, lets the list scroll inside, and
// keeps the add box above the keyboard.
//
// This runs synchronously in the viewport events rather than a frame later:
// a one-frame lag leaves the app out of place while Safari moves the page,
// which shows as a flash. It also no longer calls scrollTo(0, 0), which
// fought Safari's own pan and caused an extra jump.
export function setupViewport() {
  const vv = window.visualViewport;
  const app = document.getElementById('app');
  if (!vv || !app) return;
  let lastH = -1;
  let lastTop = -1;
  const apply = () => {
    const h = Math.round(vv.height);
    const top = Math.round(vv.offsetTop);
    if (h !== lastH) {
      app.style.height = `${h}px`;
      lastH = h;
    }
    if (top !== lastTop) {
      app.style.transform = top ? `translate3d(0, ${top}px, 0)` : '';
      lastTop = top;
    }
    // While the keyboard is up, the home-indicator strip is hidden behind it.
    document.documentElement.toggleAttribute('data-keyboard', window.innerHeight - vv.height > 120);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => requestAnimationFrame(apply));
  apply();
}
