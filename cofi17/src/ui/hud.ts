import { toMapX, toMapY, toWorldX, toWorldZ, worldRect, type Rect } from '../map/coords';
import { SPAWN } from '../config';
import type { Gender } from '../player/avatar';
import { QUALITY, type QualityLevel, type QualityMode } from '../scene/quality';
import type { ParsedMap, Stand } from '../map/parse';
import { wallRect } from '../map/walls';
import { WALL_T } from '../map/parse';
import { standFront } from '../scene/booths';
import {
  makeIcon,
  Compass,
  Navigation,
  MapPin,
  X,
  Eye,
  User,
  DoorOpen,
  Sparkles,
  Utensils,
  Settings,
  RotateCw,
  Check,
  Route,
} from './icons';

export interface HudCallbacks {
  onSelectStand: (s: Stand) => void;
  onMinimapClick: (mapX: number, mapY: number) => void;
  onToggleOverview: () => void;
  onGoEntrance: () => void;
  onToggleFocus: () => void;
  onSelectCharacter: (gender: Gender) => void;
  onSelectQuality: (mode: QualityMode) => void;
  onJoystick: (x: number, y: number) => void;
  onSetLocation: (x: number, z: number, heading?: number, label?: string) => void;
  onStartNavigation: (s: Stand) => void;
  onCancelNavigation: () => void;
  onTeleportToStand: (s: Stand) => void;
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
  private currentCardStand: Stand | null = null;
  private minimap: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement;
  private mmScale = 1;
  private overviewBtn: HTMLButtonElement;
  private focusBtn: HTMLButtonElement;
  private rotateBtn: HTMLButtonElement;
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
    this.minimap.title = 'Bấm để chỉ đường đến gian hàng hoặc đi tới điểm này';
    this.minimapBase = document.createElement('canvas');

    const buttons = el('div', 'buttons');

    // Nút Toàn cảnh
    this.overviewBtn = el('button', undefined);
    this.updateOverviewBtnText(false);
    this.overviewBtn.addEventListener('click', () => this.cb.onToggleOverview());

    // Nút Về lối vào
    const entrance = el('button', undefined);
    entrance.append(makeIcon(DoorOpen, 14), document.createTextNode(' Lối vào'));
    entrance.title = 'Về lối vào khu Check-in';
    entrance.addEventListener('click', () => {
      this.currentOriginLabel = 'Lối vào Check-in';
      this.cb.onGoEntrance();
    });

    // Nút Theo hướng đi
    this.focusBtn = el('button', undefined);
    this.updateFocusBtnText();
    this.focusBtn.title = 'Camera luôn nhìn theo hướng nhân vật đi';
    this.focusBtn.addEventListener('click', () => this.cb.onToggleFocus());

    // Nút Xoay màn hình (Mobile & Desktop)
    this.rotateBtn = el('button', undefined);
    this.rotateBtn.append(makeIcon(RotateCw, 14), document.createTextNode(' Xoay'));
    this.rotateBtn.title = 'Xoay màn hình ngang/dọc';
    this.rotateBtn.addEventListener('click', () => this.toggleOrientation());

    // Nút Cài đặt
    const gear = el('button', 'icon');
    gear.append(makeIcon(Settings, 15));
    gear.title = 'Cài đặt: nhân vật, chất lượng đồ hoạ';
    gear.setAttribute('aria-label', 'Cài đặt');
    buttons.append(this.overviewBtn, entrance, this.focusBtn, this.rotateBtn, gear);

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

    // Minimap click
    this.minimap.addEventListener('click', (e) => {
      const r = this.minimap.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.minimap.width;
      const py = ((e.clientY - r.top) / r.height) * this.minimap.height;
      this.cb.onMinimapClick(this.map.bounds.x + px / this.mmScale, this.map.bounds.y + py / this.mmScale);
    });

    // Booth info card.
    this.card = el('div', 'card');
    this.card.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.card.addEventListener('click', (e) => e.stopPropagation());

    // Controls help (Desktop only)
    this.help = el('div', 'help');
    this.renderHelp(false);

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
      this.toastEl,
    );

    this.drawMinimapBase();

    // Lắng nghe resize / orientationchange
    window.addEventListener('resize', () => {
      this.drawMinimapBase();
      this.renderHelp(this.focusBtn.classList.contains('active'));
    });
  }

  private updateOverviewBtnText(on: boolean) {
    this.overviewBtn.innerHTML = '';
    const labelText = on ? (this.isMobile ? 'Quay lại' : 'Quay lại (M)') : (this.isMobile ? 'Toàn cảnh' : 'Toàn cảnh (M)');
    this.overviewBtn.append(makeIcon(Compass, 14), document.createTextNode(` ${labelText}`));
  }

  private updateFocusBtnText() {
    this.focusBtn.innerHTML = '';
    const labelText = this.isMobile ? 'Theo hướng đi' : 'Theo hướng đi (F)';
    this.focusBtn.append(makeIcon(Navigation, 14), document.createTextNode(` ${labelText}`));
  }

  private renderHelp(focus: boolean) {
    const move = focus ? 'W / S: đi tới, lùi · A / D: xoay' : 'WASD / ← ↑ → ↓: đi';
    this.help.innerHTML =
      `<b>Điều khiển</b><br>${move} · Shift: chạy<br>E: xem chi tiết gian · Kéo chuột: xoay<br>Bấm lên sàn: đi tới đó · M: toàn cảnh · F: theo hướng`;
  }

  setFocus(on: boolean) {
    this.focusBtn.classList.toggle('active', on);
    this.renderHelp(on);
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

    if (s && !this.isCardVisible()) {
      this.mobileStandPill.style.display = 'flex';
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
    if (this.activeNavInfo) {
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
      changeBtn.append(makeIcon(MapPin, 13), document.createTextNode(' Đổi điểm xuất phát'));
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

      navActions.append(viewBtn, stopBtn);
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
  setNavigation(info: { destination: Stand; distance: number; isInspecting: boolean } | null) {
    this.activeNavInfo = info;
    if (!info) {
      this.navBottomPanel.style.display = 'none';
      if (this.isCardVisible() && this.currentCardStand && this.currentCardNavState) {
        this.showStand(this.currentCardStand, true);
      }
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
      destText.innerHTML = `Đi đến <b>${code}</b>`;
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
    changeOriginBtn.append(makeIcon(MapPin, 13), document.createTextNode(' Chọn gian đang đứng'));
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
    this.toastEl.innerHTML = '';
    this.toastEl.append(makeIcon(Check, 15), document.createTextNode(` ${message}`));
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
    title.append(makeIcon(MapPin, 18), document.createTextNode(' Đặt vị trí của bạn'));
    const closeBtn = el('button', 'card-close');
    closeBtn.append(makeIcon(X, 16));
    closeBtn.addEventListener('click', () => {
      modal.hidden = true;
    });
    header.append(title, closeBtn);

    const desc = el('p', 'card-sub', 'Chọn gian hàng hoặc khu vực bạn đang đứng để bắt đầu dẫn đường.');

    // Presets
    const presetsDiv = el('div', 'loc-presets');

    const spawnBtn = el('button');
    spawnBtn.append(makeIcon(DoorOpen, 14), document.createTextNode(' Lối vào Check-in'));
    spawnBtn.addEventListener('click', () => {
      const spawnX = toWorldX(SPAWN.x);
      const spawnZ = toWorldZ(SPAWN.y);
      this.currentOriginLabel = 'Lối vào Check-in';
      this.cb.onSetLocation(spawnX, spawnZ, Math.PI, 'Lối vào Check-in');
      modal.hidden = true;
      this.showToast('Đã chuyển vị trí về lối vào Check-in');
    });
    presetsDiv.append(spawnBtn);

    if (this.map.stages.length > 0) {
      const stage = this.map.stages[0];
      const stageBtn = el('button');
      stageBtn.append(makeIcon(Sparkles, 14), document.createTextNode(' Sân khấu chính'));
      stageBtn.addEventListener('click', () => {
        const { cx, cz } = worldRect(stage.rect);
        this.currentOriginLabel = 'Sân khấu chính';
        this.cb.onSetLocation(cx, cz + 3, 0, 'Sân khấu chính');
        modal.hidden = true;
        this.showToast('Đã chuyển vị trí về Sân khấu chính');
      });
      presetsDiv.append(stageBtn);
    }

    const foodcourt = this.map.stands.find((s) => s.kind === 'foodcourt');
    if (foodcourt) {
      const fcBtn = el('button');
      fcBtn.append(makeIcon(Utensils, 14), document.createTextNode(' Khu ẩm thực'));
      fcBtn.addEventListener('click', () => {
        const { cx, cz } = worldRect(foodcourt.rect);
        this.currentOriginLabel = 'Khu ẩm thực';
        this.cb.onSetLocation(cx, cz, 0, 'Khu ẩm thực');
        modal.hidden = true;
        this.showToast('Đã chuyển vị trí về Khu ẩm thực');
      });
      presetsDiv.append(fcBtn);
    }

    // Search booth input
    const searchInput = el('input', 'loc-search');
    searchInput.placeholder = 'Tìm gian hàng bạn đang đứng (vd: A15, D5)...';
    const resultsList = el('ul', 'loc-results');

    const renderResults = (query: string) => {
      resultsList.innerHTML = '';
      const list = searchStands(this.map.stands, query, 12);
      for (const s of list) {
        const li = el('li');
        const chip = el('span', 'chip', s.code || '•');
        chip.style.background = s.color;
        li.append(chip, el('span', 'name', s.name || s.code));
        li.addEventListener('click', () => {
          const p = standFront(s);
          const label = s.code ? `Gian ${s.code}` : s.name;
          this.currentOriginLabel = label;
          this.cb.onSetLocation(p.x, p.z, p.heading, s.code || s.name);
          modal.hidden = true;
          this.showToast(`Đã chọn vị trí tại gian ${s.code || s.name}`);
        });
        resultsList.append(li);
      }
    };

    searchInput.addEventListener('input', () => {
      renderResults(searchInput.value);
    });

    const hint = el('p', 'loc-hint');
    hint.append(
      makeIcon(Sparkles, 14),
      document.createTextNode(' Bạn cũng có thể bấm trực tiếp lên bản đồ con (minimap) để chọn điểm đi tới.')
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
        document.createTextNode(context === 'set-origin' ? ' Chọn gian bạn đang đứng' : ' Đặt vị trí của bạn')
      );
    }
    const input = this.locationModal.querySelector<HTMLInputElement>('.loc-search');
    if (input) {
      input.value = '';
      input.focus();
      const list = this.locationModal.querySelector('.loc-results');
      if (list) list.innerHTML = '';
    }
  }

  /**
   * Chế độ xoay màn hình (orientation toggle cho mobile và desktop)
   */
  async toggleOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const targetOrientation = isLandscape ? 'portrait' : 'landscape';

    const screenOri = screen.orientation as unknown as { lock?: (type: string) => Promise<void> } | undefined;
    if (screenOri && typeof screenOri.lock === 'function') {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        await screenOri.lock(targetOrientation);
        this.showToast(isLandscape ? 'Đã chuyển xoay dọc màn hình' : 'Đã chuyển xoay ngang màn hình');
      } catch {
        this.showToast(isLandscape ? 'Vui lòng xoay dọc thiết bị' : 'Vui lòng xoay ngang thiết bị');
      }
    } else {
      this.showToast(isLandscape ? 'Vui lòng xoay dọc thiết bị' : 'Vui lòng xoay ngang thiết bị');
    }

    // Kích hoạt cập nhật kích thước khung nhìn
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
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
    const isSmall = window.innerWidth <= 640 || (window.innerHeight <= 500 && window.innerWidth > window.innerHeight);
    const size = isSmall ? 160 : 240;
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
      ctx.strokeStyle = '#00c8f8';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Destination target pin / dot
      const last = routeWaypoints[routeWaypoints.length - 1];
      const lx = (toMapX(last.x) - b.x) * this.mmScale;
      const ly = (toMapY(last.z) - b.y) * this.mmScale;
      ctx.beginPath();
      ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4f9a';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    // Draw visitor marker
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
