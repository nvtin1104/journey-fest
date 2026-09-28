import * as THREE from 'three';

const PAGE = 2048;
/** Canvas pixels per metre of sign. */
const PX_PER_M = 128;
const MAX_W = 1024;
const PAD = 2;

export const FONT = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

export interface SignStyle {
  code: string;
  name: string;
  /** Accent colour (booth colour). */
  color: string;
  /** Solid fill instead of white background, e.g. for billboards. */
  solid?: boolean;
}

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  geometries: THREE.BufferGeometry[];
  shelfY: number;
  shelfH: number;
  cursorX: number;
}

/** Fits `text` on one line at the largest size ≤ `max` that fits `width`; returns the size used. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number) {
  let size = max;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > min && ctx.measureText(text).width > width) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Splits text into at most two lines that each fit `width`. */
function wrap2(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  if (ctx.measureText(text).width <= width) return [text];
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > width && line) {
      return [line, ellipsize(ctx, words.slice(i).join(' '), width)];
    }
    line = next;
  }
  return [ellipsize(ctx, line, width)];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Readable text colour on top of `bg`. */
function inkFor(bg: string) {
  const c = new THREE.Color(bg);
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return lum > 0.55 ? '#2b2a4a' : '#ffffff';
}

function drawSign(ctx: CanvasRenderingContext2D, w: number, h: number, s: SignStyle) {
  const r = Math.min(10, h * 0.18);
  ctx.save();
  ctx.fillStyle = s.solid ? s.color : '#ffffff';
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.textBaseline = 'middle';

  let textX = h * 0.18;
  let textW = w - h * 0.36;
  if (s.code) {
    // Colour block with the booth code on the left.
    ctx.font = `800 ${Math.round(h * 0.5)}px ${FONT}`;
    const codeSize = fitFont(ctx, s.code, 800, Math.round(h * (s.name ? 0.5 : 0.62)), 10, s.name ? w * 0.45 : w * 0.9);
    const blockW = s.name ? Math.min(w * 0.5, ctx.measureText(s.code).width + h * 0.5) : w;
    ctx.fillStyle = s.color;
    roundRect(ctx, 0, 0, blockW, h, r);
    ctx.fill();
    ctx.fillStyle = inkFor(s.color);
    ctx.font = `800 ${codeSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(s.code, blockW / 2, h / 2 + 1);
    textX = blockW + h * 0.16;
    textW = w - textX - h * 0.14;
  }

  if (s.name && textW > 12) {
    ctx.fillStyle = s.solid ? inkFor(s.color) : '#2b2a4a';
    ctx.textAlign = s.code ? 'left' : 'center';
    const x = s.code ? textX : w / 2;
    const size = fitFont(ctx, s.name, 700, Math.round(h * 0.42), Math.round(h * 0.3), textW);
    ctx.font = `700 ${size}px ${FONT}`;
    if (ctx.measureText(s.name).width <= textW) {
      ctx.fillText(s.name, x, h / 2 + 1);
    } else {
      const small = Math.round(h * 0.3);
      ctx.font = `700 ${small}px ${FONT}`;
      const lines = wrap2(ctx, s.name, textW);
      const lh = small * 1.1;
      lines.forEach((line, i) => ctx.fillText(line, x, h / 2 + (i - (lines.length - 1) / 2) * lh + 1));
    }
  }

  // Thin accent border.
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(2, h * 0.05);
  roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, r);
  ctx.stroke();
  ctx.restore();
}

/**
 * Packs every sign into a few 2048² canvas pages and merges each page's quads into one mesh,
 * so ~400 booth signs cost a handful of draw calls.
 */
export class SignAtlas {
  private pages: Page[] = [];

  private newPage(): Page {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE;
    canvas.height = PAGE;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const page = { canvas, ctx, texture, geometries: [], shelfY: 0, shelfH: 0, cursorX: 0 };
    this.pages.push(page);
    return page;
  }

  private alloc(w: number, h: number): { page: Page; x: number; y: number } {
    let page = this.pages[this.pages.length - 1] ?? this.newPage();
    if (page.cursorX + w + PAD > PAGE) {
      page.shelfY += page.shelfH + PAD;
      page.shelfH = 0;
      page.cursorX = 0;
    }
    if (page.shelfY + h + PAD > PAGE) {
      page = this.newPage();
    }
    const x = page.cursorX;
    const y = page.shelfY;
    page.cursorX += w + PAD;
    page.shelfH = Math.max(page.shelfH, h);
    return { page, x, y };
  }

  /**
   * Adds a sign of `width` × `height` metres. `matrix` places a plane facing local +Z.
   */
  add(style: SignStyle, width: number, height: number, matrix: THREE.Matrix4) {
    let pw = Math.round(width * PX_PER_M);
    let ph = Math.round(height * PX_PER_M);
    if (pw > MAX_W) {
      ph = Math.round((ph * MAX_W) / pw);
      pw = MAX_W;
    }
    pw = Math.max(pw, 32);
    ph = Math.max(ph, 16);
    const { page, x, y } = this.alloc(pw, ph);
    page.ctx.save();
    page.ctx.translate(x, y);
    drawSign(page.ctx, pw, ph, style);
    page.ctx.restore();

    const geo = new THREE.PlaneGeometry(width, height);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (x + u * pw) / PAGE, 1 - (y + (1 - v) * ph) / PAGE);
    }
    geo.applyMatrix4(matrix);
    page.geometries.push(geo);
  }

  /** Merged meshes, one per page. Call once after every sign was added. */
  build(mergeGeometries: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry | null): THREE.Mesh[] {
    return this.pages
      .filter((p) => p.geometries.length > 0)
      .map((p) => {
        p.texture.needsUpdate = true;
        const merged = mergeGeometries(p.geometries)!;
        p.geometries.forEach((g) => g.dispose());
        const mat = new THREE.MeshBasicMaterial({ map: p.texture, toneMapped: false, transparent: true, alphaTest: 0.1 });
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = 'signs';
        return mesh;
      });
  }
}

/** Standalone canvas texture for a floating label (zone names, entrance, etc.). */
export function labelTexture(text: string, opts: { bg?: string; fg?: string; size?: number; icon?: string } = {}) {
  const size = opts.size ?? 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const label = opts.icon ? `${opts.icon}  ${text}` : text;
  ctx.font = `800 ${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(label).width + size * 1.2);
  const h = Math.ceil(size * 1.7);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = opts.bg ?? 'rgba(255,255,255,0.92)';
  roundRect(ctx, 0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = opts.fg ?? '#2b2a4a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, aspect: w / h };
}
