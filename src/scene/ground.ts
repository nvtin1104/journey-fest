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

function plane(r: Rect, y: number, mat: THREE.Material, repeatMeters?: number) {
  const { cx, cz, w, d } = worldRect(r);
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  if (repeatMeters) {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (w / repeatMeters), uv.getY(i) * (d / repeatMeters));
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

  // Sidewalks: sage paving tiles.
  const tileTex = patternTexture(128, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(60,80,70,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
  });
  for (const g of map.grounds.filter((g) => g.kind === 'sidewalk')) {
    group.add(plane(g.rect, LAYER.sidewalk, floorMaterial(tint(g.color, 0.25), tileTex, 1), 1.5));
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
  for (const h of map.halls) group.add(plane(h, LAYER.hall, hallMat, 2));

  for (const z of map.zones) group.add(plane(z.rect, LAYER.zone, floorMaterial(z.color, null, 3)));
  for (const h of map.highlights) group.add(plane(h.rect, LAYER.highlight, floorMaterial(tint(h.color, 0.35), null, 4)));

  // Door mats in every gate.
  const matMat = floorMaterial('#6f86c2', null, 4);
  for (const g of map.gates) group.add(plane(g, LAYER.highlight, matMat));

  return group;
}
