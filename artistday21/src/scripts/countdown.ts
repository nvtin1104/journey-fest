const pad = (n: number) => String(n).padStart(2, '0');

/** Live countdown to the event start; switches to a message while the event runs and after it ends. */
export function initCountdown() {
  const root = document.querySelector<HTMLElement>('[data-countdown]');
  if (!root) return;
  const start = Date.parse(root.dataset.start ?? '');
  const end = Date.parse(root.dataset.end ?? '');
  const grid = root.querySelector<HTMLElement>('.countdown__grid');
  const msg = root.querySelector<HTMLElement>('[data-countdown-msg]');
  const units = [...root.querySelectorAll<HTMLElement>('[data-unit]')];

  const showMessage = (text: string) => {
    if (grid) grid.hidden = true;
    if (msg) {
      msg.hidden = false;
      msg.textContent = text;
    }
  };

  let timer = 0;
  const tick = () => {
    const now = Date.now();
    if (now >= end) {
      showMessage('Hẹn gặp lại bạn ở Vol.22 – Fever Dream!');
      return window.clearInterval(timer);
    }
    if (now >= start) {
      showMessage('🎉 Artist Day 21 đang diễn ra – đến ngay thôi!');
      return;
    }
    let s = Math.floor((start - now) / 1000);
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    const values: Record<string, string> = { d: pad(d), h: pad(h), m: pad(m), s: pad(s) };
    for (const el of units) {
      const next = values[el.dataset.unit ?? ''] ?? '--';
      if (el.textContent !== next) el.textContent = next;
    }
  };

  tick();
  timer = window.setInterval(tick, 1000);
}
