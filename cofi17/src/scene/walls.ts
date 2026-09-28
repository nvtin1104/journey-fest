import * as THREE from 'three';
import { SCALE, WALL } from '../config';
import { toWorldX, toWorldZ, worldRect } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { WALL_T } from '../map/parse';
import { wallRect } from '../map/walls';
import { Instancer } from './instancer';
import { toonUnique, unitBox } from './materials';

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/*
 * Anti-flicker rule for this file: no two differently coloured boxes share a face.
 * The top trim reaches above the wall top, the lintel above the trim and the sealed-hall roof
 * above everything, and each outer layer is a few centimetres wider than the one below it.
 */
const TRIM = { height: 0.2, above: 0.03, grow: 0.06 };
const LINTEL_ABOVE = 0.06;
const ROOF = { thickness: 0.3, above: 0.16, overhang: 0.12 };

/**
 * Hall walls with door openings, plus a roof over sealed halls. Walls and roofs get their own
 * material so the camera can fade just the ones hiding the visitor.
 */
export function buildWalls(map: ParsedMap): { group: THREE.Group; occluders: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = 'walls';
  const occluders: THREE.Mesh[] = [];
  const t = WALL.thickness;
  const H = WALL.height;
  // Trims, skirting boards and door frames are instanced: 3 draw calls instead of ~140.
  const trims = new Instancer();
  const frames = new Instancer();
  const at = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));

  for (const w of map.walls) {
    const r = wallRect(w, WALL_T);
    const cx = toWorldX(r.x + r.w / 2);
    const cz = toWorldZ(r.y + r.h / 2);
    const [sx, sz] = [r.w * SCALE, r.h * SCALE];
    const mesh = box(sx, H, sz, cx, H / 2, cz, toonUnique(WALL.color));
    mesh.name = 'wall';
    group.add(mesh);
    occluders.push(mesh);

    const g = TRIM.grow;
    trims.push(at(sx + g, TRIM.height, sz + g, cx, H + TRIM.above - TRIM.height / 2, cz), '#c8b6f0');
    trims.push(at(sx + g, 0.2, sz + g, cx, 0.1, cz), '#b9acd8');
  }

  // Door frames: dark blue posts and a lintel that caps the wall above the opening.
  const lintelBottom = WALL.doorHeight;
  const lintelTop = H + LINTEL_ABOVE;
  for (const d of map.doors) {
    const len = (d.to - d.from) * SCALE;
    const mid = (d.from + d.to) / 2;
    const horizontal = d.axis === 'h';
    const cx = horizontal ? toWorldX(mid) : toWorldX(d.at);
    const cz = horizontal ? toWorldZ(d.at) : toWorldZ(mid);
    const along = (a: number, b: number, h: number, y: number, off: number) =>
      frames.push(horizontal ? at(a, h, b, cx + off, y, cz) : at(b, h, a, cx, y, cz + off), WALL.doorColor);
    const lh = lintelTop - lintelBottom;
    along(len + 0.34, t + 0.1, lh, lintelBottom + lh / 2, 0);
    along(0.15, t + 0.14, lintelBottom, lintelBottom / 2, -len / 2 - 0.02);
    along(0.15, t + 0.14, lintelBottom, lintelBottom / 2, len / 2 + 0.02);
  }
  group.add(trims.build(unitBox, toonUnique('#ffffff'), 'wall-trims', false), frames.build(unitBox, toonUnique('#ffffff'), 'door-frames'));

  // Halls without doors are closed buildings: a flat roof with a few rooftop units.
  const units = new Instancer();
  for (const h of map.halls.filter((h) => h.sealed)) {
    const { cx, cz, w, d } = worldRect(h);
    const o = WALL.thickness + ROOF.overhang;
    const roof = box(w + o, ROOF.thickness, d + o, cx, H + ROOF.above - ROOF.thickness / 2, cz, toonUnique('#e2d9f5'));
    roof.name = 'roof';
    group.add(roof);
    occluders.push(roof);
    const top = H + ROOF.above;
    const n = Math.max(2, Math.floor(w / 25));
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + (w / n) * (i + 0.5);
      units.push(at(2.4, 1.1, 1.6, x, top + 0.55, cz - d * 0.15), '#cfc6e6');
    }
  }
  group.add(units.build(unitBox, toonUnique('#ffffff'), 'roof-units'));

  return { group, occluders };
}
