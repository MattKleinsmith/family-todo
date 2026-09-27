// Size the app to the *visible* viewport. On iOS the on-screen keyboard does
// not shrink the layout viewport; it covers the bottom of it and Safari then
// scrolls the page to reveal the focused input, which drags everything else
// off screen. By pinning #app to the visual viewport's height and offset, the
// header stays put, the list scrolls inside, and the add bar sits right on
// top of the keyboard.
export function setupViewport() {
  const vv = window.visualViewport;
  const app = document.getElementById('app');
  if (!vv || !app) return;
  let raf = 0;
  const apply = () => {
    raf = 0;
    app.style.height = `${Math.round(vv.height)}px`;
    app.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
    if (window.scrollY) window.scrollTo(0, 0);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
}
