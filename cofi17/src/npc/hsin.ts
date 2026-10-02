import * as THREE from 'three';
import type { CollisionWorld } from '../map/colliders';
import { toWorldX, toWorldZ, type Rect } from '../map/coords';
import type { Pathfinder, Point2D } from '../map/pathfinding';
import { createAvatar, part } from '../player/avatar';
import { toon, toonUnique } from '../scene/materials';
import { FONT } from '../scene/signAtlas';

/**
 * Cosplayer NPC: Phương Anh as Hsin, a white-haired fox girl in a red and black dress over a
 * pale blue underskirt, with fur trims, gold ornaments and a big white tail with a black tip.
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
  hair: '#f1f3f8',
  fur: '#fbfaf7',
  red: '#d4262f',
  black: '#1f1b24',
  underskirt: '#cfe7f1',
  gold: '#e2b45c',
  eyes: '#b23a48',
  tailTip: '#2b2733',
};

/** Swaps a shared toon material for another colour on the meshes of `group` (never mutates the shared one). */
function recolor(group: THREE.Object3D, from: string, to: string) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshToonMaterial && o.material.color.getHexString() === from) {
      o.material = toon(to);
    }
  });
}

/** Open, double-sided cone section (a skirt layer). `gap` leaves the front open by that many radians. */
function skirtLayer(top: number, bottom: number, height: number, color: string, gap = 0) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 28, 1, true, gap / 2, Math.PI * 2 - gap);
  const mesh = part(geo, color);
  mesh.material = toonUnique(color, { side: THREE.DoubleSide });
  return mesh;
}

/** Fox ear: white cone with a black tip, flattened front to back. */
function foxEar(sx: number) {
  const ear = new THREE.Group();
  const outer = part(new THREE.ConeGeometry(0.08, 0.22, 10), COLORS.fur);
  outer.position.y = 0.11;
  ear.add(outer);
  const tip = part(new THREE.ConeGeometry(0.038, 0.1, 10), COLORS.black);
  tip.position.y = 0.175;
  ear.add(tip);
  const inner = part(new THREE.ConeGeometry(0.05, 0.14, 8), '#ffe3ea', { outline: false });
  inner.position.set(0, 0.08, 0.03);
  ear.add(inner);
  ear.scale.z = 0.55;
  ear.position.set(sx * 0.12, 0.15, -0.02);
  ear.rotation.set(-0.1, 0, -sx * 0.38);
  return ear;
}

/** Gold four-pointed star ornament. */
function goldStar(size: number) {
  const star = part(new THREE.OctahedronGeometry(size), COLORS.gold, { outline: false });
  star.scale.set(1, 1, 0.35);
  return star;
}

/** Fox cosplay costume on top of the shared toon character. Returns the tail pivot for animation. */
function dressAsHsin(root: THREE.Object3D) {
  const head = root.getObjectByName('head')!;
  const body = root.getObjectByName('body')!;
  recolor(head, '2b2640', COLORS.eyes);
  recolor(head, 'ff8fb8', COLORS.gold);
  for (const name of ['leg-left', 'leg-right']) recolor(root.getObjectByName(name)!, '18171d', COLORS.red);

  // Head: fox ears, a bun at the back, wavy side locks and gold star clips with tassels.
  for (const sx of [-1, 1]) {
    head.add(foxEar(sx));
    const pompom = part(new THREE.SphereGeometry(0.045, 12, 10), COLORS.fur);
    pompom.position.set(sx * 0.17, 0.09, -0.02);
    head.add(pompom);
    const clip = goldStar(0.04);
    clip.position.set(sx * 0.17, 0.13, 0.04);
    head.add(clip);
    const tassel = part(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), COLORS.gold, { outline: false });
    tassel.position.set(sx * 0.2, 0.02, 0.02);
    head.add(tassel);
    const bead = part(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), COLORS.gold, { outline: false });
    bead.position.set(sx * 0.2, -0.08, 0.02);
    head.add(bead);
    for (const [y, z] of [[-0.24, 0.05], [-0.4, 0.02]] as const) {
      const wave = part(new THREE.SphereGeometry(0.055, 12, 10), COLORS.hair);
      wave.scale.set(0.8, 1.3, 0.8);
      wave.position.set(sx * (0.17 + (y < -0.3 ? 0.015 : 0)), y, z);
      head.add(wave);
    }
  }
  const bun = part(new THREE.SphereGeometry(0.1, 16, 12), COLORS.hair);
  bun.position.set(0, 0.14, -0.15);
  head.add(bun);

  // Bodice: black corset under a white fur off-shoulder trim, red choker with a gold pendant.
  const fur = part(new THREE.TorusGeometry(0.17, 0.05, 10, 28), COLORS.fur);
  fur.rotation.x = Math.PI / 2;
  fur.scale.set(1.05, 0.82, 1);
  fur.position.y = 1.26;
  body.add(fur);
  const choker = part(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 14), COLORS.red, { outline: false });
  choker.position.y = 1.39;
  body.add(choker);
  const pendant = goldStar(0.022);
  pendant.position.set(0, 1.35, 0.052);
  body.add(pendant);

  // Red sash with a bow at the waist and a gold tassel hanging in front.
  const sash = part(new THREE.TorusGeometry(0.152, 0.026, 8, 24), COLORS.red);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.9;
  body.add(sash);
  for (const sx of [-1, 1]) {
    const loop = part(new THREE.SphereGeometry(0.04, 10, 8), COLORS.red);
    loop.scale.set(1.4, 0.8, 0.6);
    loop.position.set(sx * 0.05, 0.92, 0.16);
    body.add(loop);
  }
  const knot = goldStar(0.03);
  knot.position.set(0, 0.92, 0.18);
  body.add(knot);
  const cord = part(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), COLORS.gold, { outline: false });
  cord.position.set(0, 0.74, 0.19);
  body.add(cord);

  // Skirt: the avatar's own skirt is the pale blue underskirt. Over it a red open-front robe with a
  // black hem band, and a long black front panel trimmed in gold. Children of the skirt so they sway with it.
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.keep || o.userData.vendorPart !== 'skirt') return;
    const robe = skirtLayer(0.165, 0.36, 0.72, COLORS.red, 1.1);
    robe.position.y = 0.01;
    o.add(robe);
    const band = skirtLayer(0.33, 0.37, 0.12, COLORS.black, 1.1);
    band.position.y = -0.31;
    o.add(band);
    const trim = skirtLayer(0.305, 0.31, 0.02, COLORS.gold, 1.1);
    trim.position.y = -0.235;
    o.add(trim);
    const panel = part(new THREE.BoxGeometry(0.075, 0.7, 0.02), COLORS.black);
    panel.rotation.x = -0.165;
    panel.position.set(-0.03, 0, 0.215);
    o.add(panel);
    const edge = part(new THREE.BoxGeometry(0.09, 0.02, 0.025), COLORS.gold, { outline: false });
    edge.rotation.x = -0.165;
    edge.position.set(-0.03, -0.3, 0.27);
    o.add(edge);
  });

  // Arms: white fur at the shoulder and a wide red sleeve hanging from the elbow.
  for (const name of ['arm-left', 'arm-right']) {
    const arm = root.getObjectByName(name)!;
    const cuff = part(new THREE.SphereGeometry(0.075, 12, 10), COLORS.fur);
    cuff.position.y = -0.03;
    arm.add(cuff);
    const sleeve = part(new THREE.CylinderGeometry(0.065, 0.13, 0.3, 14), COLORS.red);
    sleeve.position.y = -0.27;
    arm.add(sleeve);
    const lining = part(new THREE.CylinderGeometry(0.131, 0.131, 0.03, 14), COLORS.fur, { outline: false });
    lining.position.y = -0.41;
    arm.add(lining);
  }

  // Big fluffy tail: white at the root, fading to a black tip, swaying from the lower back.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0.78, -0.17);
  body.add(tail);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.18, -0.12, -0.42),
    new THREE.Vector3(0.42, 0.42, -0.58),
  );
  const segments = 14;
  const white = new THREE.Color(COLORS.fur);
  const tip = new THREE.Color(COLORS.tailTip);
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const radius = 0.07 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.15 + t * 0.03;
    const shade = THREE.MathUtils.smoothstep(t, 0.5, 0.92);
    const puff = part(new THREE.SphereGeometry(radius, 14, 12), `#${white.clone().lerp(tip, shade).getHexString()}`);
    puff.position.copy(curve.getPoint(t));
    puff.scale.set(1, 0.9, 1);
    tail.add(puff);
  }
  for (const t of [0.45, 0.8]) {
    const star = goldStar(0.05);
    star.position.copy(curve.getPoint(t)).add(new THREE.Vector3(0.12, 0.08, 0.1));
    tail.add(star);
  }
  return tail;
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
    shirtStyle: 'tee',
    hairColor: COLORS.hair,
    shirtColor: COLORS.black,
    bottomsColor: COLORS.underskirt,
    camera: false,
  });
  const root = avatar.root;
  root.name = 'npc-hsin';
  const tail = dressAsHsin(root);
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
    tail.rotation.y = Math.sin(time * 1.6) * 0.18 + Math.sin(time * 0.7) * 0.06;
    tail.rotation.z = Math.sin(time * 1.6 + 0.8) * 0.05;

    const line = talking ? Math.floor((time - talkStart) / LINE_SECONDS) % HSIN_LINES.length : -1;
    bubbles.forEach((b, i) => { b.visible = i === line; });
    tag.visible = line < 0;
  };

  update(0, 0, new THREE.Vector3(Infinity, 0, Infinity));
  return { root, position, talk, update };
}
