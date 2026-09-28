import * as THREE from 'three';
import { PLAYER } from '../config';
import type { CollisionWorld } from '../map/colliders';
import type { Avatar } from './avatar';

const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Keyboard / joystick / tap-to-move locomotion with circle-vs-box collision. */
export class PlayerController {
  readonly position = new THREE.Vector3();
  heading = 0;
  speed = 0;
  private velocity = new THREE.Vector2();
  private keys = new Set<string>();
  /** Virtual joystick input, x = right, y = forward, magnitude ≤ 1. */
  joystick = { x: 0, y: 0 };
  private moveTarget: { x: number; z: number } | null = null;
  private stuckTime = 0;

  constructor(private avatar: Avatar, private world: CollisionWorld) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get hasInput() {
    return this.keys.size > 0 || Math.hypot(this.joystick.x, this.joystick.y) > 0.05;
  }

  teleport(x: number, z: number, heading = this.heading) {
    const p = this.world.nearestFree(x, z, PLAYER.radius) ?? { x, z };
    this.position.set(p.x, 0, p.z);
    this.heading = heading;
    this.velocity.set(0, 0);
    this.moveTarget = null;
    this.sync(0);
  }

  walkTo(x: number, z: number) {
    this.moveTarget = { x, z };
    this.stuckTime = 0;
  }

  update(dt: number, forward: { x: number; z: number }) {
    const k = this.keys;
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let iy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    ix += this.joystick.x;
    iy += this.joystick.y;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
      mag = 1;
    }

    const right = { x: -forward.z, z: forward.x };
    let dx = forward.x * iy + right.x * ix;
    let dz = forward.z * iy + right.z * ix;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joystick.x, this.joystick.y) > 0.92;
    let speed = (run ? PLAYER.runSpeed : PLAYER.walkSpeed) * mag;

    if (mag > 0.05) {
      this.moveTarget = null;
    } else if (this.moveTarget) {
      const tx = this.moveTarget.x - this.position.x;
      const tz = this.moveTarget.z - this.position.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.25) {
        this.moveTarget = null;
      } else {
        dx = tx / dist;
        dz = tz / dist;
        speed = Math.min(dist > 12 ? PLAYER.runSpeed : PLAYER.walkSpeed, dist * 4);
      }
    }

    const len = Math.hypot(dx, dz);
    const desired = len > 1e-6 ? new THREE.Vector2((dx / len) * speed, (dz / len) * speed) : new THREE.Vector2();
    this.velocity.lerp(desired, 1 - Math.exp(-12 * dt));

    const before = this.position.clone();
    const move = this.velocity.clone().multiplyScalar(dt);
    const steps = Math.max(1, Math.ceil(move.length() / 0.2));
    let x = this.position.x;
    let z = this.position.z;
    for (let i = 0; i < steps; i++) {
      const p = this.world.resolve(x + move.x / steps, z + move.y / steps, PLAYER.radius);
      x = p.x;
      z = p.z;
    }
    this.position.set(x, 0, z);
    const moved = Math.hypot(x - before.x, z - before.z);
    this.speed = dt > 0 ? moved / dt : 0;

    if (this.moveTarget) {
      this.stuckTime = this.speed < 0.3 * Math.max(0.5, this.velocity.length()) ? this.stuckTime + dt : 0;
      if (this.stuckTime > 0.6) this.moveTarget = null;
    }
    if (this.velocity.length() > 0.2) {
      this.heading = lerpAngle(this.heading, Math.atan2(this.velocity.x, this.velocity.y), 1 - Math.exp(-12 * dt));
    }
    this.sync(dt);
  }

  private sync(dt: number) {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.heading;
    this.avatar.animate(dt, this.speed);
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
