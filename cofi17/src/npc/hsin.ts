import * as THREE from 'three';
import type { CollisionWorld } from '../map/colliders';
import { toWorldX, toWorldZ, type Rect } from '../map/coords';
import type { Pathfinder, Point2D } from '../map/pathfinding';
import { createAvatar, part } from '../player/avatar';
import { FONT } from '../scene/signAtlas';

/**
 * Cosplayer NPC: Phương Anh dressed as Jinhsi ("Hsin") from Wuthering Waves.
 * She strolls the open floor in front of the main stage in Hall A3, stops to face the visitor
 * when they come close (or tap her), waves and talks through a speech bubble.
 */

export const HSIN_LINES = [
  'Mình là Phương Anh nè!',
  'Mình đi hôm thứ 7 đó~',
  'Chụp hình cùng mình nhé! 📸',
];

/** Map-space floor in front of the main stage (stage rect: x 650–920, y 1380–1550, facing S). */
const STROLL_AREA: Rect = { x: 560, y: 1620, w: 450, h: 260 };

const TALK_RADIUS = 3;
const LEAVE_RADIUS = 4.5;
const LINE_SECONDS = 2.8;
const WALK_SPEED = 0.8;

const COLORS = {
  hair: '#eef0f7',
  dress: '#fbf7ee',
  gold: '#e3b65a',
  teal: '#5fb8c9',
};

/** Jinhsi-inspired costume on top of the shared toon character. */
function dressAsHsin(root: THREE.Object3D) {
  const head = root.getObjectByName('head')!;
  const body = root.getObjectByName('body')!;

  // Very long silver-white hair falling to the knees.
  const hair = part(new THREE.CapsuleGeometry(0.16, 0.78, 6, 16), COLORS.hair);
  hair.scale.set(1.08, 1, 0.48);
  hair.position.set(0, -0.62, -0.13);
  hair.rotation.x = 0.05;
  head.add(hair);
  for (const sx of [-1, 1]) {
    const lock = part(new THREE.CapsuleGeometry(0.045, 0.42, 4, 10), COLORS.hair);
    lock.position.set(sx * 0.15, -0.3, 0.06);
    lock.rotation.z = sx * 0.08;
    head.add(lock);
    // Golden wing-like hair ornaments behind the head.
    const wing = part(new THREE.ConeGeometry(0.045, 0.26, 6), COLORS.gold);
    wing.position.set(sx * 0.15, 0.12, -0.12);
    wing.rotation.set(-0.5, 0, -sx * 0.9);
    head.add(wing);
    const tassel = part(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), COLORS.gold, { outline: false });
    tassel.position.set(sx * 0.2, -0.08, -0.04);
    head.add(tassel);
  }
  const crown = part(new THREE.TorusGeometry(0.1, 0.018, 8, 24, Math.PI), COLORS.gold);
  crown.position.set(0, 0.14, -0.13);
  crown.rotation.x = -0.6;
  head.add(crown);
  const gem = part(new THREE.OctahedronGeometry(0.035), COLORS.teal);
  gem.position.set(0, 0.2, -0.12);
  head.add(gem);

  // Gold trims on the white dress: collar, front panel, belt and hem.
  const collar = part(new THREE.CylinderGeometry(0.07, 0.085, 0.07, 16), COLORS.gold);
  collar.position.y = 1.35;
  body.add(collar);
  const panel = part(new THREE.BoxGeometry(0.07, 0.36, 0.02), COLORS.gold, { outline: false });
  panel.position.set(0, 1.1, 0.112);
  body.add(panel);
  const belt = part(new THREE.TorusGeometry(0.152, 0.022, 8, 24), COLORS.gold);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.88;
  body.add(belt);
  const buckle = part(new THREE.OctahedronGeometry(0.04), COLORS.teal);
  buckle.position.set(0, 0.88, 0.16);
  body.add(buckle);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.keep && o.userData.vendorPart === 'skirt') {
      const hem = part(new THREE.TorusGeometry(0.27, 0.018, 6, 28), COLORS.gold, { outline: false });
      hem.rotation.x = Math.PI / 2;
      hem.position.y = -0.35;
      o.add(hem);
    }
  });

  // Floating golden halo, her signature motif.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.014, 8, 48),
    new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.85 }),
  );
  halo.position.set(0, 1.58, -0.32);
  halo.raycast = () => {};
  body.add(halo);
  return halo;
}

/** Comic speech bubble with a tail, drawn to a canvas. */
function bubbleTexture(text: string) {
  const size = 56;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `800 ${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width + size * 1.4);
  const bodyH = Math.ceil(size * 1.9);
  const tail = Math.ceil(size * 0.6);
  canvas.width = w + 8;
  canvas.height = bodyH + tail + 8;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ff6fae';
  ctx.fillStyle = '#ffffff';
  const r = bodyH / 2;
  ctx.beginPath();
  ctx.moveTo(4 + r, 4);
  ctx.arcTo(4 + w, 4, 4 + w, 4 + bodyH, r);
  ctx.arcTo(4 + w, 4 + bodyH, 4, 4 + bodyH, r);
  ctx.lineTo(4 + w / 2 + tail * 0.6, 4 + bodyH);
  ctx.lineTo(4 + w / 2, 4 + bodyH + tail);
  ctx.lineTo(4 + w / 2 - tail * 0.6, 4 + bodyH);
  ctx.arcTo(4, 4 + bodyH, 4, 4, r);
  ctx.arcTo(4, 4, 4 + w, 4, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b2a4a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4 + w / 2, 4 + bodyH / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}

function makeSprite(texture: THREE.Texture, aspect: number, height: number) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(height * aspect, height, 1);
  sprite.renderOrder = 3;
  sprite.raycast = () => {};
  return sprite;
}

function nameTag() {
  const size = 44;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const text = 'Hsin · Phương Anh';
  ctx.font = `800 ${size}px ${FONT}`;
  canvas.width = Math.ceil(ctx.measureText(text).width + size * 1.2);
  canvas.height = Math.ceil(size * 1.6);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = 'rgba(227,182,90,0.95)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return makeSprite(texture, canvas.width / canvas.height, 0.26);
}

const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface HsinNpc {
  root: THREE.Group;
  position: THREE.Vector3;
  /** Start (or restart) the dialogue, e.g. after the visitor taps her. */
  talk: (time: number) => string;
  update: (dt: number, time: number, player: THREE.Vector3) => void;
}

export function buildHsin(pathfinder: Pathfinder, world: CollisionWorld): HsinNpc {
  const avatar = createAvatar('female', {
    hairStyle: 'long',
    shirtStyle: 'button-up',
    hairColor: COLORS.hair,
    shirtColor: COLORS.dress,
    bottomsColor: COLORS.dress,
    camera: false,
  });
  const root = avatar.root;
  root.name = 'npc-hsin';
  const halo = dressAsHsin(root);
  const armRight = root.getObjectByName('arm-right')!;

  const tag = nameTag();
  tag.position.y = 2.12;
  root.add(tag);
  const bubbles = HSIN_LINES.map((line) => {
    const { texture, aspect } = bubbleTexture(line);
    const sprite = makeSprite(texture, aspect, 0.42);
    sprite.position.y = 2.55;
    sprite.visible = false;
    root.add(sprite);
    return sprite;
  });

  const area = {
    x0: toWorldX(STROLL_AREA.x), x1: toWorldX(STROLL_AREA.x + STROLL_AREA.w),
    z0: toWorldZ(STROLL_AREA.y), z1: toWorldZ(STROLL_AREA.y + STROLL_AREA.h),
  };
  const randomPoint = (): Point2D | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = THREE.MathUtils.lerp(area.x0, area.x1, Math.random());
      const z = THREE.MathUtils.lerp(area.z0, area.z1, Math.random());
      const grid = pathfinder.toGrid(x, z);
      const cell = pathfinder.nearestWalkable(grid.gx, grid.gz, 3);
      if (!cell) continue;
      const p = pathfinder.toWorld(cell.gx, cell.gz);
      if (world.isFree(p.x, p.z, 0.3)) return p;
    }
    return null;
  };

  const position = new THREE.Vector3();
  const start = randomPoint() ?? { x: (area.x0 + area.x1) / 2, z: (area.z0 + area.z1) / 2 };
  position.set(start.x, 0, start.z);
  // Face the audience side (south, +Z) at first.
  let heading = 0;
  let speed = 0;
  let route: Point2D[] = [];
  let waitUntil = 1 + Math.random() * 2;
  let talkStart = -Infinity;
  let talkUntil = -Infinity;
  let nearby = false;

  const talk = (time: number) => {
    if (time > talkUntil) talkStart = time;
    talkUntil = Math.max(talkUntil, time + LINE_SECONDS * HSIN_LINES.length);
    route = [];
    return HSIN_LINES[Math.floor((time - talkStart) / LINE_SECONDS) % HSIN_LINES.length];
  };

  const update = (dt: number, time: number, player: THREE.Vector3) => {
    const toPlayer = Math.hypot(player.x - position.x, player.z - position.z);
    if (toPlayer < TALK_RADIUS) {
      nearby = true;
      talk(time);
    } else if (nearby && toPlayer > LEAVE_RADIUS) {
      // The visitor walked away: finish the current line, then go back to strolling.
      nearby = false;
      talkUntil = Math.min(talkUntil, talkStart + Math.ceil((time - talkStart) / LINE_SECONDS) * LINE_SECONDS);
    }
    const talking = time < talkUntil;

    let desiredSpeed = 0;
    if (talking) {
      heading += angleDelta(heading, Math.atan2(player.x - position.x, player.z - position.z)) * (1 - Math.exp(-6 * dt));
    } else if (route.length) {
      const target = route[0];
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        route.shift();
        if (!route.length) waitUntil = time + 2 + Math.random() * 4;
      } else {
        heading += angleDelta(heading, Math.atan2(dx, dz)) * (1 - Math.exp(-8 * dt));
        desiredSpeed = Math.min(WALK_SPEED, Math.sqrt(dist) * 1.4);
        const step = Math.min(speed * dt, dist);
        position.x += (dx / dist) * step;
        position.z += (dz / dist) * step;
      }
    } else if (time > waitUntil) {
      waitUntil = time + 1.5;
      const target = randomPoint();
      if (target && Math.hypot(target.x - position.x, target.z - position.z) > 2) {
        route = pathfinder.findPath(position.x, position.z, target.x, target.z, false).slice(1);
      }
    }
    speed += (desiredSpeed - speed) * (1 - Math.exp(-4 * dt));

    root.position.copy(position);
    root.rotation.y = heading;
    avatar.animate(dt, speed);
    armRight.rotation.z = talking ? 2.4 + Math.sin(time * 7) * 0.25 : 0.1;
    if (talking) armRight.rotation.x = 0;
    halo.rotation.z = time * 0.6;
    halo.position.y = 1.58 + Math.sin(time * 1.8) * 0.03;

    const line = talking ? Math.floor((time - talkStart) / LINE_SECONDS) % HSIN_LINES.length : -1;
    bubbles.forEach((b, i) => { b.visible = i === line; });
    tag.visible = line < 0;
  };

  update(0, 0, new THREE.Vector3(Infinity, 0, Infinity));
  return { root, position, talk, update };
}
