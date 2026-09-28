import * as THREE from 'three';
import { SCALE, WALL } from '../config';
import { toWorldX, toWorldZ } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { WALL_T } from '../map/parse';
import { wallRect } from '../map/walls';
import { toon, toonUnique, unitBox } from './materials';

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Hall walls with door openings. Each wall gets its own material so the camera can fade
 * just the walls that hide the visitor.
 */
export function buildWalls(map: ParsedMap): { group: THREE.Group; occluders: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = 'walls';
  const occluders: THREE.Mesh[] = [];
  const t = WALL.thickness;

  for (const w of map.walls) {
    const r = wallRect(w, WALL_T);
    const cx = toWorldX(r.x + r.w / 2);
    const cz = toWorldZ(r.y + r.h / 2);
    const mat = toonUnique(WALL.color, { transparent: true, opacity: 1 });
    const mesh = box(r.w * SCALE, WALL.height, r.h * SCALE, cx, WALL.height / 2, cz, mat);
    mesh.name = 'wall';
    group.add(mesh);
    occluders.push(mesh);
    // Coloured trim along the top and a darker skirting board.
    const trim = box(r.w * SCALE + 0.02, 0.18, r.h * SCALE + 0.02, cx, WALL.height - 0.09, cz, toon('#c8b6f0'));
    trim.castShadow = false;
    const skirt = box(r.w * SCALE + 0.04, 0.2, r.h * SCALE + 0.04, cx, 0.1, cz, toon('#b9acd8'));
    skirt.castShadow = false;
    group.add(trim, skirt);
  }

  // Door frames: dark blue posts and a lintel above the opening.
  const frameMat = toon(WALL.doorColor);
  const lintelH = WALL.height - WALL.doorHeight;
  for (const d of map.doors) {
    const len = (d.to - d.from) * SCALE;
    const mid = (d.from + d.to) / 2;
    const horizontal = d.axis === 'h';
    const cx = horizontal ? toWorldX(mid) : toWorldX(d.at);
    const cz = horizontal ? toWorldZ(d.at) : toWorldZ(mid);
    const along = (a: number, b: number, h: number, y: number, off: number) =>
      horizontal ? box(a, h, b, cx + off, y, cz, frameMat) : box(b, h, a, cx, y, cz + off, frameMat);
    group.add(along(len + 0.3, t + 0.1, lintelH, WALL.doorHeight + lintelH / 2, 0));
    group.add(along(0.15, t + 0.14, WALL.doorHeight, WALL.doorHeight / 2, -len / 2 - 0.02));
    group.add(along(0.15, t + 0.14, WALL.doorHeight, WALL.doorHeight / 2, len / 2 + 0.02));
  }

  return { group, occluders };
}
