import * as THREE from 'three';
import type { CollisionWorld } from '../../map/colliders';
import { toWorldX, toWorldZ, type Rect } from '../../map/coords';
import type { Pathfinder, Point2D } from '../../map/pathfinding';
import { buildHsinModel, type HsinPose } from './model';
import { contactShadow, createDialog, nameplate, sigil, sparkles } from './ui';

/**
 * Cosplayer NPC: Phương Anh as Hsin, a white-haired fox lady in a red silk robe, black satin
 * and pale blue chiffon, with a big white tail fading to black.
 *
 * Unlike every other character in the venue she has her own realistic model and look (see
 * model.ts / materials.ts) and her own UI (ui.ts): she strolls the floor in front of the main
 * stage in Hall A3, and when the visitor comes close (or taps her) she turns, waves and talks
 * in a dialogue box that also offers a photo together.
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
const LINE_SECONDS = 3.2;
const WALK_SPEED = 0.75;
const PHOTO_LINE = 2;

const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface HsinOptions {
  pathfinder: Pathfinder;
  world: CollisionWorld;
  renderer: THREE.WebGLRenderer;
  hudRoot: HTMLElement;
  /** 0.5–1: fewer hair, fur and tail strands on weaker devices. */
  detail?: number;
  /** Takes the photo once the countdown ends (renders and saves the current view). */
  onPhoto: () => void;
}

export interface HsinNpc {
  root: THREE.Group;
  position: THREE.Vector3;
  /** Start (or keep) the dialogue, e.g. after the visitor taps her. */
  talk: (time: number) => void;
  update: (dt: number, time: number, player: THREE.Vector3) => void;
}

export function buildHsin(o: HsinOptions): HsinNpc {
  const { pathfinder, world } = o;
  const model = buildHsinModel(o.renderer, o.detail ?? 1);
  const root = model.root;

  const plate = nameplate();
  plate.position.y = 2.12;
  root.add(plate);
  const circle = sigil();
  root.add(circle, contactShadow());
  const motes = sparkles();
  root.add(motes.points);

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
      if (world.isFree(p.x, p.z, 0.4)) return p;
    }
    return null;
  };

  const position = new THREE.Vector3();
  const start = randomPoint() ?? { x: (area.x0 + area.x1) / 2, z: (area.z0 + area.z1) / 2 };
  position.set(start.x, 0, start.z);
  let heading = 0;
  let speed = 0;
  let route: Point2D[] = [];
  let waitUntil = 1 + Math.random() * 2;
  let now = 0;
  // Dialogue state: which line started when, until when she keeps talking.
  let talkStart = -Infinity;
  let talkUntil = -Infinity;
  let lineBase = 0;
  let nearby = false;
  let dismissed = false;
  let posingUntil = -Infinity;
  const lineAt = (time: number) => (lineBase + Math.floor((time - talkStart) / LINE_SECONDS)) % HSIN_LINES.length;

  const talk = (time: number) => {
    dismissed = false;
    if (time > talkUntil) {
      talkStart = time;
      lineBase = 0;
    }
    talkUntil = Math.max(talkUntil, time + LINE_SECONDS * HSIN_LINES.length);
    route = [];
  };

  const dialog = createDialog(o.hudRoot, {
    onNext: () => {
      lineBase = (lineAt(now) + 1) % HSIN_LINES.length;
      talkStart = now;
      talkUntil = Math.max(talkUntil, now + LINE_SECONDS * HSIN_LINES.length);
    },
    onPhoto: async () => {
      lineBase = PHOTO_LINE;
      talkStart = now;
      posingUntil = Infinity;
      talkUntil = Infinity;
      await dialog.countdown();
      o.onPhoto();
      dialog.flash();
      posingUntil = now + 1.2;
      talkUntil = now + LINE_SECONDS;
    },
    onClose: () => {
      dismissed = true;
      talkUntil = now;
      posingUntil = -Infinity;
    },
  });

  const lookTarget = new THREE.Vector3();
  const update = (dt: number, time: number, player: THREE.Vector3) => {
    now = time;
    const toPlayer = Math.hypot(player.x - position.x, player.z - position.z);
    if (toPlayer < TALK_RADIUS && !dismissed) {
      nearby = true;
      talk(time);
    } else if (toPlayer > LEAVE_RADIUS && (nearby || dismissed)) {
      // The visitor walked away: finish the current line, then go back to strolling.
      nearby = false;
      dismissed = false;
      if (time < talkUntil && posingUntil < time) {
        talkUntil = Math.min(talkUntil, talkStart + Math.ceil((time - talkStart) / LINE_SECONDS) * LINE_SECONDS);
      }
    }
    const talking = time < talkUntil;

    let desiredSpeed = 0;
    if (talking) {
      heading += angleDelta(heading, Math.atan2(player.x - position.x, player.z - position.z)) * (1 - Math.exp(-4 * dt));
    } else if (route.length) {
      const target = route[0];
      const dx = target.x - position.x;
      const dz = target.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        route.shift();
        if (!route.length) waitUntil = time + 2.5 + Math.random() * 4;
      } else {
        heading += angleDelta(heading, Math.atan2(dx, dz)) * (1 - Math.exp(-5 * dt));
        desiredSpeed = Math.min(WALK_SPEED, Math.sqrt(dist) * 1.2);
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
    speed += (desiredSpeed - speed) * (1 - Math.exp(-3 * dt));

    const line = talking ? lineAt(time) : -1;
    const pose: HsinPose = time < posingUntil || line === PHOTO_LINE ? 'photo' : talking ? 'wave' : 'idle';
    root.position.copy(position);
    root.rotation.y = heading;
    lookTarget.set(player.x, 1.45, player.z);
    model.update(dt, time, speed, pose, talking ? lookTarget : null);

    // Her own UI: the plate floats, the sigil and sparkles glow brighter while she talks.
    plate.position.y = 2.12 + Math.sin(time * 1.6) * 0.025;
    circle.rotation.z = time * 0.25;
    const glow = talking ? 1 : 0;
    const mat = circle.material as THREE.MeshBasicMaterial;
    mat.opacity += ((0.35 + glow * 0.45 + Math.sin(time * 2.2) * 0.06) - mat.opacity) * (1 - Math.exp(-4 * dt));
    motes.update(time, glow);

    if (line >= 0) dialog.show(HSIN_LINES[line], line, HSIN_LINES.length);
    else dialog.hide();
  };

  update(0, 0, new THREE.Vector3(1e6, 0, 1e6));
  return { root, position, talk, update };
}
