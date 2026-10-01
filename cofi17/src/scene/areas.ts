import * as THREE from 'three';
import { ROOM, SCALE, WALL } from '../config';
import { facingAngle, toWorldX, toWorldZ, unionRect, worldRect, type Facing, type Rect } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { Instancer } from './instancer';
import { shade, tint, toon, toonUnique, unitBox } from './materials';
import { FONT, labelTexture, SIGN_GAP, type SignAtlas } from './signAtlas';

function frameOf(r: Rect, facing: Facing) {
  const { cx, cz } = worldRect(r);
  const along = facing === 'N' || facing === 'S';
  return {
    base: new THREE.Matrix4().makeRotationY(facingAngle(facing)).setPosition(cx, 0, cz),
    W: (along ? r.w : r.h) * SCALE,
    D: (along ? r.h : r.w) * SCALE,
  };
}

function local(base: THREE.Matrix4, w: number, h: number, d: number, x: number, y: number, z: number) {
  return base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
}

function place(base: THREE.Matrix4, x: number, y: number, z: number, rotY = 0) {
  return base.clone().multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));
}

function meshAt(mat: THREE.Material, m: THREE.Matrix4, geo: THREE.BufferGeometry = unitBox) {
  const mesh = new THREE.Mesh(geo, mat);
  m.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Camera-facing text label, `height` metres tall. */
export function makeLabel(text: string, height: number, opts: Parameters<typeof labelTexture>[1] = {}) {
  const { texture, aspect } = labelTexture(text, opts);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(height * aspect, height, 1);
  sprite.renderOrder = 2;
  return sprite;
}

function screenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 1024, 384);
  g.addColorStop(0, '#ff8fd1');
  g.addColorStop(0.5, '#b58cff');
  g.addColorStop(1, '#7cc8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 384);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 384, 10 + Math.random() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 120px ${FONT}`;
  ctx.fillText('COLOR FIESTA', 512, 170);
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText('MAIN STAGE', 512, 280);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface AreasResult {
  group: THREE.Group;
  occluders: THREE.Mesh[];
  /** Per-frame animation (entrance marker bobbing, stage lights). */
  update: (t: number) => void;
}

export function buildAreas(map: ParsedMap, atlas: SignAtlas): AreasResult {
  const group = new THREE.Group();
  group.name = 'areas';
  const occluders: THREE.Mesh[] = [];
  const animated: Array<(t: number) => void> = [];

  for (const hall of map.halls) {
    if (!hall.label || hall.sealed) continue;
    const { cx, cz, d } = worldRect(hall);
    const label = makeLabel(hall.label, 1.25, { bg: '#38528f', fg: '#ffffff', size: 48 });
    label.position.set(cx, WALL.height + 1, cz - d / 2 + 2);
    group.add(label);
  }
  for (const parking of map.grounds.filter((g) => g.kind === 'parking')) {
    const { cx, cz } = worldRect(parking.rect);
    const label = makeLabel('P · BÃI GIỮ XE', 1.6, { bg: '#38528f', fg: '#ffffff', size: 48 });
    label.position.set(cx, 3.5, cz);
    group.add(label);
  }
  for (const [i, car] of map.props.filter((p) => p.kind === 'parked-car').entries()) {
    const { cx, cz, w, d } = worldRect(car.rect);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), toon(['#7d9ab8', '#eee8db', '#ab858c'][i % 3]));
    body.position.set(cx, 0.55, cz); body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.6, d * 0.55), toon('#465a70'));
    roof.position.set(cx, 1.2, cz);
    group.add(body, roof);
  }

  // Closed back-of-house rooms, WCs and the VIP room: solid blocks with a door and a sign.
  // Bodies stay separate meshes (each fades on its own); roof caps and doors are instanced.
  const roomParts = new Instancer();
  for (const r of map.rooms) {
    const { base, W, D } = frameOf(r.rect, r.facing);
    const body = meshAt(toonUnique(r.color), local(base, W - 0.1, ROOM.height, D - 0.1, 0, ROOM.height / 2, 0));
    body.name = 'room';
    group.add(body);
    occluders.push(body);
    roomParts.push(local(base, W + 0.1, 0.16, D + 0.1, 0, ROOM.height + 0.08, 0), shade(r.color, 0.25));
    const doorW = Math.min(1.4, W * 0.4);
    roomParts.push(local(base, doorW, 2.2, 0.06, 0, 1.1, D / 2 - 0.03), '#7c6fa6');
    if (r.showLabel) {
      atlas.add({ code: '', name: r.label, color: '#6c5fa0' }, Math.min(W * 0.8, 4), 0.5, place(base, 0, 2.6, D / 2 - 0.05 + SIGN_GAP));
      const tag = makeLabel(r.label, 0.8, { bg: 'rgba(108,95,160,0.9)', fg: '#ffffff', size: 48 });
      tag.position.set(toWorldX(r.rect.x + r.rect.w / 2), ROOM.height + 1, toWorldZ(r.rect.y + r.rect.h / 2));
      group.add(tag);
    }
  }

  group.add(roomParts.build(unitBox, toonUnique('#ffffff'), 'room-parts'));

  // Standing boards (MENU OC & PET, ARTIST ALLEY MAP…).
  for (const b of map.billboards) {
    const { base, W } = frameOf(b.rect, b.facing);
    const h = 2.4;
    const bottom = 0.4;
    group.add(meshAt(toon(b.color), local(base, W, h + 0.12, 0.12, 0, bottom + h / 2, 0)));
    for (const sx of [-1, 1]) group.add(meshAt(toon('#8d86b0'), local(base, 0.1, bottom + 0.1, 0.1, sx * (W / 2 - 0.4), (bottom + 0.1) / 2, 0)));
    atlas.add({ code: '', name: b.label, color: b.color, solid: true }, W - 0.2, h - 0.2, place(base, 0, bottom + h / 2, 0.06 + SIGN_GAP));
  }

  // Structural pillars.
  const pillars = new Instancer();
  const caps = new Instancer();
  for (const c of map.columns.filter((c) => !c.decor)) {
    const { cx, cz } = worldRect(c.rect);
    const at = (y: number, s: number, h: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(cx, y, cz), new THREE.Quaternion(), new THREE.Vector3(s, h, s));
    pillars.push(at(WALL.height / 2, 0.5, WALL.height), '#d9cff0');
    caps.push(at(WALL.height - 0.1, 0.62, 0.2), '#c8b6f0');
    caps.push(at(0.1, 0.62, 0.2), '#b9acd8');
  }
  group.add(pillars.build(unitBox, toonUnique('#ffffff'), 'pillars'), caps.build(unitBox, toonUnique('#ffffff'), 'pillar-caps'));

  // Main stage: platform, LED backdrop, truss with spotlights, speakers.
  for (const s of map.stages) {
    const { base, W, D } = frameOf(s.rect, s.facing);
    const ph = 1.2;
    group.add(meshAt(toon('#5d5a78'), local(base, W, ph, D, 0, ph / 2, 0)));
    group.add(meshAt(toon('#6f6b8e'), local(base, W - 0.1, 0.04, D - 0.1, 0, ph + 0.02, 0)));
    const strip = meshAt(new THREE.MeshBasicMaterial({ color: '#ff8fd1' }), local(base, W, 0.08, 0.04, 0, ph - 0.1, D / 2 + 0.02));
    strip.castShadow = false;
    group.add(strip);
    const sh = 4.2;
    group.add(meshAt(toon('#2e2b40'), local(base, W - 0.6, sh + 0.3, 0.3, 0, ph + sh / 2, -D / 2 + 0.3)));
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, sh - 0.4), screenMat);
    place(base, 0, ph + sh / 2, -D / 2 + 0.45 + SIGN_GAP).decompose(screen.position, screen.quaternion, screen.scale);
    group.add(screen);
    const trussMat = toon('#cfd3e6');
    const th = ph + sh + 1.6;
    for (const sx of [-1, 1]) group.add(meshAt(trussMat, local(base, 0.35, th, 0.35, sx * (W / 2 + 0.3), th / 2, -D / 2 + 0.3)));
    group.add(meshAt(trussMat, local(base, W + 0.95, 0.35, 0.35, 0, th, -D / 2 + 0.3)));
    group.add(meshAt(trussMat, local(base, W + 0.95, 0.35, 0.35, 0, th, D / 2 - 0.3)));
    for (const sx of [-1, 1]) group.add(meshAt(trussMat, local(base, 0.35, 0.35, D - 0.6, sx * (W / 2 + 0.3), th, 0)));
    const lampGeo = new THREE.CylinderGeometry(0.16, 0.24, 0.45, 12);
    const lampColors = ['#ff8fd1', '#9ed7ff', '#ffe666', '#b5ffb0', '#d3b5ff'];
    const lamps: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + (W / 5) * (i + 0.5);
      const lamp = meshAt(new THREE.MeshBasicMaterial({ color: lampColors[i] }), place(base, x, th - 0.4, D / 2 - 0.3), lampGeo);
      lamp.rotation.x += 0.5;
      lamps.push(lamp);
      group.add(lamp);
    }
    animated.push((t) => lamps.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).color.setHSL(((t * 0.08 + i * 0.2) % 1), 0.8, 0.72))));
    for (const sx of [-1, 1]) group.add(meshAt(toon('#34314a'), local(base, 0.7, 1.3, 0.7, sx * (W / 2 - 0.5), ph + 0.65, D / 2 - 0.5)));
  }

  // Check-in desks with laptops.
  const desks = map.props.filter((p) => p.kind === 'checkin-desk');
  for (const d of desks) {
    const { base, W, D } = frameOf(d.rect, d.facing);
    group.add(meshAt(toon('#9ed3ff'), local(base, W, 1.0, D, 0, 0.5, 0)));
    group.add(meshAt(toon('#ffffff'), local(base, W + 0.06, 0.05, D + 0.06, 0, 1.02, 0)));
    const n = Math.max(1, Math.floor(W / 1.6));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5);
      group.add(meshAt(toon('#4b4766'), local(base, 0.4, 0.28, 0.03, x, 1.2, -0.1)));
    }
  }
  if (desks.length) {
    const r = unionRect(desks.map((d) => d.rect));
    const tag = makeLabel('CHECK-IN', 1.4, { bg: 'rgba(56,82,143,0.92)', fg: '#ffffff', size: 64 });
    tag.position.set(toWorldX(r.x + r.w / 2), 3.6, toWorldZ(r.y + r.h / 2));
    group.add(tag);
  }

  // Green entrance arrow on the sidewalk, plus a bobbing marker over the check-in door.
  if (map.signParts.length) {
    const r = unionRect(map.signParts);
    const { cx, cz, w, d } = worldRect(r);

    // Render cleanly on a single 2D plane texture to eliminate all z-fighting from overlapping boxes
    const cWidth = 1024;
    const cHeight = Math.max(128, Math.round((cWidth * r.h) / r.w));
    const canvas = document.createElement('canvas');
    canvas.width = cWidth;
    canvas.height = cHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#7de37b';
    for (const p of map.signParts) {
      const px = ((p.x - r.x) / r.w) * cWidth;
      const py = ((p.y - r.y) / r.h) * cHeight;
      const pw = (p.w / r.w) * cWidth;
      const ph = (p.h / r.h) * cHeight;
      ctx.fillRect(Math.floor(px) - 1, Math.floor(py) - 1, Math.ceil(pw) + 2, Math.ceil(ph) + 2);
    }
    const arrowTex = new THREE.CanvasTexture(canvas);
    arrowTex.colorSpace = THREE.SRGBColorSpace;
    const arrowMat = new THREE.MeshToonMaterial({
      map: arrowTex,
      transparent: true,
      alphaTest: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    const arrowPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), arrowMat);
    arrowPlane.rotateX(-Math.PI / 2);
    arrowPlane.position.set(cx, 0.018, cz);
    arrowPlane.receiveShadow = true;
    group.add(arrowPlane);

    const tag = makeLabel('LỐI VÀO', 1.1, { bg: 'rgba(76,175,80,0.95)', fg: '#ffffff', size: 64, icon: '←' });
    tag.position.set(toWorldX(r.x + r.w / 2), 2.6, toWorldZ(r.y + r.h / 2));
    group.add(tag);
  }
  const checkin = map.zones.find((z) => /check\s*-?\s*in/i.test(z.label));
  const entryDoor = checkin && map.doors.filter((d) => d.axis === 'h' && d.from >= checkin.rect.x && d.to <= checkin.rect.x + checkin.rect.w).sort((a, b) => b.at - a.at)[0];
  if (entryDoor) {
    const x = toWorldX((entryDoor.from + entryDoor.to) / 2);
    const z = toWorldZ(entryDoor.at);
    const marker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 20), toon('#ff7eb6'));
    cone.rotation.x = Math.PI;
    marker.add(cone);
    const tag = makeLabel('CHECK-IN', 0.9, { bg: 'rgba(255,126,182,0.95)', fg: '#ffffff', size: 56 });
    tag.position.y = 1.1;
    marker.add(tag);
    marker.position.set(x, WALL.height + 1.2, z);
    group.add(marker);
    animated.push((t) => {
      marker.position.y = WALL.height + 1.2 + Math.sin(t * 2.4) * 0.25;
      cone.rotation.y = t * 1.5;
    });
  }

  // Zone names float above their area.
  for (const z of map.zones) {
    const { cx, cz } = worldRect(z.rect);
    const tag = makeLabel(z.label, 2, { bg: 'rgba(255,255,255,0.9)', fg: '#4a3f7a', size: 64 });
    tag.position.set(cx, 7, cz);
    group.add(tag);
  }
  const food = map.stands.find((s) => s.kind === 'foodcourt');
  if (food) {
    const { cx, cz } = worldRect(food.rect);
    const tag = makeLabel(food.name || 'FOOD COURT', 1.2, { bg: 'rgba(255,230,102,0.95)', fg: '#5a4500', size: 56 });
    tag.position.set(cx, 3.4, cz);
    group.add(tag);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), toonUnique(tint(food.color, 0.55), { polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 }));
    const fr = worldRect(food.rect);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(fr.w, fr.d, 1);
    floor.position.set(fr.cx, 0.06, fr.cz);
    floor.receiveShadow = true;
    group.add(floor);
  }

  return { group, occluders, update: (t) => animated.forEach((f) => f(t)) };
}
