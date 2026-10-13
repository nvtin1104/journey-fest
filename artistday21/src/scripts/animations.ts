import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Scroll-driven motion. Everything here is progressive enhancement: the HTML is fully visible without it,
 * and main.ts only loads this module when the visitor has not asked for reduced motion.
 */
export function initAnimations() {
  gsap.registerPlugin(ScrollTrigger);

  // Smooth wheel scrolling on mouse/trackpad devices only; touch keeps native momentum scrolling.
  if (matchMedia('(pointer: fine)').matches) {
    const lenis = new Lenis({ lerp: 0.11, anchors: { offset: -84 } });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  parallax();
  heroScroll();
  reveals();
  staggers();
  wordReveal();
  sprout();
  counters();

  // Fonts and lazy images change layout heights; re-measure trigger positions once they settle.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

/** Avoid fighting CSS transitions (buttons, cards) while GSAP drives the same properties. */
const pauseTransition = (els: Element[]) => els.forEach((el) => ((el as HTMLElement).style.transition = 'none'));
const restoreTransition = (els: Element[]) => els.forEach((el) => ((el as HTMLElement).style.transition = ''));

function parallax() {
  gsap.utils.toArray<HTMLElement>('[data-speed]').forEach((el) => {
    const speed = Number(el.dataset.speed) || 0.3;
    const section = el.closest('section') ?? el;
    const inHero = section.id === 'top';
    gsap.to(el, {
      y: inHero ? speed * 260 : -speed * 220,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: inHero ? 'top top' : 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });
}

function heroScroll() {
  const hero = document.getElementById('top');
  if (!hero) return;
  const st = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
  gsap.to('.hero__art', { y: 90, rotate: 5, ease: 'none', scrollTrigger: st });
  gsap.to('.hero__copy', { y: -50, opacity: 0.35, ease: 'none', scrollTrigger: st });
}

function reveals() {
  const from: Record<string, gsap.TweenVars> = {
    '': { y: 44 },
    left: { x: -70, rotate: -4 },
    right: { x: 70, rotate: 3 },
    scale: { scale: 0.86, y: 30 },
    swing: { rotate: -7, y: -30, transformOrigin: '50% -20px' },
  };
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      ...(from[el.dataset.reveal ?? ''] ?? from['']),
      opacity: 0,
      duration: 0.9,
      ease: el.dataset.reveal === 'swing' ? 'elastic.out(1, 0.55)' : 'back.out(1.5)',
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onStart: () => pauseTransition([el]),
      onComplete: () => restoreTransition([el]),
    });
  });
}

function staggers() {
  document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((group) => {
    const items = [...group.children] as HTMLElement[];
    gsap.set(items, { y: 56, opacity: 0, rotate: -1.5 });
    pauseTransition(items);
    ScrollTrigger.batch(items, {
      start: 'top 92%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          y: 0,
          opacity: 1,
          rotate: 0,
          duration: 0.8,
          stagger: 0.09,
          ease: 'back.out(1.6)',
          clearProps: 'transform,opacity',
          onComplete: () => restoreTransition(batch),
        }),
    });
  });
}

/** Story paragraphs light up word by word as they scroll through the viewport. */
function wordReveal() {
  document.querySelectorAll<HTMLElement>('[data-words]').forEach((p) => {
    const words = (p.textContent ?? '').trim().split(/\s+/);
    p.setAttribute('aria-label', words.join(' '));
    p.replaceChildren(
      ...words.flatMap((w, i) => {
        const span = Object.assign(document.createElement('span'), { className: 'w', textContent: w });
        span.setAttribute('aria-hidden', 'true');
        return i ? [' ', span] : [span];
      }),
    );
    gsap.fromTo(
      p.querySelectorAll('.w'),
      { opacity: 0.16 },
      {
        opacity: 1,
        stagger: 0.05,
        ease: 'none',
        scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 52%', scrub: 0.6 },
      },
    );
  });
}

/** The sprout grows out of the rubble: stem draws, leaves unfurl, flower blooms. */
function sprout() {
  const svg = document.querySelector<SVGSVGElement>('[data-sprout]');
  const stem = svg?.querySelector<SVGPathElement>('[data-draw]');
  if (!svg || !stem) return;
  const len = stem.getTotalLength();
  gsap.set(stem, { strokeDasharray: len, strokeDashoffset: len });
  // Leaves unfurl from the point where they join the stem.
  svg.querySelectorAll<SVGPathElement>('[data-leaf]').forEach((leaf) =>
    gsap.set(leaf, { scale: 0, svgOrigin: leaf.dataset.origin ?? '160 300' }),
  );
  gsap.set('[data-bloom]', { scale: 0, rotate: -120, transformOrigin: '50% 50%' });

  gsap
    .timeline({
      scrollTrigger: { trigger: svg, start: 'top 80%', end: 'bottom 45%', scrub: 0.8 },
    })
    .to(stem, { strokeDashoffset: 0, duration: 1, ease: 'none' })
    .to('[data-leaf]', { scale: 1, duration: 0.3, stagger: 0.18, ease: 'back.out(2)' }, 0.15)
    .to('[data-bloom]', { scale: 1, rotate: 0, duration: 0.35, ease: 'back.out(2.2)' }, 0.85);
}

function counters() {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!target) return;
    const obj = { v: 0 };
    el.textContent = '0';
    gsap.to(obj, {
      v: target,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => (el.textContent = String(Math.round(obj.v))),
    });
  });
}
