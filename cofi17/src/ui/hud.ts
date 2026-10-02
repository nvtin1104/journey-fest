import { toMapX, toMapY, type Rect } from '../map/coords';

import type { Gender } from '../player/avatar';
import { SPAWN } from '../config';
import { QUALITY, type QualityLevel, type QualityMode } from '../scene/quality';
import { applyAvailableUpdate, checkForUpdate, installer, installHintText, isStandalone, onUpdateAvailable, prepareOffline } from './pwa';
import type { ParsedMap, Stand } from '../map/parse';
import { wallRect } from '../map/walls';
import { WALL_T } from '../map/parse';

import { createBoothDetails } from '../booth/C17-C18/details';
import { boothConfig } from '../booth/C17-C18/config';
import { createBoothDetails as createA9BoothDetails } from '../booth/A9/details';
import { boothConfig as a9BoothConfig } from '../booth/A9/config';
import {
  makeIcon,
  Compass,
  MapPin,
  X,
  Eye,
  User,
  DoorOpen,
  Download,
  Sparkles,

  Settings,
  Maximize,
  Minimize,
  Route,
} from './icons';

export interface HudCallbacks {
  onSelectStand: (s: Stand) => void;
  onMinimapClick: (mapX: number, mapY: number) => void;
  onToggleOverview: () => void;
  onGoEntrance: () => void;
  onSelectCharacter: (gender: Gender) => void;
  onSelectQuality: (mode: QualityMode) => void;
  onJoystick: (x: number, y: number) => void;

  onStartNavigation: (s: Stand) => void;
  onCancelNavigation: () => void;
  onBeginWalking: () => void;
  onTeleportToStand: (s: Stand) => void;
  onSetCurrentLocation: (s: Stand) => void;
  onSetOriginPoint: (mapX: number, mapY: number) => boolean;
  onToggleCameraTarget: () => void;
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
  const q = normalize(query).replace(/^gian(?:\s+hang)?\s+/i, '').replace(/^([a-z]+)\s*0*(\d+)$/, '$1$2');
  if (!q) return [];
  const scored: Array<{ s: Stand; score: number }> = [];
  for (const s of stands) {
    const code = normalize(s.code);
    const codes = code.split(/[–—-]/).map((c) => c.trim().replace(/^([a-z]+)0*(\d+)$/, '$1$2'));
    const range = codes.map((c) => /^([a-z]+)(\d+)$/.exec(c));
    const requested = /^([a-z]+)(\d+)$/.exec(q);
    const inRange = requested && range.length === 2 && range[0] && range[1]
      && requested[1] === range[0][1] && requested[1] === range[1][1]
      && Number(requested[2]) >= Number(range[0][2]) && Number(requested[2]) <= Number(range[1][2]);
    const name = normalize(s.name);
    let score = -1;
    if (codes.includes(q) || inRange) score = 0;
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
  private currentCardStand: Stand | null = null;
  private minimap: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement;
  private mmScale = 1;
  private overviewBtn: HTMLButtonElement;
  private mapModal: HTMLDialogElement;
  private expandedMap: HTMLCanvasElement;
  private fullscreenBtn: HTMLButtonElement;
  private settings: HTMLElement;
  private genderBtns = new Map<Gender, HTMLButtonElement>();
  private qualityBtns = new Map<QualityMode, HTMLButtonElement>();
  private qualityNote: HTMLElement;
  private help: HTMLElement;

  // Mobile stand pill (thay thế popup che màn hình trên mobile)
  private mobileStandPill: HTMLElement;
  private currentNearbyStand: Stand | null = null;

  // Thanh chỉ đường ở dưới (Bottom Navigation Panel)
  private navBottomPanel: HTMLElement;
  private itemFocused = false;
  private currentOriginLabel = 'Vị trí hiện tại';
  private activeNavInfo: { destination: Stand; distance: number; isInspecting: boolean } | null = null;
  private currentCardNavState = false;

  // Location Picker Modal
  private locationModal: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;

  get isMobile(): boolean {
    return window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 768;
  }

  constructor(root: HTMLElement, private map: ParsedMap, private cb: HudCallbacks) {
    // Brand + search.
    const top = el('div', 'hud-top');
    const brand = el('div', 'brand');
    brand.innerHTML = '<img class="site-logo" src="/logo.svg" alt="Color Fiesta Wonderland" /><span>Bản đồ 3D</span>';
    const search = el('div', 'search');
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Tìm mã hoặc tên gian…';
    input.setAttribute('aria-label', 'Tìm gian hàng');
    const results = el('ul', 'results');
    search.append(input, results);
    const searchMapBar = el('div', 'search-map-bar');
    searchMapBar.append(search);
    top.append(brand, searchMapBar);

    const pick = (s: Stand) => {
      results.innerHTML = '';
      input.value = '';
      input.blur();
      this.cb.onSelectStand(s);
    };
    input.addEventListener('input', () => {
      results.innerHTML = '';
      for (const s of searchStands(this.map.stands, input.value, 6)) {
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
    this.minimap.title = 'Bấm để chỉ đường đến gian hàng hoặc đi tới điểm này';
    this.minimapBase = document.createElement('canvas');

    const buttons = el('div', 'buttons');

    // Nút Toàn cảnh
    this.overviewBtn = el('button', undefined);
    this.updateOverviewBtnText(false);
    this.overviewBtn.addEventListener('click', () => this.cb.onToggleOverview());

    // Nút Về lối vào
    const entrance = el('button', undefined);
    entrance.append(makeIcon(DoorOpen, 14), el('span', 'button-label', 'Lối vào'));
    entrance.title = 'Về lối vào khu Check-in';
    entrance.setAttribute('aria-label', entrance.title);
    entrance.addEventListener('click', () => {
      this.currentOriginLabel = 'Lối vào Check-in';
      this.cb.onGoEntrance();
    });

    // Nút phóng to / thu nhỏ màn hình.
    this.fullscreenBtn = el('button', undefined);
    this.updateFullscreenButton();
    this.fullscreenBtn.addEventListener('click', () => void this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenButton();
      window.dispatchEvent(new Event('resize'));
    });

    // Nút Cài đặt
    const gear = el('button', 'icon');
    gear.append(makeIcon(Settings, 15));
    gear.title = 'Cài đặt: nhân vật, chất lượng đồ hoạ';
    gear.setAttribute('aria-label', 'Cài đặt');

    let appDialog: HTMLDialogElement | null = null;
    let updateAction: HTMLButtonElement | null = null;
    let updateStatus: HTMLElement | null = null;
    const offlineAvailable = import.meta.env.PROD && 'serviceWorker' in navigator;
    const downloadMenuBtn = el('button', 'icon download-menu-btn');
    const updateDot = el('span', 'update-dot');
    updateDot.hidden = true;
    downloadMenuBtn.append(makeIcon(Download, 16), updateDot);
    downloadMenuBtn.title = 'Tải offline, ghim ứng dụng hoặc cập nhật';
    downloadMenuBtn.setAttribute('aria-label', downloadMenuBtn.title);
    downloadMenuBtn.hidden = !offlineAvailable;
    downloadMenuBtn.addEventListener('click', () => appDialog?.showModal());
    onUpdateAvailable((available) => {
      updateDot.hidden = !available;
      if (updateAction) updateAction.hidden = !available;
      if (updateStatus) updateStatus.textContent = available ? 'Có bản cập nhật mới.' : 'Chưa có bản cập nhật mới.';
    });

    buttons.append(this.overviewBtn, entrance, this.fullscreenBtn, gear, downloadMenuBtn);

    // Settings popover: character and graphics quality.
    this.settings = el('div', 'settings');
    this.settings.hidden = true;
    const settingsHead = el('div', 'settings-head');
    const settingsClose = el('button', 'card-close');
    settingsClose.type = 'button';
    settingsClose.title = 'Đóng cài đặt';
    settingsClose.setAttribute('aria-label', 'Đóng cài đặt');
    settingsClose.append(makeIcon(X, 18));
    settingsClose.addEventListener('click', (event) => {
      event.stopPropagation();
      this.settings.hidden = true;
      gear.classList.remove('active');
      gear.focus();
    });
    settingsHead.append(el('div', 'card-title', 'Cài đặt'), settingsClose);
    this.settings.append(settingsHead);
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
    appDialog = el('dialog', 'offline-guide');
    const guideTitle = el('h2', undefined, 'Lưu bản đồ');
    guideTitle.id = 'offline-guide-title';
    appDialog.setAttribute('aria-labelledby', guideTitle.id);
    const guideContent = el('div', 'offline-guide-content');
    const pinHelp = el('p', 'offline-pin-help');
    const hint = installHintText();
    if (isStandalone()) {
      pinHelp.textContent = 'Ứng dụng đã được ghim vào màn hình chính.';
    } else if (hint === 'in-app') {
      pinHelp.textContent = 'Để ghim ứng dụng, mở trang này bằng Safari hoặc Chrome. iPhone: Chia sẻ → Thêm vào MH chính. Android: menu ⋮ → Cài đặt ứng dụng.';
    } else if (hint === 'ios' || /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      pinHelp.textContent = 'Để ghim trên iPhone/iPad: mở bằng Safari → Chia sẻ → Thêm vào MH chính → Thêm.';
    } else if (/Android/i.test(navigator.userAgent)) {
      pinHelp.textContent = 'Để ghim trên Android: Chrome → menu ⋮ → Cài đặt ứng dụng (hoặc Thêm vào màn hình chính) → Cài đặt.';
    } else {
      pinHelp.textContent = 'Để ghim ứng dụng: mở menu trình duyệt → Cài đặt ứng dụng/Thêm vào màn hình chính. Trên iPhone, dùng Safari → Chia sẻ → Thêm vào MH chính.';
    }
    const pinSection = el('section', 'download-option');
    pinSection.append(el('h3', undefined, 'Ghim vào màn hình chính'), pinHelp);
    const pinBtn = el('button', 'settings-install offline-pin-btn', installer.available ? 'Cài ứng dụng' : 'Đã hiểu');
    pinBtn.hidden = isStandalone();
    pinSection.append(pinBtn);

    const offlineSection = el('section', 'download-option');
    offlineSection.append(
      el('h3', undefined, 'Lưu để dùng khi mất mạng'),
      el('p', undefined, 'Ghim chỉ tạo biểu tượng, không tự lưu dữ liệu. Bạn có thể tải trước hoặc sau khi ghim: khi còn mạng, nhấn nút tải và chờ báo “Đã lưu” trước khi dùng offline. Gói khoảng 8 MB không tự tải nền.'),
    );
    const guideActions = el('div', 'offline-guide-actions');
    const downloadNow = el('button', 'settings-install', 'Tải xuống dùng offline');
    const downloadStatus = el('p', 'download-status');
    offlineSection.append(downloadNow, downloadStatus);
    updateStatus = el('p', 'download-status', 'Chưa kiểm tra bản cập nhật.');
    const updateSection = el('section', 'download-option');
    updateSection.append(el('h3', undefined, 'Cập nhật ứng dụng'), updateStatus);
    const checkUpdate = el('button', 'settings-install', 'Kiểm tra cập nhật');
    updateAction = el('button', 'settings-install', 'Cập nhật ngay');
    updateAction.hidden = true;
    checkUpdate.addEventListener('click', async () => {
      checkUpdate.disabled = true;
      checkUpdate.textContent = 'Đang kiểm tra…';
      try {
        const available = await checkForUpdate();
        updateStatus!.textContent = available ? 'Có bản cập nhật mới.' : 'Chưa có bản cập nhật mới.';
      } finally {
        checkUpdate.disabled = false;
        checkUpdate.textContent = 'Kiểm tra lại';
      }
    });
    updateAction.addEventListener('click', () => {
      appDialog?.close();
      applyAvailableUpdate();
    });
    downloadNow.addEventListener('click', async () => {
      downloadNow.disabled = true;
      downloadNow.textContent = 'Đang tải dữ liệu…';
      downloadStatus.textContent = 'Đang chuẩn bị…';
      try {
        const saved = await prepareOffline((fraction) => {
          const percent = Math.round(fraction * 100);
          downloadNow.textContent = `Đang tải ${percent}%`;
          downloadStatus.textContent = `Đã lưu ${percent}% gói offline.`;
        });
        downloadStatus.textContent = saved
          ? 'Đã lưu bản đồ để dùng khi không có mạng.'
          : 'Tải chưa xong. Kiểm tra kết nối rồi thử lại.';
      } finally {
        downloadNow.disabled = false;
        downloadNow.textContent = 'Tải xuống dùng offline';
      }
    });
    pinBtn.addEventListener('click', async () => {
      if (installer.available) {
        appDialog?.close();
        await installer.prompt();
      } else {
        appDialog?.close();
      }
    });
    const closeGuide = el('button', 'offline-guide-close', 'Đóng');
    closeGuide.addEventListener('click', () => appDialog?.close());
    guideActions.append(checkUpdate, updateAction, closeGuide);
    guideContent.append(pinSection, offlineSection, updateSection);
    appDialog.append(guideTitle, guideContent, guideActions);
    appDialog.addEventListener('click', (event) => {
      if (event.target === appDialog) appDialog.close();
    });
    document.getElementById('hud')?.append(appDialog);
    installer.onChange(() => {
      pinBtn.textContent = installer.available ? 'Cài ứng dụng' : 'Đã hiểu';
      pinBtn.hidden = isStandalone();
    });
    gear.addEventListener('click', () => {
      this.settings.hidden = !this.settings.hidden;
      gear.classList.toggle('active', !this.settings.hidden);
    });
    side.append(this.minimap, buttons, this.settings);

    const mapButton = el('button', 'map-launch');
    mapButton.setAttribute('aria-label', 'Mở bản đồ toàn khu');
    mapButton.append(this.minimap, el('span', undefined, 'Mở bản đồ'));
    side.prepend(mapButton);
    this.mapModal = el('dialog', 'map-modal');
    const mapHeader = el('div', 'loc-header');
    const mapTitle = el('h2', undefined, 'Bản đồ toàn khu');
    mapTitle.id = 'map-modal-title';
    this.mapModal.setAttribute('aria-labelledby', mapTitle.id);
    const closeMap = el('button', 'map-close', 'Đóng');
    closeMap.addEventListener('click', () => this.mapModal.close());
    mapHeader.append(mapTitle, closeMap);
    const viewport = el('div', 'map-scroll');
    const surface = el('div', 'map-surface');
    this.expandedMap = el('canvas', 'expanded-map');
    surface.append(this.expandedMap);
    const selection = el('div', 'map-selection');
    const selectedLabel = el('span', undefined, 'Chọn gian hàng trên bản đồ');
    const navigate = el('button', 'map-navigate', 'Chỉ đường');
    navigate.disabled = true;
    let selected: Stand | null = null;
    navigate.addEventListener('click', () => {
      if (!selected) return;
      this.mapModal.close();
      this.cb.onStartNavigation(selected);
      this.hideStand();
    });
    selection.append(selectedLabel, navigate);
    const bounds = this.map.bounds;
    const standButtons: HTMLButtonElement[] = [];
    for (const stand of this.map.stands) {
      const button = el('button', 'map-stand', stand.code || stand.name);
      const r = stand.rect;
      button.style.left = `${100 * (r.x - bounds.x) / bounds.w}%`;
      button.style.top = `${100 * (r.y - bounds.y) / bounds.h}%`;
      button.style.width = `${100 * r.w / bounds.w}%`;
      button.style.height = `${100 * r.h / bounds.h}%`;
      button.title = `${stand.code} ${stand.name}`;
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => {
        if (dragged) return;
        selected = stand;
        selectedLabel.textContent = button.title;
        navigate.disabled = false;
        standButtons.forEach((b) => b.classList.toggle('selected', b === button));
      });
      standButtons.push(button);
      surface.append(button);
    }
    let zoom = 1, panX = 0, panY = 0, fit = 1, dragged = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let gestureDistance = 0;
    let gestureCenter: { x: number; y: number } | null = null;
    let renderFrame = 0;
    const render = () => {
      const width = bounds.w * fit * zoom, height = bounds.h * fit * zoom;
      panX = Math.max(-Math.max(0, (width - viewport.clientWidth) / 2), Math.min(Math.max(0, (width - viewport.clientWidth) / 2), panX));
      panY = Math.max(-Math.max(0, (height - viewport.clientHeight) / 2), Math.min(Math.max(0, (height - viewport.clientHeight) / 2), panY));
      surface.style.width = `${bounds.w * fit}px`;
      surface.style.height = `${bounds.h * fit}px`;
      surface.style.transform = `translate3d(${(viewport.clientWidth - width) / 2 + panX}px, ${(viewport.clientHeight - height) / 2 + panY}px, 0) scale(${zoom})`;
      standButtons.forEach((button) => {
        const width = parseFloat(button.style.width) / 100 * bounds.w * fit * zoom;
        const height = parseFloat(button.style.height) / 100 * bounds.h * fit * zoom;
        button.style.fontSize = `${10 / zoom}px`;
        button.classList.toggle('label-visible', width >= button.textContent!.length * 6 + 4 && height >= 14);
      });
    };
    const scheduleRender = () => {
      if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
    };
    const reset = () => {
      fit = Math.min((viewport.clientWidth - 24) / bounds.w, (viewport.clientHeight - 24) / bounds.h);
      zoom = 1; panX = panY = 0; render();
    };
    const changeZoom = (value: number, anchor?: { x: number; y: number }) => {
      const next = Math.max(1, Math.min(8, value));
      if (anchor) {
        const ratio = next / zoom;
        panX = anchor.x - viewport.clientWidth / 2 - (anchor.x - viewport.clientWidth / 2 - panX) * ratio;
        panY = anchor.y - viewport.clientHeight / 2 - (anchor.y - viewport.clientHeight / 2 - panY) * ratio;
      }
      zoom = next;
      scheduleRender();
    };
    const pinch = () => {
      const [a, b] = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top } };
    };
    const tools = el('div', 'map-tools');
    for (const [label, action] of [['+', () => changeZoom(zoom * 1.4)], ['−', () => changeZoom(zoom / 1.4)], ['Toàn khu', reset]] as const) {
      const button = el('button', undefined, label);
      button.setAttribute('aria-label', label === '+' ? 'Phóng to' : label === '−' ? 'Thu nhỏ' : label);
      button.addEventListener('click', action);
      tools.append(button);
    }
    viewport.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.map-tools')) return;
      if (pointers.size === 0) dragged = false;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        dragged = true;
        const gesture = pinch();
        gestureDistance = gesture.distance;
        gestureCenter = gesture.center;
      }
    });
    viewport.addEventListener('pointermove', (e) => {
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
      if (!dragged && Math.hypot(dx, dy) < 4 && pointers.size === 1) return;
      dragged = true;
      viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const gesture = pinch();
        if (gestureDistance > 0 && gestureCenter) {
          changeZoom(zoom * gesture.distance / gestureDistance, gestureCenter);
          panX += gesture.center.x - gestureCenter.x;
          panY += gesture.center.y - gestureCenter.y;
        }
        gestureDistance = gesture.distance;
        gestureCenter = gesture.center;
        scheduleRender();
      } else { panX += dx; panY += dy; scheduleRender(); }
    });
    const release = (e: PointerEvent) => { pointers.delete(e.pointerId); gestureDistance = 0; gestureCenter = null; };
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('lostpointercapture', release);
    // Tapping an empty spot on the zoomed map jumps the view there (same as the old minimap click).
    viewport.addEventListener('click', (e) => {
      if (dragged || (e.target as HTMLElement).closest('.map-stand, .map-tools')) return;
      const rect = surface.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      this.mapModal.close();
      this.cb.onMinimapClick(bounds.x + fx * bounds.w, bounds.y + fy * bounds.h);
    });
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      changeZoom(zoom * Math.exp(-e.deltaY * 0.002), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, { passive: false });
    viewport.append(surface, tools, el('div', 'map-compass', 'N ↑'));
    this.mapModal.append(mapHeader, viewport, selection);
    mapButton.addEventListener('click', () => {
      this.settings.hidden = true;
      results.innerHTML = '';
      input.blur();
      this.cb.onJoystick(0, 0);
      // Open first and paint the big canvas on the next frame, so the dialog appears instantly.
      // Resizing a canvas reallocates its bitmap, so only do it when the minimap size changed.
      if (this.expandedMap.width !== this.minimap.width) this.expandedMap.width = this.minimap.width;
      if (this.expandedMap.height !== this.minimap.height) this.expandedMap.height = this.minimap.height;
      this.mapModal.showModal();
      reset();
      requestAnimationFrame(() => this.snapshotExpandedMap());
    });
    window.addEventListener('resize', () => { if (this.mapModal.open) reset(); });
    this.mapModal.addEventListener('close', () => {
      pointers.clear();
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      gestureDistance = 0;
      gestureCenter = null;
    });
    this.mapModal.addEventListener('click', (e) => {
      if (e.target === this.mapModal) this.mapModal.close();
    });

    // Booth info card.
    this.card = el('div', 'card');
    this.card.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.card.addEventListener('click', (e) => e.stopPropagation());

    // Controls help (Desktop only)
    this.help = el('div', 'help');
    this.renderHelp();

    // Mobile mini pill khi đứng trước gian (không bung toang cả card che joystick)
    this.mobileStandPill = el('div', 'mobile-stand-pill');
    this.mobileStandPill.style.display = 'none';
    this.mobileStandPill.addEventListener('click', () => {
      if (this.currentNearbyStand) {
        this.showStand(this.currentNearbyStand);
      }
    });

    // Thanh chỉ đường ở DƯỚI màn hình (Bottom Navigation Panel)
    this.navBottomPanel = el('div', 'nav-bottom-panel');
    this.navBottomPanel.style.display = 'none';
    this.navBottomPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.navBottomPanel.addEventListener('click', (e) => e.stopPropagation());

    // Location Picker Modal
    this.locationModal = this.buildLocationModal();

    // Toast
    this.toastEl = el('div', 'toast');

    root.append(
      top,
      side,
      this.card,
      this.help,
      this.buildJoystick(),
      this.mobileStandPill,
      this.navBottomPanel,
      this.locationModal,
      this.mapModal,
      this.toastEl,
    );

    this.drawMinimapBase();

    // Lắng nghe resize / orientationchange
    window.addEventListener('resize', () => {
      this.drawMinimapBase();
      this.renderHelp();
    });
  }

  private updateOverviewBtnText(on: boolean) {
    this.overviewBtn.innerHTML = '';
    this.overviewBtn.title = on ? 'Quay lại nhân vật' : 'Xem toàn cảnh';
    this.overviewBtn.setAttribute('aria-label', this.overviewBtn.title);
    this.overviewBtn.setAttribute('aria-pressed', String(on));
    const labelText = on ? (this.isMobile ? 'Quay lại' : 'Quay lại (M)') : (this.isMobile ? 'Toàn cảnh' : 'Toàn cảnh (M)');
    this.overviewBtn.append(makeIcon(Compass, 14), el('span', 'button-label', labelText));
  }

  private renderHelp() {
    this.help.innerHTML = '<b>Điều khiển</b><br>WASD / ← ↑ → ↓: đi · Shift: chạy<br>E: xem gian · Kéo: xoay · Cuộn / chụm hai ngón: thu phóng<br>Chạm sàn: đi tới · M: toàn cảnh';
  }

  setGender(gender: Gender) {
    for (const [g, b] of this.genderBtns) {
      b.classList.toggle('active', g === gender);
      b.setAttribute('aria-pressed', String(g === gender));
    }
  }

  setQuality(mode: QualityMode, level: QualityLevel) {
    for (const [m, b] of this.qualityBtns) b.classList.toggle('active', m === mode);
    this.qualityNote.textContent =
      mode === 'auto' ? `Đang dùng: ${QUALITY[level].label} (tự hạ khi máy chạy chậm)` : 'Mức cố định, không tự điều chỉnh';
  }

  setOverview(on: boolean) {
    this.overviewBtn.classList.toggle('active', on);
    this.updateOverviewBtnText(on);
  }

  /**
   * Cập nhật thông tin gian hàng khi người chơi đứng gần:
   * - Không tự động mở bung card chi tiết lên.
   * - Hiển thị pill nhỏ gọn:
   *   + Desktop: hiển thị "Nhấn E để xem chi tiết"
   *   + Mobile: hiển thị "Chạm để xem chi tiết"
   * - Bấm vào pill (hoặc nhấn phím E) thì mới mở card chi tiết gian hàng.
   */
  updateNearbyStand(s: Stand | null, isInspecting = false) {
    this.currentNearbyStand = s;

    if (s && !this.isCardVisible() && !this.itemFocused) {
      this.mobileStandPill.style.display = '';
      this.mobileStandPill.innerHTML = '';
      const icon = makeIcon(MapPin, 14);
      const label = s.name ? `${s.code ? s.code + ' · ' : ''}${s.name}` : s.code;
      const text = el('span', undefined, `Gian ${label}`);
      const hint = el('span', 'pill-hint', this.isMobile ? 'Chạm để xem chi tiết' : 'Nhấn E để xem chi tiết');
      this.mobileStandPill.append(icon, text, hint);
    } else {
      this.mobileStandPill.style.display = 'none';
    }

    // Nếu đang mở card mà người chơi đi xa khỏi gian (và không phải đang inspect):
    if (!s && !isInspecting && this.isCardVisible()) {
      this.hideStand();
    }
  }

  getCurrentNearbyStand(): Stand | null {
    return this.currentNearbyStand;
  }

  getCurrentCardStand(): Stand | null {
    return this.currentCardStand;
  }

  isCardVisible(): boolean {
    return this.card.classList.contains('show');
  }

  hideStand() {
    this.card.classList.remove('show');
    this.currentCardStand = null;
    this.currentCardNavState = false;
    if (this.activeNavInfo && !this.itemFocused) {
      // Khi đóng card mà vẫn đang dẫn đường, hiện thanh bottom panel để người dùng điều khiển
      this.navBottomPanel.style.display = 'flex';
      this.updateOrRenderNavBottomPanel(this.activeNavInfo);
    }
    if (this.currentNearbyStand) {
      this.updateNearbyStand(this.currentNearbyStand);
    }
  }

  showStand(s: Stand | null, forceRerender = false) {
    if (!s) {
      this.hideStand();
      return;
    }
    this.mobileStandPill.style.display = 'none';

    // LUÔN ẨN thanh chỉ đường phía dưới khi Card đang mở để không bao giờ bị chồng chéo giao diện!
    this.navBottomPanel.style.display = 'none';

    const isNavigatingToThis = !!(
      this.activeNavInfo &&
      (this.activeNavInfo.destination.code === s.code || this.activeNavInfo.destination.name === s.name)
    );

    // Nếu card đã đang mở đúng gian này và trạng thái nav không đổi và không bị ép buộc re-render:
    // CHỈ CẬP NHẬT KHOẢNG CÁCH để không phá hủy DOM và không làm mất sự kiện click của user!
    if (!forceRerender && this.currentCardStand === s && this.isCardVisible() && this.currentCardNavState === isNavigatingToThis) {
      if (isNavigatingToThis && this.activeNavInfo) {
        this.updateCardNavDistance(this.activeNavInfo.distance, this.activeNavInfo.isInspecting);
      }
      return;
    }

    this.currentCardStand = s;
    this.currentCardNavState = isNavigatingToThis;
    this.card.innerHTML = '';

    // Header
    const head = el('div', 'card-head');
    if (s.code) {
      const chip = el('span', 'chip big', s.code);
      chip.style.background = s.color;
      head.append(chip);
    }
    const titles = el('div');
    titles.append(el('div', 'card-title', s.name || s.code), el('div', 'card-sub', KIND_LABEL[s.kind]));
    head.append(titles);

    const closeBtn = el('button', 'card-close');
    closeBtn.append(makeIcon(X, 16));
    closeBtn.title = 'Đóng';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideStand();
    });

    head.append(closeBtn);
    this.card.append(head);
    const teleport = el('button', 'booth-info-link', 'Teleport tới gian này');
    teleport.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cb.onTeleportToStand(s);
      this.hideStand();
      this.showToast(`Đã đến gian ${s.code || s.name}`);
    });
    this.card.append(teleport);
    if (s.id === boothConfig.id) {
      this.card.append(createBoothDetails(s));
    }
    if (s.id === a9BoothConfig.id) {
      this.card.append(createA9BoothDetails(s));
    }

    // Groups
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

    if (isNavigatingToThis && this.activeNavInfo) {
      // Khối chỉ đường hiển thị trực tiếp lên UI chi tiết gian hàng
      const navBox = el('div', 'card-nav-box');

      const navHead = el('div', 'card-nav-title');
      navHead.append(
        makeIcon(Route, 16, 'nav-dest-icon'),
        document.createTextNode(' Đang chỉ đường tới gian này'),
        el('span', 'nav-dist', `${Math.round(this.activeNavInfo.distance)}m`)
      );

      const navOrigin = el('div', 'card-nav-origin');
      const originText = el('span');
      originText.innerHTML = `Xuất phát: <b>${this.currentOriginLabel}</b>`;
      const changeBtn = el('button', 'btn-change-origin');
      changeBtn.append(makeIcon(MapPin, 13), document.createTextNode(' Chọn vị trí hiện tại'));
      changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openLocationModal('set-origin');
      });
      navOrigin.append(originText, changeBtn);

      const navActions = el('div', 'card-nav-actions');

      const viewBtn = el('button', 'btn-view');
      viewBtn.append(
        makeIcon(this.activeNavInfo.isInspecting ? User : Eye, 14),
        document.createTextNode(this.activeNavInfo.isInspecting ? ' Về bạn' : ' Xem gian')
      );
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onToggleCameraTarget();
      });

      const stopBtn = el('button', 'act-stop-nav');
      stopBtn.append(makeIcon(X, 15), document.createTextNode(' Dừng chỉ đường'));
      stopBtn.title = 'Hủy chế độ chỉ đường';
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onCancelNavigation();
      });

      const beginBtn = el('button', 'act-begin', 'Bắt đầu đi');
      beginBtn.addEventListener('click', () => {
        this.cb.onBeginWalking();
      });
      navActions.append(beginBtn, viewBtn, stopBtn);
      navBox.append(navHead, navOrigin, navActions);
      this.card.append(navBox);
    } else {
      // Actions thông thường khi không chỉ đường tới gian này
      const actions = el('div', 'card-actions');

      const navBtn = el('button', 'act-nav');
      navBtn.append(makeIcon(Route, 15), document.createTextNode(' Chỉ đường'));
      navBtn.title = 'Chỉ đường từ vị trí của bạn tới gian này';
      navBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onStartNavigation(s);
      });

      actions.append(navBtn);
      this.card.append(actions);
    }

    this.card.classList.add('show');
  }

  private updateCardNavDistance(distance: number, isInspecting: boolean) {
    const distBadge = this.card.querySelector<HTMLSpanElement>('.nav-dist');
    if (distBadge) distBadge.textContent = `${Math.round(distance)}m`;
    const viewBtn = this.card.querySelector<HTMLButtonElement>('.card-nav-actions .btn-view');
    if (viewBtn) {
      viewBtn.innerHTML = '';
      viewBtn.append(
        makeIcon(isInspecting ? User : Eye, 14),
        document.createTextNode(isInspecting ? ' Về bạn' : ' Xem gian')
      );
    }
  }

  /**
   * Thanh điều hướng chỉ đường được đặt ở DƯỚI màn hình (khi card đóng).
   * Không bao giờ chồng lên UI detail của gian hàng.
   */
  setItemFocused(on: boolean) {
    this.itemFocused = on;
    if (on) {
      this.hideStand();
      this.navBottomPanel.style.display = 'none';
      this.mobileStandPill.style.display = 'none';
    } else {
      this.setNavigation(this.activeNavInfo);
    }
  }

  setNavigation(info: { destination: Stand; distance: number; isInspecting: boolean } | null) {
    this.activeNavInfo = info;
    if (!info) {
      this.navBottomPanel.style.display = 'none';
      if (this.isCardVisible() && this.currentCardStand && this.currentCardNavState) {
        this.showStand(this.currentCardStand, true);
      }
      return;
    }

    if (this.itemFocused) {
      this.navBottomPanel.style.display = 'none';
      return;
    }

    if (this.isCardVisible()) {
      // Khi Card đang mở: LUÔN ẨN navBottomPanel để không bao giờ bị chồng đè lên nhau
      this.navBottomPanel.style.display = 'none';
      if (this.currentCardStand && (this.currentCardStand.code === info.destination.code || this.currentCardStand.name === info.destination.name)) {
        if (!this.currentCardNavState) {
          this.showStand(info.destination, true);
        } else {
          this.updateCardNavDistance(info.distance, info.isInspecting);
        }
      }
      return;
    }

    // Nếu Card không mở, hiển thị thanh điều hướng nhỏ ở dưới
    this.navBottomPanel.style.display = 'flex';
    this.updateOrRenderNavBottomPanel(info);
  }

  private updateOrRenderNavBottomPanel(info: { destination: Stand; distance: number; isInspecting: boolean }) {
    const distBadge = this.navBottomPanel.querySelector<HTMLSpanElement>('.nav-dist');
    const destText = this.navBottomPanel.querySelector<HTMLSpanElement>('.nav-dest-text');
    const originText = this.navBottomPanel.querySelector<HTMLSpanElement>('.nav-origin-text b');

    if (distBadge && destText && originText) {
      distBadge.textContent = `${Math.round(info.distance)}m`;
      originText.textContent = this.currentOriginLabel;
      const code = info.destination.code || info.destination.name;
      if (destText.dataset.destination !== info.destination.id) {
        this.renderNavBottomPanel(info);
      } else {
        const label = destText.querySelector('b');
        if (label) label.textContent = code;
      }
      return;
    }

    this.renderNavBottomPanel(info);
  }

  private renderNavBottomPanel(info: { destination: Stand; distance: number; isInspecting: boolean }) {
    this.navBottomPanel.innerHTML = '';

    // Dòng trên: Chọn vị trí xuất phát hiện tại
    const rowOrigin = el('div', 'nav-row-origin');
    const originIcon = makeIcon(MapPin, 14, 'nav-origin-pin');
    const originText = el('span', 'nav-origin-text');
    originText.innerHTML = `Xuất phát: <b>${this.currentOriginLabel}</b>`;

    const changeOriginBtn = el('button', 'btn-change-origin');
    changeOriginBtn.append(makeIcon(MapPin, 13), document.createTextNode(' Chọn vị trí hiện tại'));
    changeOriginBtn.title = 'Chọn gian hàng bạn đang đứng làm điểm xuất phát';
    changeOriginBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openLocationModal('set-origin');
    });
    rowOrigin.append(originIcon, originText, changeOriginBtn);

    // Dòng dưới: Điểm đến + khoảng cách + các nút hành động
    const rowDest = el('div', 'nav-row-dest');

    const destInfo = el('div', 'nav-dest-info');
    const routeIcon = makeIcon(Route, 16, 'nav-dest-icon');
    const destText = el('span', 'nav-dest-text');
    destText.dataset.destination = info.destination.id;
    const code = info.destination.code || info.destination.name;
    destText.innerHTML = `Đi đến <b>${code}</b>`;
    const distBadge = el('span', 'nav-dist', `${Math.round(info.distance)}m`);
    destInfo.append(routeIcon, destText, distBadge);

    const destActions = el('div', 'nav-dest-actions');

    const detailBtn = el('button', 'btn-view');
    detailBtn.append(makeIcon(Eye, 13), document.createTextNode(' Chi tiết'));
    detailBtn.title = 'Mở lại thông tin gian hàng';
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showStand(info.destination);
    });

    const stopBtn = el('button', 'btn-stop-nav');
    stopBtn.append(makeIcon(X, 14), document.createTextNode(' Dừng'));
    stopBtn.title = 'Dừng chỉ đường';
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onCancelNavigation();
    });

    destActions.append(detailBtn, stopBtn);
    rowDest.append(destInfo, destActions);

    this.navBottomPanel.append(rowOrigin, rowDest);
  }

  showToast(message: string) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2500);
  }

  /**
   * Modal chọn vị trí hiện tại (cho phép chọn gian đang đứng để xuất phát dẫn đường)
   */
  private buildLocationModal(): HTMLElement {
    const modal = el('div', 'location-modal');
    modal.hidden = true;

    const card = el('div', 'location-card');
    const header = el('div', 'loc-header');
    const title = el('h2');
    title.append(makeIcon(MapPin, 18), document.createTextNode(' Chọn vị trí hiện tại'));
    const closeBtn = el('button', 'card-close');
    closeBtn.append(makeIcon(X, 16));
    closeBtn.addEventListener('click', () => {
      modal.hidden = true;
    });
    header.append(title, closeBtn);

    const desc = el('p', 'card-sub', 'Chọn gian bạn đang đứng để đánh dấu vị trí hiện tại và chỉ đường từ đây tới gian đích.');

    const presetsDiv = el('div', 'loc-presets');
    const setOriginLabel = (label: string) => {
      this.currentOriginLabel = label;
      const origin = this.card.querySelector('.card-nav-origin b');
      if (origin) origin.textContent = label;
      const bottomOrigin = this.navBottomPanel.querySelector('.nav-origin-text b');
      if (bottomOrigin) bottomOrigin.textContent = label;
      modal.hidden = true;
      this.showToast(`Đã đánh dấu vị trí hiện tại: ${label}`);
    };
    const addPreset = (label: string, x: number, y: number) => {
      const button = el('button', undefined, label);
      button.type = 'button';
      button.addEventListener('click', () => {
        if (this.cb.onSetOriginPoint(x, y)) setOriginLabel(label);
      });
      presetsDiv.append(button);
    };
    const checkin = this.map.zones.find(zone => /check[\s-]*in/i.test(zone.label))?.rect
      ?? this.map.halls.find(hall => !hall.sealed && /check[\s-]*in/i.test(hall.label || ''));
    addPreset('Check-in', checkin ? checkin.x + checkin.w / 2 : SPAWN.x,
      checkin ? checkin.y + checkin.h / 2 : SPAWN.y);
    for (const hall of this.map.halls) {
      if (hall.sealed) continue;
      addPreset(hall.label?.split(' · ')[0] || 'Hall', hall.x + hall.w / 2, hall.y + hall.h / 2);
    }
    // Search booth input
    const searchInput = el('input', 'loc-search');
    searchInput.type = 'search';
    searchInput.setAttribute('aria-label', 'Tìm gian bạn đang đứng');
    searchInput.placeholder = 'Nhập mã hoặc tên gian (A15, D5)…';
    const resultsList = el('ul', 'loc-results');

    const renderResults = (query: string) => {
      resultsList.innerHTML = '';
      const list = query.trim() ? searchStands(this.map.stands, query, 8)
        : this.currentNearbyStand ? [this.currentNearbyStand] : [];
      if (!list.length) {
        resultsList.append(el('li', 'loc-empty', query.trim() ? 'Không tìm thấy gian. Thử mã hoặc tên khác.' : 'Nhập mã gian bạn đang đứng để tìm vị trí.'));
      }
      for (const s of list) {
        const li = el('li');
        const chip = el('span', 'chip', s.code || '•');
        chip.style.background = s.color;
        li.append(chip, el('span', 'name', s.name || s.code));
        li.addEventListener('click', () => {
          this.cb.onSetCurrentLocation(s);
          setOriginLabel(s.code || s.name);
        });
        resultsList.append(li);
      }
    };

    searchInput.addEventListener('input', () => {
      renderResults(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') resultsList.querySelector<HTMLElement>('li:not(.loc-empty)')?.click();
      if (e.key === 'Escape') modal.hidden = true;
    });

    const hint = el('p', 'loc-hint');
    hint.append(
      makeIcon(Sparkles, 14),
      document.createTextNode(' Điểm đến được giữ nguyên khi chọn lại vị trí hiện tại.')
    );

    card.append(header, desc, presetsDiv, searchInput, resultsList, hint);
    modal.append(card);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.hidden = true;
    });

    return modal;
  }

  openLocationModal(context: 'set-origin' | 'set-location' = 'set-location') {
    this.locationModal.hidden = false;
    const titleEl = this.locationModal.querySelector<HTMLHeadingElement>('.loc-header h2');
    if (titleEl) {
      titleEl.innerHTML = '';
      titleEl.append(
        makeIcon(MapPin, 18),
        document.createTextNode(context === 'set-origin' ? ' Chọn vị trí xuất phát' : ' Chọn vị trí hiện tại')
      );
    }
    const input = this.locationModal.querySelector<HTMLInputElement>('.loc-search');
    if (input) {
      input.value = '';
      input.focus();
      const list = this.locationModal.querySelector('.loc-results');
      if (list) list.innerHTML = '';
      input.dispatchEvent(new Event('input'));
    }
  }

  private updateFullscreenButton() {
    const expanded = Boolean(document.fullscreenElement);
    this.fullscreenBtn.replaceChildren(
      makeIcon(expanded ? Minimize : Maximize, 14),
      el('span', 'button-label', expanded ? 'Thu nhỏ' : 'Toàn màn hình'),
    );
    this.fullscreenBtn.title = expanded ? 'Thoát toàn màn hình' : 'Mở toàn màn hình ngang';
    this.fullscreenBtn.setAttribute('aria-label', this.fullscreenBtn.title);
  }

  /** Enter fullscreen first, then request landscape while the user gesture is active. */
  private async toggleFullscreen() {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void>; unlock?: () => void };
    try {
      if (document.fullscreenElement) {
        orientation.unlock?.();
        await document.exitFullscreen();
        this.showToast('Đã thu nhỏ màn hình.');
      } else {
        if (!document.documentElement.requestFullscreen) {
          throw new Error('fullscreen unsupported');
        }
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (typeof orientation.lock === 'function') {
          try {
            await orientation.lock('landscape');
            this.showToast('Đã mở toàn màn hình ngang.');
          } catch {
            this.showToast('Đã mở toàn màn hình. Hãy xoay điện thoại ngang để xem rộng hơn.');
          }
        } else {
          this.showToast('Đã mở toàn màn hình. Hãy xoay điện thoại ngang để xem rộng hơn.');
        }
      }
    } catch {
      this.showToast('Thiết bị không hỗ trợ nút toàn màn hình. Hãy xoay điện thoại thủ công.');
    } finally {
      this.updateFullscreenButton();
      window.dispatchEvent(new Event('resize'));
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    }
  }

  private buildJoystick() {
    const pad = el('div', 'joystick');
    const knob = el('div', 'knob');
    pad.append(knob);
    let active: number | null = null;

    const set = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const R = (r.width - knob.offsetWidth) / 2;
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
      if (active !== null) return;
      e.preventDefault();
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
    pad.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', () => {
      active = null;
      knob.style.transform = '';
      this.cb.onJoystick(0, 0);
    });
    return pad;
  }

  private drawMinimapBase() {
    const b = this.map.bounds;
    const isSmall = window.innerWidth <= 640 || (window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
    const size = isSmall ? 160 : 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.mmScale = (1600 * dpr) / Math.max(b.w, b.h);
    const w = Math.round(b.w * this.mmScale);
    const h = Math.round(b.h * this.mmScale);
    for (const c of [this.minimap, this.minimapBase]) {
      c.width = w;
      c.height = h;
    }
    this.minimap.style.width = `${size * b.w / Math.max(b.w, b.h)}px`;
    this.minimap.style.height = `${size * b.h / Math.max(b.w, b.h)}px`;

    const ctx = this.minimapBase.getContext('2d')!;
    const R = (r: Rect, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect((r.x - b.x) * this.mmScale, (r.y - b.y) * this.mmScale, Math.max(1, r.w * this.mmScale), Math.max(1, r.h * this.mmScale));
    };
    ctx.fillStyle = '#d4ecc9';
    ctx.fillRect(0, 0, w, h);
    for (const g of this.map.grounds) R(g.rect, g.kind === 'road' ? '#8b8b96' : g.kind === 'parking' ? '#a7b4bf' : '#b9c9bd');
    for (const hall of this.map.halls) R(hall, hall.sealed ? '#d9cfee' : '#f7f1fe');
    for (const z of this.map.zones) R(z.rect, z.color);
    for (const r of this.map.rooms) R(r.rect, r.color);
    for (const s of this.map.stands) R(s.rect, s.kind === 'foodcourt' ? '#fff2a8' : s.color);
    for (const s of this.map.stages) R(s.rect, '#5d5a78');
    for (const wall of this.map.walls) R(wallRect(wall, WALL_T * 1.5), '#9d8fc4');
    for (const g of this.map.gates) R(g, '#38528f');
    for (const car of this.map.props.filter((p) => p.kind === 'parked-car')) R(car.rect, '#466782');
    for (const p of this.map.signParts) R(p, '#4caf50');
  }

  /**
   * Redraws the minimap with visitor marker and optional navigation path.
   * World position in metres, heading in radians.
   */
  drawMinimap(wx: number, wz: number, heading: number, routeWaypoints?: Array<{ x: number; z: number }>) {
    const ctx = this.minimap.getContext('2d')!;
    ctx.drawImage(this.minimapBase, 0, 0);
    const b = this.map.bounds;

    // Draw active navigation path on minimap
    if (routeWaypoints && routeWaypoints.length > 1) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < routeWaypoints.length; i++) {
        const wp = routeWaypoints[i];
        const px = (toMapX(wp.x) - b.x) * this.mmScale;
        const py = (toMapY(wp.z) - b.y) * this.mmScale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const routeWidth = Math.max(8, this.minimap.width / 65);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = routeWidth + routeWidth * 0.7;
      ctx.stroke();
      ctx.strokeStyle = '#007de3';
      ctx.lineWidth = routeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Destination target pin / dot
      const last = routeWaypoints[routeWaypoints.length - 1];
      const lx = (toMapX(last.x) - b.x) * this.mmScale;
      const ly = (toMapY(last.z) - b.y) * this.mmScale;
      ctx.beginPath();
      ctx.arc(lx, ly, this.minimap.width / 80, 0, Math.PI * 2);
      ctx.fillStyle = '#5b45c9';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = this.minimap.width / 320;
      ctx.stroke();

      ctx.restore();
    }

    // Hall and parking labels scale with the canvas, also visible in the full map.
    ctx.save();
    ctx.font = `700 ${this.minimap.width / 90}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#233746';
    for (const hall of this.map.halls) {
      if (hall.sealed) continue;
      const name = hall.label?.split(' · ')[0];
      if (name) ctx.fillText(name, (hall.x + hall.w / 2 - b.x) * this.mmScale, (hall.y + 70 - b.y) * this.mmScale);
    }
    for (const parking of this.map.grounds.filter((g) => g.kind === 'parking')) {
      ctx.fillText('P · Bãi giữ xe', (parking.rect.x + parking.rect.w / 2 - b.x) * this.mmScale, (parking.rect.y + 40 - b.y) * this.mmScale);
    }
    ctx.restore();

    // Draw visitor marker
    const x = (toMapX(wx) - b.x) * this.mmScale;
    const y = (toMapY(wz) - b.y) * this.mmScale;
    const s = Math.max(12, this.minimap.width / 100);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s * 0.9, s);
    ctx.lineTo(0, s * 0.45);
    ctx.lineTo(-s * 0.9, s);
    ctx.closePath();
    ctx.fillStyle = '#5b45c9';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.35;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** The full-screen map is a frozen snapshot taken when it opens, so it stays still while you pan and zoom. */
  private snapshotExpandedMap() {
    this.expandedMap.getContext('2d')!.drawImage(this.minimap, 0, 0);
  }
}


