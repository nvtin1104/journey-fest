import * as THREE from 'three';
import { SCALE } from '../config';
import { worldRect, type Rect } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { toonGradient, tint } from './materials';

/** Floor layers, bottom to top. Each gets its own height and polygon offset to avoid z-fighting. */
const LAYER = { grass: -0.03, road: 0, sidewalk: 0.012, hall: 0.024, zone: 0.036, highlight: 0.048 };

function patternTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function floorMaterial(color: THREE.ColorRepresentation, map: THREE.Texture | null, offset: number) {
  return new THREE.MeshToonMaterial({
    color,
    map,
    gradientMap: toonGradient(),
    polygonOffset: true,
    polygonOffsetFactor: -offset,
    polygonOffsetUnits: -offset * 4,
  });
}

function subtractRect(subj: Rect, clipper: Rect): Rect[] {
  const ox1 = Math.max(subj.x, clipper.x);
  const oy1 = Math.max(subj.y, clipper.y);
  const ox2 = Math.min(subj.x + subj.w, clipper.x + clipper.w);
  const oy2 = Math.min(subj.y + subj.h, clipper.y + clipper.h);
  if (ox1 >= ox2 || oy1 >= oy2) return [subj];

  const pieces: Rect[] = [];
  if (subj.x < ox1) {
    pieces.push({ x: subj.x, y: subj.y, w: ox1 - subj.x, h: subj.h });
  }
  if (ox2 < subj.x + subj.w) {
    pieces.push({ x: ox2, y: subj.y, w: subj.x + subj.w - ox2, h: subj.h });
  }
  if (subj.y < oy1) {
    pieces.push({ x: ox1, y: subj.y, w: ox2 - ox1, h: oy1 - subj.y });
  }
  if (oy2 < subj.y + subj.h) {
    pieces.push({ x: ox1, y: oy2, w: ox2 - ox1, h: subj.y + subj.h - oy2 });
  }
  return pieces;
}

function plane(r: Rect, y: number, mat: THREE.Material, repeatMeters?: number, alignWorld = false) {
  const { cx, cz, w, d } = worldRect(r);
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  if (repeatMeters) {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    if (alignWorld) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const wx = cx + pos.getX(i);
        const wz = cz + pos.getZ(i);
        uv.setXY(i, wx / repeatMeters, wz / repeatMeters);
      }
    } else {
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * (w / repeatMeters), uv.getY(i) * (d / repeatMeters));
      }
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, y, cz);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGround(map: ParsedMap): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground';

  // Grass around the venue.
  const b = worldRect(map.bounds);
  const grassTex = patternTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d4ecc9';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#c6e4ba';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
  });
  const grassGeo = new THREE.PlaneGeometry(b.w + 400, b.d + 400);
  grassGeo.rotateX(-Math.PI / 2);
  const uv = grassGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (b.w + 400) / 4, uv.getY(i) * (b.d + 400) / 4);
  const grass = new THREE.Mesh(grassGeo, floorMaterial('#ffffff', grassTex, 0));
  grass.position.set(b.cx, LAYER.grass, b.cz);
  grass.receiveShadow = true;
  group.add(grass);

  // Roads: asphalt with a dashed centre line running along the long side.
  const roadTex = patternTexture(128, (ctx, s) => {
    ctx.fillStyle = '#7b7b86';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fdfdf5';
    ctx.fillRect(s / 2 - 3, s * 0.1, 6, s * 0.45);
  });
  for (const g of map.grounds.filter((g) => g.kind === 'road')) {
    const vertical = g.rect.h > g.rect.w;
    const tex = roadTex.clone();
    tex.repeat.set(1, ((vertical ? g.rect.h : g.rect.w) * SCALE) / 5);
    const mesh = plane(g.rect, LAYER.road, floorMaterial('#ffffff', tex, 0));
    if (!vertical) {
      // Texture V must run along the road's length.
      const uvs = mesh.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getY(i), uvs.getX(i));
    }
    group.add(mesh);
  }

  // Parking bays: light asphalt and white markings, with a clear middle aisle.
  const parkingTex = patternTexture(256, (ctx, size) => {
    ctx.fillStyle = '#a7b4bf'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#f9fbff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 0.3, 0);
    ctx.lineTo(size * 0.3, size); ctx.lineTo(0, size);
    ctx.moveTo(size, 0); ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(size * 0.7, size); ctx.lineTo(size, size); ctx.stroke();
  });
  for (const g of map.grounds.filter((g) => g.kind === 'parking')) {
    const texture = parkingTex.clone();
    texture.repeat.set(1, g.rect.h / 120);
    group.add(plane(g.rect, LAYER.sidewalk, floorMaterial('#ffffff', texture, 1)));
  }

  // Sidewalks: sage paving tiles.
  const tileTex = patternTexture(128, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(60,80,70,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
  });
  // Resolve overlaps between sidewalks so no two meshes share the same space (prevents z-fighting).
  const rawSidewalks = map.grounds.filter((g) => g.kind === 'sidewalk');
  const verticals = rawSidewalks.filter((s) => s.rect.h > s.rect.w);
  const horizontals = rawSidewalks.filter((s) => s.rect.w >= s.rect.h);

  const resolvedSidewalks: Array<{ rect: Rect; color: string }> = [...verticals];
  for (const h of horizontals) {
    let parts: Rect[] = [h.rect];
    for (const v of verticals) {
      const nextParts: Rect[] = [];
      for (const p of parts) {
        nextParts.push(...subtractRect(p, v.rect));
      }
      parts = nextParts;
    }
    for (const p of parts) {
      resolvedSidewalks.push({ rect: p, color: h.color });
    }
  }

  for (const sw of resolvedSidewalks) {
    group.add(plane(sw.rect, LAYER.sidewalk, floorMaterial(tint(sw.color, 0.25), tileTex, 1), 1.5, true));
  }

  // Hall floors: soft lavender with a 2 m grid.
  const gridTex = patternTexture(256, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(120,90,170,0.10)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
  });
  const hallMat = floorMaterial('#f7f1fe', gridTex, 2);
  for (const h of map.halls) if (!h.sealed) group.add(plane(h, LAYER.hall, hallMat, 2));

  for (const z of map.zones) group.add(plane(z.rect, LAYER.zone, floorMaterial(z.color, null, 3)));
  for (const h of map.highlights) group.add(plane(h.rect, LAYER.highlight, floorMaterial(tint(h.color, 0.35), null, 4)));

  // Door mats in every gate.
  const matMat = floorMaterial('#6f86c2', null, 4);
  for (const g of map.gates) group.add(plane(g, LAYER.highlight, matMat));

  return group;
}
