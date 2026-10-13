/** Navbar state, mobile menu sheet, mobile action bar, Google Maps facade and share button. */

export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const sheet = document.querySelector<HTMLElement>('[data-menu]');
  const bar = document.querySelector<HTMLElement>('[data-bar]');
  const hero = document.getElementById('top');
  if (!nav) return;

  const setOpen = (open: boolean) => {
    if (!toggle || !sheet) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only')!.textContent = open ? 'Đóng menu' : 'Mở menu';
    sheet.hidden = !open;
    nav.classList.toggle('is-open', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
  };

  toggle?.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  sheet?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle?.focus();
    }
  });
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => e.matches && setOpen(false));

  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    // Hide the bar while scrolling down through content, bring it back on scroll up.
    nav.classList.toggle('is-hidden', y > lastY && y > 480);
    lastY = y;
    const heroBottom = hero ? hero.offsetTop + hero.offsetHeight * 0.6 : 400;
    bar?.classList.toggle('is-visible', y > heroBottom);
    ticking = false;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

export function initMap() {
  const map = document.querySelector<HTMLElement>('[data-map]');
  const btn = map?.querySelector<HTMLButtonElement>('[data-map-load]');
  if (!map || !btn) return;
  btn.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = map.dataset.map!;
    iframe.title = 'Bản đồ AEON MALL Tân Phú Celadon';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.allowFullscreen = true;
    map.querySelector('.map__facade')?.remove();
    map.append(iframe);
  });
}

export function initShare() {
  const btn = document.querySelector<HTMLButtonElement>('[data-share]');
  const toast = document.querySelector<HTMLElement>('[data-share-toast]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const data = {
      title: document.title,
      text: 'Đi Artist Day 21: Wasteland cùng mình nhé! 08/11/2026 tại AEON MALL Tân Phú Celadon – miễn phí vào cửa.',
      url: location.href.split('#')[0],
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      if (toast) toast.textContent = 'Đã sao chép link – dán gửi hội bạn thôi!';
    } catch {
      /* user cancelled the share sheet */
    }
  });
}
