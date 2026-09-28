import * as THREE from 'three';
import { ROOM, WALL } from '../config';
import { worldRect, type Rect } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { Instancer } from './instancer';
import { shade, tint, toonUnique, unitBox } from './materials';

/**
 * Cheap stand-ins for the start screen: one coloured block per stand, room, stage and board,
 * all in a single instanced draw call. Replaced by the detailed scene once the visitor presses Start.
 */
export function buildProxies(map: ParsedMap): THREE.Object3D {
  const blocks = new Instancer();
  const put = (r: Rect, height: number, color: THREE.ColorRepresentation, lift = 0) => {
    const { cx, cz, w, d } = worldRect(r);
    blocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, lift + height / 2, cz), new THREE.Quaternion(), new THREE.Vector3(w, height, d)), color);
  };

  for (const s of map.stands) {
    if (s.kind === 'foodcourt') put(s.rect, 0.1, tint(s.color, 0.4));
    else if (s.kind === 'pavilion') put(s.rect, 3, tint(s.color, 0.2));
    else put(s.rect, 2.2, s.color);
  }
  for (const r of map.rooms) put(r.rect, ROOM.height, r.color);
  for (const s of map.stages) put(s.rect, 1.2, '#5d5a78');
  for (const b of map.billboards) put(b.rect, 2.8, b.color);
  for (const c of map.columns.filter((c) => !c.decor)) put(c.rect, WALL.height, '#d9cff0');
  for (const p of map.signParts) put(p, 0.16, '#7de37b');
  for (const h of map.highlights) put(h.rect, 3.05, shade(h.color, 0.1));

  const mesh = blocks.build(unitBox, toonUnique('#ffffff'), 'overview-proxies');
  mesh.castShadow = false;
  return mesh;
}
