import { toMapX, toMapY, type Rect } from '../map/coords';
import type { Gender } from '../player/avatar';
import { QUALITY, type QualityLevel, type QualityMode } from '../scene/quality';
import type { ParsedMap, Stand } from '../map/parse';
import { wallRect } from '../map/walls';
import { WALL_T } from '../map/parse';

export interface HudCallbacks {
  onSelectStand: (s: Stand) => void;
  onMinimapClick: (mapX: number, mapY: number) => void;
  onToggleOverview: () => void;
  onGoEntrance: () => void;
  onToggleFocus: () => void;
  onSelectCharacter: (gender: Gender) => void;
  onSelectQuality: (mode: QualityMode) => void;
  onJoystick: (x: number, y: number) => void;
}

const KIND_LABEL: Record<Stand['kind'], string> = {
  booth: 'Gian hàng',
  stall: 'Gian hàng',
  pavilion: 'Khu gian lớn',
  foodcourt: 'Khu ăn uống',
};

/** Accent-insensitive lowercase text for search ("Đồ Cổ" → "do co"). */
export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function searchStands(stands: Stand[], query: string, limit = 8): Stand[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: Array<{ s: Stand; score: number }> = [];
  for (const s of stands) {
    const code = normalize(s.code);
    const codes = code.split('–');
    const name = normalize(s.name);
    let score = -1;
    if (codes.includes(q)) score = 0;
    else if (code.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (s.groups.some((g) => normalize(g.name).includes(q))) score = 4;
    if (score >= 0) scored.push({ s, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.s.code.localeCompare(b.s.code, 'vi', { numeric: true }))
    .slice(0, limit)
    .map((x) => x.s);
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class Hud {
  private card: HTMLElement;
  private currentCard: string | null = null;
  private minimap: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement;
  private mmScale = 1;
  private overviewBtn: HTMLButtonElement;
  private focusBtn: HTMLButtonElement;
  private settings: HTMLElement;
  private genderBtns = new Map<Gender, HTMLButtonElement>();
  private qualityBtns = new Map<QualityMode, HTMLButtonElement>();
  private qualityNote: HTMLElement;
  /** Touch screens get short labels without keyboard hints. */
  private touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  private help: HTMLElement;

  constructor(root: HTMLElement, private map: ParsedMap, private cb: HudCallbacks) {
    // Brand + search.
    const top = el('div', 'hud-top');
    const brand = el('div', 'brand');
    brand.innerHTML = '<span class="dot"></span><b>Color Fiesta</b><span>Bản đồ 3D</span>';
    const search = el('div', 'search');
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Tìm gian hàng: mã (A15) hoặc tên…';
    input.setAttribute('aria-label', 'Tìm gian hàng');
    const results = el('ul', 'results');
    search.append(input, results);
    top.append(brand, search);

    const pick = (s: Stand) => {
      results.innerHTML = '';
      input.value = '';
      input.blur();
      this.cb.onSelectStand(s);
    };
    input.addEventListener('input', () => {
      results.innerHTML = '';
      for (const s of searchStands(this.map.stands, input.value)) {
        const li = el('li');
        const chip = el('span', 'chip', s.code || '•');
        chip.style.background = s.color;
        li.append(chip, el('span', 'name', s.name || s.code));
        li.addEventListener('click', () => pick(s));
        results.append(li);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = searchStands(this.map.stands, input.value, 1)[0];
        if (first) pick(first);
      } else if (e.key === 'Escape') {
        input.value = '';
        results.innerHTML = '';
        input.blur();
      }
    });

    // Minimap and quick buttons.
    const side = el('div', 'hud-side');
    this.minimap = el('canvas', 'minimap');
    this.minimap.title = 'Bấm để dịch chuyển tới điểm này';
    this.minimapBase = document.createElement('canvas');
    const buttons = el('div', 'buttons');
    this.overviewBtn = el('button', undefined, this.label('Toàn cảnh', 'M'));
    this.overviewBtn.addEventListener('click', () => this.cb.onToggleOverview());
    const entrance = el('button', undefined, 'Lối vào');
    entrance.title = 'Về lối vào khu Check-in';
    entrance.addEventListener('click', () => this.cb.onGoEntrance());
    this.focusBtn = el('button', undefined, this.label('Theo hướng đi', 'F'));
    this.focusBtn.title = 'Camera luôn nhìn theo hướng nhân vật đi';
    this.focusBtn.addEventListener('click', () => this.cb.onToggleFocus());
    const gear = el('button', 'icon', '⚙');
    gear.title = 'Cài đặt: nhân vật, chất lượng đồ hoạ';
    gear.setAttribute('aria-label', 'Cài đặt');
    buttons.append(this.overviewBtn, entrance, this.focusBtn, gear);

    // Settings popover: character and graphics quality.
    this.settings = el('div', 'settings');
    this.settings.hidden = true;
    const row = (title: string) => {
      const r = el('div', 'settings-row');
      r.append(el('div', 'card-sub', title));
      const group = el('div', 'seg');
      r.append(group);
      this.settings.append(r);
      return group;
    };
    const genders = row('Nhân vật');
    for (const [g, text] of [['male', 'Nam'], ['female', 'Nữ']] as const) {
      const b = el('button', undefined, text);
      b.addEventListener('click', () => this.cb.onSelectCharacter(g));
      this.genderBtns.set(g, b);
      genders.append(b);
    }
    const qualities = row('Chất lượng đồ hoạ');
    for (const m of ['auto', 'high', 'medium', 'low'] as const) {
      const b = el('button', undefined, m === 'auto' ? 'Tự động' : QUALITY[m].label);
      b.addEventListener('click', () => this.cb.onSelectQuality(m));
      this.qualityBtns.set(m, b);
      qualities.append(b);
    }
    this.qualityNote = el('div', 'card-sub');
    this.settings.append(this.qualityNote);
    gear.addEventListener('click', () => {
      this.settings.hidden = !this.settings.hidden;
      gear.classList.toggle('active', !this.settings.hidden);
    });
    side.append(this.minimap, buttons, this.settings);
    this.minimap.addEventListener('click', (e) => {
      const r = this.minimap.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.minimap.width;
      const py = ((e.clientY - r.top) / r.height) * this.minimap.height;
      this.cb.onMinimapClick(this.map.bounds.x + px / this.mmScale, this.map.bounds.y + py / this.mmScale);
    });

    // Booth info card.
    this.card = el('div', 'card');

    // Controls help.
    this.help = el('div', 'help');
    this.renderHelp(false);

    root.append(top, side, this.card, this.help, this.buildJoystick());
    this.drawMinimapBase();
  }

  private renderHelp(focus: boolean) {
    const move = focus ? 'W / S: đi tới, lùi · A / D: xoay' : 'WASD / ← ↑ → ↓: đi';
    this.help.innerHTML =
      `<b>Điều khiển</b><br>${move} · Shift: chạy<br>Kéo chuột: xoay · Cuộn: zoom<br>Bấm lên sàn: đi tới đó · M: toàn cảnh · F: camera theo hướng đi`;
  }

  setFocus(on: boolean) {
    this.focusBtn.classList.toggle('active', on);
    this.renderHelp(on);
  }

  /** Button text, with the keyboard shortcut only on devices that have a keyboard. */
  private label(text: string, key: string) {
    return this.touch ? text : `${text} (${key})`;
  }

  setGender(gender: Gender) {
    for (const [g, b] of this.genderBtns) b.classList.toggle('active', g === gender);
  }

  setQuality(mode: QualityMode, level: QualityLevel) {
    for (const [m, b] of this.qualityBtns) b.classList.toggle('active', m === mode);
    this.qualityNote.textContent =
      mode === 'auto' ? `Đang dùng: ${QUALITY[level].label} (tự hạ khi máy chạy chậm)` : 'Mức cố định, không tự điều chỉnh';
  }

  setOverview(on: boolean) {
    this.overviewBtn.classList.toggle('active', on);
    this.overviewBtn.textContent = on ? this.label('Quay lại', 'M') : this.label('Toàn cảnh', 'M');
  }

  showStand(s: Stand | null) {
    const id = s?.id ?? null;
    if (id === this.currentCard) return;
    this.currentCard = id;
    if (!s) {
      this.card.classList.remove('show');
      return;
    }
    this.card.innerHTML = '';
    const head = el('div', 'card-head');
    if (s.code) {
      const chip = el('span', 'chip big', s.code);
      chip.style.background = s.color;
      head.append(chip);
    }
    const titles = el('div');
    titles.append(el('div', 'card-title', s.name || s.code), el('div', 'card-sub', KIND_LABEL[s.kind]));
    head.append(titles);
    this.card.append(head);
    if (s.groups.length) {
      const g = el('div', 'groups');
      g.append(el('div', 'card-sub', 'Stamp rally'));
      for (const grp of s.groups) {
        const tag = el('span', 'tag', grp.name);
        tag.style.setProperty('--c', grp.color);
        g.append(tag);
      }
      this.card.append(g);
    }
    this.card.classList.add('show');
  }

  private buildJoystick() {
    const pad = el('div', 'joystick');
    const knob = el('div', 'knob');
    pad.append(knob);
    let active: number | null = null;
    const R = 48;
    const set = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      let x = e.clientX - (r.left + r.width / 2);
      let y = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(x, y);
      if (len > R) {
        x = (x / len) * R;
        y = (y / len) * R;
      }
      knob.style.transform = `translate(${x}px, ${y}px)`;
      this.cb.onJoystick(x / R, -y / R);
    };
    pad.addEventListener('pointerdown', (e) => {
      active = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      set(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === active && set(e));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = null;
      knob.style.transform = '';
      this.cb.onJoystick(0, 0);
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    return pad;
  }

  private drawMinimapBase() {
    const b = this.map.bounds;
    const size = 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.mmScale = (size * dpr) / Math.max(b.w, b.h);
    const w = Math.round(b.w * this.mmScale);
    const h = Math.round(b.h * this.mmScale);
    for (const c of [this.minimap, this.minimapBase]) {
      c.width = w;
      c.height = h;
    }
    this.minimap.style.width = `${w / dpr}px`;
    this.minimap.style.height = `${h / dpr}px`;

    const ctx = this.minimapBase.getContext('2d')!;
    const R = (r: Rect, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect((r.x - b.x) * this.mmScale, (r.y - b.y) * this.mmScale, Math.max(1, r.w * this.mmScale), Math.max(1, r.h * this.mmScale));
    };
    ctx.fillStyle = '#d4ecc9';
    ctx.fillRect(0, 0, w, h);
    for (const g of this.map.grounds) R(g.rect, g.kind === 'road' ? '#8b8b96' : '#b9c9bd');
    for (const hall of this.map.halls) R(hall, hall.sealed ? '#d9cfee' : '#f7f1fe');
    for (const z of this.map.zones) R(z.rect, z.color);
    for (const r of this.map.rooms) R(r.rect, r.color);
    for (const s of this.map.stands) R(s.rect, s.kind === 'foodcourt' ? '#fff2a8' : s.color);
    for (const s of this.map.stages) R(s.rect, '#5d5a78');
    for (const wall of this.map.walls) R(wallRect(wall, WALL_T * 1.5), '#9d8fc4');
    for (const g of this.map.gates) R(g, '#38528f');
    for (const p of this.map.signParts) R(p, '#4caf50');
  }

  /** Redraws the minimap with the visitor marker. World position in metres, heading in radians. */
  drawMinimap(wx: number, wz: number, heading: number) {
    const ctx = this.minimap.getContext('2d')!;
    ctx.drawImage(this.minimapBase, 0, 0);
    const b = this.map.bounds;
    const x = (toMapX(wx) - b.x) * this.mmScale;
    const y = (toMapY(wz) - b.y) * this.mmScale;
    const s = 7 * (this.minimap.width / 240);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s * 0.9, s);
    ctx.lineTo(0, s * 0.45);
    ctx.lineTo(-s * 0.9, s);
    ctx.closePath();
    ctx.fillStyle = '#ff4f9a';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.35;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}
