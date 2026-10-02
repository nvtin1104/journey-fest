import { SCALE } from '../config';
import { toWorldX, toWorldZ, type Rect } from './coords';
import { WALL_T, type ParsedMap, type Stand } from './parse';
import { wallRect } from './walls';
import { boothConfig as n22BoothConfig } from '../booth/N22/config';

/** Axis-aligned box on the ground plane, in world metres. */
export interface AABB {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const aabbFromRect = (r: Rect, pad = 0): AABB => ({
  minX: toWorldX(r.x) - pad,
  minZ: toWorldZ(r.y) - pad,
  maxX: toWorldX(r.x + r.w) + pad,
  maxZ: toWorldZ(r.y + r.h) + pad,
});

/** Circle-vs-AABB collision over a uniform spatial hash. */
export class CollisionWorld {
  private cells = new Map<string, AABB[]>();

  constructor(readonly boxes: AABB[], private cellSize = 5) {
    for (const b of boxes) {
      for (let i = this.cell(b.minX); i <= this.cell(b.maxX); i++) {
        for (let j = this.cell(b.minZ); j <= this.cell(b.maxZ); j++) {
          const key = `${i},${j}`;
          const list = this.cells.get(key);
          if (list) list.push(b);
          else this.cells.set(key, [b]);
        }
      }
    }
  }

  private cell(v: number) {
    return Math.floor(v / this.cellSize);
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): AABB[] {
    const found = new Set<AABB>();
    for (let i = this.cell(minX); i <= this.cell(maxX); i++) {
      for (let j = this.cell(minZ); j <= this.cell(maxZ); j++) {
        for (const b of this.cells.get(`${i},${j}`) ?? []) found.add(b);
      }
    }
    return [...found];
  }

  /** Pushes a circle out of every box it overlaps. Returns the corrected position. */
  resolve(x: number, z: number, r: number): { x: number; z: number } {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.query(x - r, z - r, x + r, z + r)) {
        const cx = Math.min(Math.max(x, b.minX), b.maxX);
        const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (r - d);
          z += (dz / d) * (r - d);
        } else {
          // Centre is inside the box: leave through the nearest face.
          const pushes = [
            { dx: b.minX - r - x, dz: 0 },
            { dx: b.maxX + r - x, dz: 0 },
            { dx: 0, dz: b.minZ - r - z },
            { dx: 0, dz: b.maxZ + r - z },
          ];
          pushes.sort((a, c) => Math.abs(a.dx + a.dz) - Math.abs(c.dx + c.dz));
          x += pushes[0].dx;
          z += pushes[0].dz;
        }
      }
      if (!moved) break;
    }
    return { x, z };
  }

  isFree(x: number, z: number, r: number): boolean {
    return this.query(x - r, z - r, x + r, z + r).every((b) => {
      const cx = Math.min(Math.max(x, b.minX), b.maxX);
      const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
      return (x - cx) ** 2 + (z - cz) ** 2 >= r * r;
    });
  }

  /** Nearest free spot to (x, z) on a spiral search, or null if none within `maxDist` metres. */
  nearestFree(x: number, z: number, r: number, maxDist = 20): { x: number; z: number } | null {
    if (this.isFree(x, z, r)) return { x, z };
    for (let d = 0.25; d <= maxDist; d += 0.25) {
      const steps = Math.max(8, Math.round((2 * Math.PI * d) / 0.25));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        if (this.isFree(px, pz, r)) return { x: px, z: pz };
      }
    }
    return null;
  }
}

/** Thin strip along a stand's back edge: open booths keep only their display wall solid. */
function backStrip(s: Stand): Rect {
  const t = 10;
  const r = s.rect;
  switch (s.facing) {
    case 'N': return { x: r.x, y: r.y + r.h - t, w: r.w, h: t };
    case 'S': return { x: r.x, y: r.y, w: r.w, h: t };
    case 'E': return { x: r.x, y: r.y, w: t, h: r.h };
    case 'W': return { x: r.x + r.w - t, y: r.y, w: t, h: r.h };
  }
}

/** Everything the visitor can't walk through, in world space. */
export function buildColliders(map: ParsedMap): CollisionWorld {
  const boxes: AABB[] = [];
  const push = (r: Rect, pad = 0) => boxes.push(aabbFromRect(r, pad));

  for (const w of map.walls) push(wallRect(w, WALL_T));
  for (const s of map.stands) {
    if (s.kind === 'foodcourt') continue;
    if (s.id === n22BoothConfig.id) push(backStrip(s));
    else push(s.rect);
  }
  for (const r of map.rooms) push(r.rect);
  for (const b of map.billboards) push(b.rect);
  for (const c of map.columns) if (!c.decor) push(c.rect, 0.1);
  for (const s of map.stages) push(s.rect);
  for (const p of map.props) push(p.rect);
  for (const g of map.grounds) if (g.kind === 'road') push(g.rect);

  // Keep the visitor inside the map.
  const b = map.bounds;
  const t = 2 / SCALE;
  push({ x: b.x - t, y: b.y - t, w: b.w + 2 * t, h: t });
  push({ x: b.x - t, y: b.y + b.h, w: b.w + 2 * t, h: t });
  push({ x: b.x - t, y: b.y, w: t, h: b.h });
  push({ x: b.x + b.w, y: b.y, w: t, h: b.h });

  return new CollisionWorld(boxes);
}
