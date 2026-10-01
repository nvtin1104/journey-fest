/** Request landscape during the Start button's user gesture, without delaying loading. */
export function prepareMobileLandscape() {
  const mobile = (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 1024)
    || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  if (!mobile) return;
  document.documentElement.classList.add('mobile-session');
  const hint = document.createElement('button');
  hint.className = 'rotate-hint';
  hint.textContent = '↻ Xoay ngang điện thoại để xem rộng hơn';
  const sync = () => {
    hint.hidden = window.innerWidth > window.innerHeight;
  };
  const request = async () => {
    const orientation = screen.orientation as unknown as { lock?: (value: string) => Promise<void> } | undefined;
    if (typeof orientation?.lock !== 'function') { sync(); return; }
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      await orientation.lock('landscape');
    } catch {
      // A portrait fallback keeps the map usable on browsers that deny orientation lock.
    }
    sync();
  };
  hint.addEventListener('click', () => void request());
  document.body.append(hint);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  sync();
  void request();
}
