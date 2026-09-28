import { ORIGIN, SCALE } from '../config';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Facing = 'N' | 'S' | 'E' | 'W';

export const toWorldX = (x: number) => (x - ORIGIN.x) * SCALE;
export const toWorldZ = (y: number) => (y - ORIGIN.y) * SCALE;
export const toMapX = (wx: number) => wx / SCALE + ORIGIN.x;
export const toMapY = (wz: number) => wz / SCALE + ORIGIN.y;

/** World-space centre and size (metres) of a map rect. */
export function worldRect(r: Rect) {
  return {
    cx: toWorldX(r.x + r.w / 2),
    cz: toWorldZ(r.y + r.h / 2),
    w: r.w * SCALE,
    d: r.h * SCALE,
  };
}

/** Unit vector (world XZ) pointing out of the facing side. N is up on the map = −Z. */
export function facingVector(f: Facing): { x: number; z: number } {
  switch (f) {
    case 'N': return { x: 0, z: -1 };
    case 'S': return { x: 0, z: 1 };
    case 'E': return { x: 1, z: 0 };
    case 'W': return { x: -1, z: 0 };
  }
}

/** Y rotation that turns a local +Z front towards the facing side. */
export function facingAngle(f: Facing): number {
  switch (f) {
    case 'S': return 0;
    case 'N': return Math.PI;
    case 'E': return Math.PI / 2;
    case 'W': return -Math.PI / 2;
  }
}

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const containsRect = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function unionRect(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
