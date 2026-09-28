import * as THREE from 'three';

const FOLLOW = { distance: 9, pitch: 0.5, minDist: 3, maxDist: 32 };
const OVERVIEW = { distance: 175, pitch: 1.08, minDist: 60, maxDist: 280 };
const HEAD_HEIGHT = 1.4;

const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * Third-person orbit camera that follows the visitor. Drag to orbit, wheel/pinch to zoom,
 * and an overview mode that frames the whole venue. Walls between the camera and the visitor fade out.
 */
export class FollowCamera {
  mode: 'follow' | 'overview' = 'follow';
  yaw = 0;
  pitch = FOLLOW.pitch;
  distance = FOLLOW.distance;
  private targetYaw = 0;
  private targetPitch = FOLLOW.pitch;
  private targetDistance = FOLLOW.distance;
  private focus = new THREE.Vector3();
  private followDistance = FOLLOW.distance;
  private followYaw = 0;
  private rate = 1.6;
  private raycaster = new THREE.Raycaster();
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private dragStart: { x: number; y: number } | null = null;
  private dragged = false;

  /** Called with client coordinates when the canvas is tapped/clicked without dragging. */
  onTap: (x: number, y: number) => void = () => {};

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private occluders: THREE.Mesh[],
    private overviewCenter: THREE.Vector3,
  ) {
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.style.touchAction = 'none';
  }

  /** Starts high above `from` and flies down behind the visitor. */
  intro(from: THREE.Vector3, yaw: number) {
    this.focus.copy(from);
    this.yaw = yaw + 0.8;
    this.pitch = 1.2;
    this.distance = 70;
    this.targetYaw = yaw;
    this.rate = 1.4;
  }

  skipIntro() {
    this.rate = 6;
  }

  snapBehind(yaw: number) {
    this.targetYaw = yaw;
  }

  setOverview(on: boolean) {
    if (on === (this.mode === 'overview')) return;
    if (on) {
      this.followDistance = this.targetDistance;
      this.followYaw = this.targetYaw;
      this.mode = 'overview';
      // North up, like the minimap.
      this.targetYaw = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
      this.targetDistance = OVERVIEW.distance;
      this.targetPitch = OVERVIEW.pitch;
    } else {
      this.mode = 'follow';
      this.targetDistance = this.followDistance;
      this.targetYaw = this.followYaw;
      this.targetPitch = FOLLOW.pitch;
    }
    this.rate = 3;
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dom.setPointerCapture(e.pointerId);
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragged = false;
    } else if (this.pointers.size === 2) {
      this.pinchStart = this.pinchDistance();
      this.dragged = true;
    }
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const d = this.pinchDistance();
      if (this.pinchStart > 0) this.zoom(this.pinchStart / d);
      this.pinchStart = d;
      return;
    }
    if (this.dragStart && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 6) this.dragged = true;
    if (!this.dragged) return;
    this.targetYaw -= dx * 0.006;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.004, 0.08, 1.4);
    this.rate = Math.max(this.rate, 6);
  };

  private onUp = (e: PointerEvent) => {
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasSingle && !this.dragged && e.type === 'pointerup') this.onTap(e.clientX, e.clientY);
    if (this.pointers.size === 0) this.dragStart = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private zoom(factor: number) {
    const lim = this.mode === 'overview' ? OVERVIEW : FOLLOW;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, lim.minDist, lim.maxDist);
    this.rate = Math.max(this.rate, 6);
  }

  /** Forward direction on the ground (away from the camera). */
  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  update(dt: number, player: THREE.Vector3) {
    const k = 1 - Math.exp(-this.rate * dt);
    const goal = this.mode === 'overview' ? this.overviewCenter : new THREE.Vector3(player.x, player.y + HEAD_HEIGHT, player.z);
    this.focus.lerp(goal, this.mode === 'overview' ? k : 1 - Math.exp(-10 * dt));
    this.yaw = lerpAngle(this.yaw, this.targetYaw, k);
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance += (this.targetDistance - this.distance) * k;
    if (this.rate < 6 && Math.abs(this.distance - this.targetDistance) < 0.3) this.rate = 6;

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.focus);
    this.fadeOccluders(dt, player);
  }

  private fadeOccluders(dt: number, player: THREE.Vector3) {
    const hidden = new Set<THREE.Object3D>();
    if (this.mode === 'follow') {
      const head = new THREE.Vector3(player.x, player.y + 1.1, player.z);
      const dir = head.clone().sub(this.camera.position);
      const len = dir.length();
      this.raycaster.set(this.camera.position, dir.normalize());
      this.raycaster.far = len;
      for (const hit of this.raycaster.intersectObjects(this.occluders, false)) hidden.add(hit.object);
    }
    const k = 1 - Math.exp(-10 * dt);
    for (const m of this.occluders) {
      const mat = m.material as THREE.MeshToonMaterial;
      const target = hidden.has(m) ? 0.18 : 1;
      if (Math.abs(mat.opacity - target) < 0.005) continue;
      mat.opacity += (target - mat.opacity) * k;
      mat.depthWrite = mat.opacity > 0.98;
    }
  }
}
