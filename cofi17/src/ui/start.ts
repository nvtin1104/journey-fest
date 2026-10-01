import type { Gender } from '../player/avatar';
import { loadPref, savePref } from './prefs';
import { prepareMobileLandscape } from './orientation';

export interface StartScreen {
  /** Map shell is on screen: enable the Start button. */
  ready: () => void;
  progress: (fraction: number, label: string) => void;
  hide: () => void;
  /** Shows why the map can't open; `detail` explains what the visitor can do. */
  fail: (message: string, detail?: string) => void;
}

/**
 * Binds the start panel that ships in index.html (so it shows before any JS loads):
 * character choice (Nam / Nữ) and the Start button.
 */
export function setupStartScreen(onStart: (gender: Gender) => void): StartScreen {
  const panel = document.getElementById('start')!;
  const button = panel.querySelector<HTMLButtonElement>('#start-btn')!;
  const bar = panel.querySelector<HTMLElement>('.progress > div')!;
  const instruction = panel.querySelector<HTMLElement>('.start-card > p:not(.event-description)');
  const picks = [...panel.querySelectorAll<HTMLButtonElement>('[data-gender]')];

  const savedGender = loadPref('gender');
  const hasSavedGender = savedGender === 'male' || savedGender === 'female';
  let gender: Gender = savedGender === 'female' ? 'female' : 'male';
  const select = (g: Gender) => {
    gender = g;
    for (const p of picks) p.setAttribute('aria-pressed', String(p.dataset.gender === g));
    savePref('gender', gender);
    if (hasSavedGender && instruction) {
      instruction.textContent = `Đang dùng nhân vật ${gender === 'female' ? 'Nữ' : 'Nam'} đã lưu. Bạn có thể đổi nếu muốn.`;
    }
  };
  select(gender);
  for (const p of picks) p.addEventListener('click', () => select(p.dataset.gender as Gender));

  let started = false;
  const start = () => {
    if (started || button.disabled) return;
    started = true;
    prepareMobileLandscape();
    savePref('gender', gender);
    panel.classList.add('loading');
    for (const p of picks) p.disabled = true;
    button.disabled = true;
    onStart(gender);
  };
  button.addEventListener('click', start);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !panel.classList.contains('hide')) start();
  });

  return {
    ready: () => {
      button.disabled = false;
      button.textContent = 'Bắt đầu tham quan';
      panel.classList.add('ready');
      // Returning visitors keep their saved character and resume directly after the map is ready.
      // New visitors still choose a character and explicitly start the tour.
      // Mobile fullscreen/orientation lock needs an explicit user gesture.
      const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
      if (hasSavedGender && !touchDevice) start();
    },
    progress: (fraction, label) => {
      bar.style.width = `${Math.round(fraction * 100)}%`;
      button.textContent = `${label} ${Math.round(fraction * 100)}%`;
    },
    hide: () => panel.classList.add('hide'),
    fail: (message, detail) => {
      button.disabled = true;
      button.textContent = message;
      panel.classList.add('error');
      const note = panel.querySelector<HTMLElement>('.start-error');
      if (note && detail) {
        note.textContent = detail;
        note.hidden = false;
      }
    },
  };
}
