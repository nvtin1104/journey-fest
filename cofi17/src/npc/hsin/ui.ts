import * as THREE from 'three';
import './hsin.css';

/**
 * Hsin's own presentation, distinct from the venue's pastel labels: a dark crimson nameplate
 * with gold trim, a rotating gold sigil and drifting sparkles at her feet, and a visual-novel
 * style dialogue box with a photo button.
 */

const SERIF = `'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif`;
const SANS = `'Be Vietnam Pro', system-ui, sans-serif`;

function noRaycast<T extends THREE.Object3D>(o: T) {
  o.raycast = () => {};
  return o;
}

function fourStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Floating nameplate: crimson-to-black card, gold double border, serif title. */
export function nameplate() {
  const scale = 2;
  const w = 460 * scale;
  const h = 132 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const pad = 8 * scale;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, 'rgba(120,10,24,0.94)');
  bg.addColorStop(0.55, 'rgba(36,10,20,0.94)');
  bg.addColorStop(1, 'rgba(12,8,16,0.94)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, 18 * scale);
  ctx.fill();
  ctx.strokeStyle = '#e8c06a';
  ctx.lineWidth = 3 * scale;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,192,106,0.45)';
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.roundRect(pad + 7 * scale, pad + 7 * scale, w - (pad + 7 * scale) * 2, h - (pad + 7 * scale) * 2, 13 * scale);
  ctx.stroke();
  ctx.fillStyle = '#f3d27e';
  fourStar(ctx, 42 * scale, h / 2, 16 * scale);
  fourStar(ctx, w - 42 * scale, h / 2, 16 * scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff4dc';
  ctx.font = `italic 700 ${54 * scale}px ${SERIF}`;
  ctx.shadowColor = 'rgba(255,190,90,0.6)';
  ctx.shadowBlur = 12 * scale;
  ctx.fillText('Hsin', w / 2, h * 0.4);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${19 * scale}px ${SANS}`;
  ctx.fillStyle = '#f0c8a8';
  ctx.fillText('PHƯƠNG ANH  ·  COSPLAYER', w / 2, h * 0.74);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = noRaycast(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })));
  const height = 0.3;
  sprite.scale.set(height * (w / h), height, 1);
  sprite.renderOrder = 4;
  return sprite;
}

/** Gold sigil on the floor: rings, ticks and four-pointed stars, additive and slowly rotating. */
export function sigil() {
  const s = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const c = s / 2;
  const glow = ctx.createRadialGradient(c, c, s * 0.05, c, c, s * 0.5);
  glow.addColorStop(0, 'rgba(255,200,120,0.28)');
  glow.addColorStop(0.7, 'rgba(255,120,90,0.08)');
  glow.addColorStop(1, 'rgba(255,120,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,214,140,0.95)';
  ctx.fillStyle = 'rgba(255,214,140,0.95)';
  for (const [r, wdt] of [[0.46, 6], [0.43, 2], [0.31, 4], [0.28, 1.5], [0.12, 3]] as const) {
    ctx.lineWidth = wdt;
    ctx.beginPath();
    ctx.arc(c, c, s * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 6 === 0;
    ctx.lineWidth = long ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * s * 0.43, c + Math.sin(a) * s * 0.43);
    ctx.lineTo(c + Math.cos(a) * s * (long ? 0.36 : 0.395), c + Math.sin(a) * s * (long ? 0.36 : 0.395));
    ctx.stroke();
  }
  // Two interlocking squares (an eight-pointed seal) and stars on the cardinal points.
  ctx.lineWidth = 3;
  for (const rot of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = rot + (i / 4) * Math.PI * 2;
      const x = c + Math.cos(a) * s * 0.28;
      const y = c + Math.sin(a) * s * 0.28;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    fourStar(ctx, c + Math.cos(a) * s * 0.37, c + Math.sin(a) * s * 0.37, s * 0.03);
  }
  fourStar(ctx, c, c, s * 0.07);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false });
  const mesh = noRaycast(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  return mesh;
}

/** Soft contact shadow so she stays grounded on the lowest quality (no shadow maps). */
export function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(30,15,30,0.5)');
  g.addColorStop(0.6, 'rgba(30,15,30,0.18)');
  g.addColorStop(1, 'rgba(30,15,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = noRaycast(new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  ));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  return mesh;
}

/** Gold and white motes rising around her. */
export function sparkles(count = 46) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,230,170,0.9)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  fourStar(ctx, 32, 32, 30);
  const positions = new Float32Array(count * 3);
  const seeds = Array.from({ length: count }, (_, i) => ({ a: (i * 2.39996) % (Math.PI * 2), r: 0.35 + ((i * 0.618) % 1) * 0.55, speed: 0.18 + ((i * 0.37) % 1) * 0.25, off: (i * 0.731) % 1 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.PointsMaterial({ map: tex, size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe3a8', fog: false });
  const points = noRaycast(new THREE.Points(geo, mat));
  points.frustumCulled = false;
  const update = (time: number, intensity: number) => {
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const life = (time * s.speed + s.off) % 1;
      const a = s.a + time * 0.3 + life * 1.5;
      positions[i * 3] = Math.cos(a) * s.r * (1 - life * 0.3);
      positions[i * 3 + 1] = 0.05 + life * 2.1;
      positions[i * 3 + 2] = Math.sin(a) * s.r * (1 - life * 0.3);
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.45 + 0.5 * intensity;
    mat.size = 0.06 + 0.03 * intensity;
  };
  return { points, update };
}

export interface HsinDialog {
  show: (line: string, index: number, total: number) => void;
  hide: () => void;
  readonly visible: boolean;
  /** Countdown overlay then a flash; resolves when the shutter fires. */
  countdown: () => Promise<void>;
  flash: () => void;
}

/** Visual-novel style dialogue box with a typewriter effect, a "next" button and a photo button. */
export function createDialog(root: HTMLElement, actions: { onNext: () => void; onPhoto: () => void; onClose: () => void }): HsinDialog {
  const box = document.createElement('section');
  box.className = 'hsin-dialog';
  box.setAttribute('aria-live', 'polite');
  box.innerHTML = `
    <div class="hsin-dialog__frame">
      <header class="hsin-dialog__head">
        <span class="hsin-dialog__star" aria-hidden="true">✦</span>
        <span class="hsin-dialog__name">Hsin</span>
        <span class="hsin-dialog__role">Phương Anh · Cosplayer</span>
        <button class="hsin-dialog__close" type="button" aria-label="Đóng">×</button>
      </header>
      <p class="hsin-dialog__text"></p>
      <footer class="hsin-dialog__foot">
        <span class="hsin-dialog__dots" aria-hidden="true"></span>
        <button class="hsin-btn hsin-btn--ghost" type="button" data-act="next">Tiếp ›</button>
        <button class="hsin-btn hsin-btn--gold" type="button" data-act="photo">📸 Chụp hình cùng Hsin</button>
      </footer>
    </div>`;
  root.append(box);
  const text = box.querySelector<HTMLParagraphElement>('.hsin-dialog__text')!;
  const dots = box.querySelector<HTMLSpanElement>('.hsin-dialog__dots')!;
  box.querySelector('[data-act="next"]')!.addEventListener('click', actions.onNext);
  box.querySelector('[data-act="photo"]')!.addEventListener('click', actions.onPhoto);
  box.querySelector('.hsin-dialog__close')!.addEventListener('click', actions.onClose);
  // Keep taps on the box from reaching the 3D view behind it.
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart'] as const) {
    box.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }

  const overlay = document.createElement('div');
  overlay.className = 'hsin-shutter';
  root.append(overlay);

  let current = '';
  let typing = 0;
  let visible = false;
  const show = (line: string, index: number, total: number) => {
    if (!visible) {
      visible = true;
      box.classList.add('is-open');
    }
    dots.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('');
    if (line === current) return;
    current = line;
    window.clearInterval(typing);
    const chars = Array.from(line);
    let n = 0;
    text.textContent = '';
    typing = window.setInterval(() => {
      n++;
      text.textContent = chars.slice(0, n).join('');
      if (n >= chars.length) window.clearInterval(typing);
    }, 32);
  };
  const hide = () => {
    if (!visible) return;
    visible = false;
    current = '';
    window.clearInterval(typing);
    box.classList.remove('is-open');
  };
  const countdown = () => new Promise<void>((resolve) => {
    let n = 3;
    overlay.className = 'hsin-shutter is-count';
    const tick = () => {
      if (n === 0) {
        overlay.className = 'hsin-shutter';
        overlay.textContent = '';
        resolve();
        return;
      }
      overlay.textContent = String(n);
      overlay.classList.remove('pop');
      void overlay.offsetWidth;
      overlay.classList.add('pop');
      n--;
      window.setTimeout(tick, 800);
    };
    tick();
  });
  const flash = () => {
    overlay.className = 'hsin-shutter is-flash';
    window.setTimeout(() => { overlay.className = 'hsin-shutter'; }, 450);
  };
  return { show, hide, countdown, flash, get visible() { return visible; } };
}
