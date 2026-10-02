import * as THREE from 'three';
import { BOOTH, PAVILION, SCALE } from '../config';
import { facingAngle, facingVector, overlapArea, worldRect } from '../map/coords';
import type { ParsedMap, Stand } from '../map/parse';
import { toonUnique, tint, unitBox } from './materials';
import { Instancer } from './instancer';
import { SIGN_GAP, type SignAtlas } from './signAtlas';
import { boothConfig } from '../booth/C17-C18/config';
import { boothConfig as a9BoothConfig } from '../booth/A9/config';
import { boothConfig as n22BoothConfig } from '../booth/N22/config';

const FRAME_COLOR = '#b8b2d6';
const MERCH_COLORS = ['#ffb3c7', '#ffd88a', '#a8e6cf', '#9ed7ff', '#d3b5ff', '#ffc3a0', '#fff1a8', '#b5f0ff'];

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Width along the counter and depth behind it, in metres, for a stand's facing. */
export function standSize(s: Stand) {
  const along = s.facing === 'N' || s.facing === 'S';
  return { W: (along ? s.rect.w : s.rect.h) * SCALE, D: (along ? s.rect.h : s.rect.w) * SCALE };
}

/** Point in front of a stand's counter plus the heading that looks at it. */
export function standFront(s: Stand, gap = 1.3) {
  const { cx, cz } = worldRect(s.rect);
  const f = facingVector(s.facing);
  const { D } = standSize(s);
  return {
    x: cx + f.x * (D / 2 + gap),
    z: cz + f.z * (D / 2 + gap),
    heading: Math.atan2(-f.x, -f.z),
    cameraYaw: Math.atan2(f.x, f.z),
  };
}

/** World transform of a stand: origin at its centre on the floor, local +Z towards its front. */
export function standMatrix(s: Stand) {
  const { cx, cz } = worldRect(s.rect);
  return new THREE.Matrix4().makeRotationY(facingAngle(s.facing)).setPosition(cx, 0, cz);
}

interface Parts {
  body: Instancer;
  frame: Instancer;
  top: Instancer;
  merch: Instancer;
}

function partMatrix(base: THREE.Matrix4, w: number, h: number, d: number, x: number, y: number, z: number) {
  const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
  return base.clone().multiply(local);
}

function signMatrix(base: THREE.Matrix4, x: number, y: number, z: number, rotY = 0) {
  const local = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
  return base.clone().multiply(local);
}

function merchOnCounter(parts: Parts, base: THREE.Matrix4, s: Stand, W: number, counterZ: number, counterDepth: number, topY: number) {
  const rand = rng(hashSeed(s.id));
  const n = 2 + Math.floor(rand() * 3);
  const slot = (W - 0.4) / n;
  for (let i = 0; i < n; i++) {
    const w = 0.14 + rand() * 0.22;
    const h = 0.08 + rand() * 0.3;
    const d = 0.12 + rand() * Math.min(0.25, counterDepth * 0.5);
    const x = -W / 2 + 0.2 + slot * (i + 0.5) + (rand() - 0.5) * slot * 0.3;
    const z = counterZ + (rand() - 0.5) * counterDepth * 0.3;
    parts.merch.push(partMatrix(base, w, h, d, x, topY + h / 2, z), MERCH_COLORS[Math.floor(rand() * MERCH_COLORS.length)]);
  }
}

/** Shell-scheme stall: counter box, four-post frame, low back panel and a title board on top. */
function buildBooth(parts: Parts, atlas: SignAtlas, s: Stand) {
  const base = standMatrix(s);
  const { W, D } = standSize(s);
  const counterDepth = THREE.MathUtils.clamp(D * BOOTH.counterDepthRatio, 0.5, 1.2);
  const counterZ = D / 2 - counterDepth / 2 - 0.03;
  const h = BOOTH.counterHeight;
  const featured = s.id === boothConfig.id || s.id === a9BoothConfig.id || s.id === n22BoothConfig.id;
  const isN22 = s.id === n22BoothConfig.id;
  const wallH = BOOTH.postHeight - 0.1;

  if (isN22) {
    // Open photo booth: one tall display wall at the back carries the name, banner and samples.
    parts.body.push(partMatrix(base, W - 0.12, wallH, 0.08, 0, wallH / 2, -D / 2 + 0.06), tint(s.color, 0.55));
  } else {
    parts.body.push(partMatrix(base, W - 0.12, h - 0.04, counterDepth, 0, (h - 0.04) / 2, counterZ), s.color);
    parts.body.push(partMatrix(base, W - 0.1, 0.1, 0.02, 0, h * 0.72, counterZ + counterDepth / 2 + 0.005), tint(s.color, 0.65));
    parts.top.push(partMatrix(base, W - 0.06, 0.05, counterDepth + 0.06, 0, h - 0.015, counterZ));
    if (s.id !== boothConfig.id) {
      parts.body.push(partMatrix(base, W - 0.1, BOOTH.backPanelHeight, 0.05, 0, BOOTH.backPanelHeight / 2, -D / 2 + 0.06), tint(s.color, 0.55));
    }
  }

  const p = BOOTH.postSize;
  const ph = BOOTH.postHeight;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.frame.push(partMatrix(base, p, ph, p, sx * (W / 2 - p), ph / 2, sz * (D / 2 - p)));
    parts.frame.push(partMatrix(base, p, p, D, sx * (W / 2 - p), ph - p / 2, 0));
  }
  parts.frame.push(partMatrix(base, W, p, p, 0, ph - p / 2, -D / 2 + p));

  const fh = BOOTH.fasciaHeight;
  if (isN22) {
    // The name board lives on the display wall instead of a front fascia.
    atlas.add({ code: s.code, name: s.name, color: s.color }, W - 0.24, fh - 0.04, signMatrix(base, 0, wallH - fh / 2 - 0.06, -D / 2 + 0.13 + SIGN_GAP));
  } else {
    const fy = ph - fh / 2 + 0.02;
    // The board sits just in front of the posts so no faces are shared (shared faces flicker).
    const fz = D / 2 + 0.005;
    parts.body.push(partMatrix(base, W + 0.04, fh + 0.04, 0.06, 0, fy, fz), s.color);
    const bannerWidth = s.id === boothConfig.id ? (fh - 0.04) * (3543 / 1063) : 0;
    const titleWidth = W - 0.04 - bannerWidth;
    atlas.add({ code: s.code, name: s.name, color: s.color }, titleWidth, fh - 0.04, signMatrix(base, -bannerWidth / 2, fy, fz + 0.03 + SIGN_GAP));
  }
  if (!featured) merchOnCounter(parts, base, s, W, counterZ, counterDepth, h + 0.01);
}

/** Large island stand: raised floor, tall corner posts, title boards on all four sides and a front counter. */
function buildPavilion(parts: Parts, atlas: SignAtlas, s: Stand, accent: string) {
  const base = standMatrix(s);
  const { W, D } = standSize(s);
  const fh = PAVILION.floorHeight;
  const ph = PAVILION.postHeight;
  const hh = PAVILION.headerHeight;
  const post = 0.14;

  parts.body.push(partMatrix(base, W, fh, D, 0, fh / 2, 0), tint(s.color, 0.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.frame.push(partMatrix(base, post, ph, post, sx * (W / 2 - post / 2), ph / 2, sz * (D / 2 - post / 2)));
  }

  // Header ring and signs on all four sides.
  // Header boards reach slightly above the posts so their tops never coincide.
  const hy = ph - hh / 2 + 0.03;
  const style = { code: s.code, name: s.name, color: accent };
  const sides: Array<{ len: number; x: number; z: number; rot: number; alongX: boolean }> = [
    { len: W, x: 0, z: D / 2, rot: 0, alongX: true },
    { len: W, x: 0, z: -D / 2, rot: Math.PI, alongX: true },
    { len: D, x: W / 2, z: 0, rot: Math.PI / 2, alongX: false },
    { len: D, x: -W / 2, z: 0, rot: -Math.PI / 2, alongX: false },
  ];
  for (const side of sides) {
    const [w, d] = side.alongX ? [side.len, 0.1] : [0.1, side.len];
    parts.body.push(partMatrix(base, w, hh, d, side.x, hy, side.z), accent);
    const nx = side.alongX ? 0 : Math.sign(side.x) * (0.05 + SIGN_GAP);
    const nz = side.alongX ? Math.sign(side.z) * (0.05 + SIGN_GAP) : 0;
    atlas.add(style, side.len - 0.2, hh - 0.08, signMatrix(base, side.x + nx, hy, side.z + nz, side.rot));
  }

  // Brand wall at the back, counter at the front, a few display tables in between.
  parts.body.push(partMatrix(base, W - 0.3, 2.6, 0.12, 0, fh + 1.3, -D / 2 + 0.25), tint(accent, 0.35));
  const cw = Math.min(W * 0.6, 6);
  const cd = 0.7;
  const cz = D / 2 - 0.6;
  parts.body.push(partMatrix(base, cw, 0.9, cd, 0, fh + 0.45, cz), s.color);
  parts.top.push(partMatrix(base, cw + 0.06, 0.05, cd + 0.06, 0, fh + 0.92, cz));
  merchOnCounter(parts, base, { ...s, id: `${s.id}:counter` }, cw, cz, cd, fh + 0.95);
  const rand = rng(hashSeed(s.id));
  const tables = Math.max(1, Math.min(3, Math.floor(W / 3)));
  for (let i = 0; i < tables; i++) {
    const x = -W / 2 + (W / tables) * (i + 0.5);
    const z = -D * 0.1;
    parts.body.push(partMatrix(base, 1.1, 0.75, 0.7, x, fh + 0.375, z), tint(s.color, 0.3));
    parts.merch.push(partMatrix(base, 0.5, 0.25, 0.35, x, fh + 0.875, z), MERCH_COLORS[Math.floor(rand() * MERCH_COLORS.length)]);
  }
}

/** Round tables with stools for the food court. */
function buildFoodCourt(map: ParsedMap): THREE.Object3D[] {
  const tables = map.props.filter((p) => p.kind === 'table');
  const top = new Instancer();
  const leg = new Instancer();
  const stool = new Instancer();
  for (const t of tables) {
    const { cx, cz } = worldRect(t.rect);
    const at = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    top.push(at(cx, 0.74, cz, 0.6, 0.04, 0.6), '#ffffff');
    leg.push(at(cx, 0.37, cz, 0.08, 0.72, 0.08), '#8d86b0');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      stool.push(at(cx + Math.cos(a) * 0.85, 0.23, cz + Math.sin(a) * 0.85, 0.22, 0.46, 0.22), ['#ffd88a', '#ffb3c7', '#a8e6cf', '#9ed7ff'][k]);
    }
  }
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  const white = toonUnique('#ffffff');
  return [
    top.build(cyl, white, 'foodcourt-tables'),
    leg.build(cyl, white, 'foodcourt-legs'),
    stool.build(cyl, white, 'foodcourt-stools'),
  ];
}

export function buildStands(map: ParsedMap, atlas: SignAtlas): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stands';
  const parts: Parts = { body: new Instancer(), frame: new Instancer(), top: new Instancer(), merch: new Instancer() };

  for (const s of map.stands) {
    if (s.kind === 'booth' || s.kind === 'stall') buildBooth(parts, atlas, s);
    else if (s.kind === 'pavilion') {
      const hl = map.highlights.find((h) => overlapArea(h.rect, s.rect) > 0);
      buildPavilion(parts, atlas, s, hl ? hl.color : s.color);
    }
  }

  const white = toonUnique('#ffffff');
  group.add(
    parts.body.build(unitBox, white, 'stand-body'),
    parts.frame.build(unitBox, toonUnique(FRAME_COLOR), 'stand-frame'),
    parts.top.build(unitBox, toonUnique('#ffffff'), 'stand-top', false),
    parts.merch.build(unitBox, toonUnique('#ffffff'), 'stand-merch'),
    ...buildFoodCourt(map),
  );

  // Decorative blocks inside pavilions (e.g. Trading Town).
  const decor = new Instancer();
  for (const c of map.columns.filter((c) => c.decor)) {
    const { cx, cz, w, d } = worldRect(c.rect);
    decor.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, 0.5, cz), new THREE.Quaternion(), new THREE.Vector3(w, 0.9, d)), '#3a3550');
  }
  group.add(decor.build(unitBox, toonUnique('#ffffff'), 'decor'));

  return group;
}
