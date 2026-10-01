import * as THREE from 'three';
import { PLAYER } from '../config';
import type { CollisionWorld } from '../map/colliders';
import type { Avatar } from './avatar';

/** Turn rate (rad/s) for A/D or the joystick's x axis in focus mode. */


const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * Keyboard / joystick / tap-to-move locomotion with circle-vs-box collision.
 *
 * - Free camera: input is relative to the camera (W walks away from the camera).
 */
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

  /** Swaps the character model in place (e.g. male ↔ female). */
  setAvatar(avatar: Avatar) {
    const old = this.avatar;
    old.root.parent?.add(avatar.root);
    old.root.removeFromParent();
    old.dispose();
    this.avatar = avatar;
    this.sync(0);
  }

  teleport(x: number, z: number, heading = this.heading) {
    const p = this.world.nearestFree(x, z, PLAYER.radius) ?? { x, z };
    this.position.set(p.x, 0, p.z);
    this.heading = heading;
    this.velocity.set(0, 0);
    this.moveTarget = null;
    this.sync(0);
  }

  stopWalking() {
    this.moveTarget = null;
    this.velocity.set(0, 0);
  }

  walkTo(x: number, z: number) {
    if (this.moveTarget?.x === x && this.moveTarget?.z === z) return;
    this.moveTarget = { x, z };
    this.stuckTime = 0;
  }

  /** Input axes from keyboard + joystick: x = right/turn, y = forward. */
  private axes() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    x += this.joystick.x;
    y += this.joystick.y;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joystick.x, this.joystick.y) > 0.92;
    return { x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1), run };
  }

  update(dt: number, forward: { x: number; z: number }) {
    const input = this.axes();
    let dx = 0;
    let dz = 0;
    let speed = 0;
    let faceMovement = true;

    {
      const mag = Math.min(1, Math.hypot(input.x, input.y));
      if (mag > 0.05) {
        const right = { x: -forward.z, z: forward.x };
        dx = forward.x * input.y + right.x * input.x;
        dz = forward.z * input.y + right.z * input.x;
        speed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * mag;
      }
    }

    const manual = Math.abs(input.x) > 0.05 || Math.abs(input.y) > 0.05;
    if (manual) {
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
        speed = Math.min(PLAYER.walkSpeed * 1.25, dist * 6);
        faceMovement = true;
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
    if (faceMovement && this.velocity.length() > 0.2) {
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
