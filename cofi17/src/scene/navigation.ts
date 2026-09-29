import * as THREE from 'three';
import type { Point2D } from '../map/pathfinding';

/**
 * Creates visual 3D navigation guidance on the floor:
 * - A semi-transparent glowing ground ribbon following the path
 * - Animated forward-pointing chevrons along the path
 * - A pulsing beacon / destination ring at the destination booth
 */
export class NavigationVisualizer {
  readonly group = new THREE.Group();
  private ribbonMesh: THREE.Mesh | null = null;
  private chevronMesh: THREE.InstancedMesh | null = null;
  private beaconGroup = new THREE.Group();
  private beaconRing: THREE.Mesh;
  private beaconPillar: THREE.Mesh;
  private waypoints: Point2D[] = [];
  private chevronCount = 0;
  private distances: number[] = [];
  private totalLength = 0;

  constructor() {
    this.group.name = 'navigation';

    // Destination beacon on the ground
    const ringGeo = new THREE.RingGeometry(0.3, 1.2, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.position.y = 0.085;
    this.beaconRing.renderOrder = 9;

    // Soft vertical pillar of light at destination
    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, 4, 16, 1, true);
    pillarGeo.translate(0, 2, 0);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    this.beaconPillar = new THREE.Mesh(pillarGeo, pillarMat);
    this.beaconPillar.renderOrder = 9;

    this.beaconGroup.add(this.beaconRing, this.beaconPillar);
    this.beaconGroup.visible = false;
    this.group.add(this.beaconGroup);
  }

  setPath(waypoints: Point2D[]) {
    this.waypoints = waypoints;

    // Clean up previous meshes
    if (this.ribbonMesh) {
      this.group.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      (this.ribbonMesh.material as THREE.Material).dispose();
      this.ribbonMesh = null;
    }
    if (this.chevronMesh) {
      this.group.remove(this.chevronMesh);
      this.chevronMesh.geometry.dispose();
      (this.chevronMesh.material as THREE.Material).dispose();
      this.chevronMesh = null;
    }

    if (waypoints.length < 2) {
      this.beaconGroup.visible = false;
      return;
    }

    // Set destination beacon
    const last = waypoints[waypoints.length - 1];
    this.beaconGroup.position.set(last.x, 0, last.z);
    this.beaconGroup.visible = true;

    // Build ribbon geometry (width = 0.42m, height = 0.075m above floor so it stays on top of all hall/zone/highlight floors)
    const ribbonWidth = 0.42;
    const halfW = ribbonWidth / 2;
    const y = 0.075;

    const vertices: number[] = [];
    const indices: number[] = [];

    // Precalculate segment lengths & total length
    this.distances = [0];
    this.totalLength = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const d = Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z);
      this.totalLength += d;
      this.distances.push(this.totalLength);
    }

    for (let i = 0; i < waypoints.length; i++) {
      const p = waypoints[i];
      let nx = 0;
      let nz = 0;

      if (i === 0) {
        const next = waypoints[1];
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        nx = -dz / len;
        nz = dx / len;
      } else if (i === waypoints.length - 1) {
        const prev = waypoints[i - 1];
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        nx = -dz / len;
        nz = dx / len;
      } else {
        const prev = waypoints[i - 1];
        const next = waypoints[i + 1];
        const d1x = p.x - prev.x;
        const d1z = p.z - prev.z;
        const l1 = Math.hypot(d1x, d1z) || 1;
        const d2x = next.x - p.x;
        const d2z = next.z - p.z;
        const l2 = Math.hypot(d2x, d2z) || 1;

        const avgX = d1x / l1 + d2x / l2;
        const avgZ = d1z / l1 + d2z / l2;
        const avgLen = Math.hypot(avgX, avgZ) || 1;
        nx = -avgZ / avgLen;
        nz = avgX / avgLen;
      }

      vertices.push(p.x - nx * halfW, y, p.z - nz * halfW);
      vertices.push(p.x + nx * halfW, y, p.z + nz * halfW);

      if (i < waypoints.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    ribbonGeo.setIndex(indices);

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x00c8f8,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    this.ribbonMesh.renderOrder = 8;
    this.group.add(this.ribbonMesh);

    // Build animated chevrons spaced every ~1.0m
    const spacing = 1.0;
    const chevronPoints: Array<{ x: number; z: number; yaw: number; dist: number }> = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const segDist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (segDist < 0.1) continue;

      const yaw = Math.atan2(p2.x - p1.x, p2.z - p1.z);
      const steps = Math.max(1, Math.floor(segDist / spacing));
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        chevronPoints.push({
          x: p1.x + (p2.x - p1.x) * t,
          z: p1.z + (p2.z - p1.z) * t,
          yaw,
          dist: this.distances[i] + t * segDist,
        });
      }
    }

    this.chevronCount = chevronPoints.length;
    if (this.chevronCount > 0) {
      // Create a chevron flat geometry (triangle with notched back pointing forward towards destination)
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.22);
      shape.lineTo(0.18, 0.15);
      shape.lineTo(0, 0.05);
      shape.lineTo(-0.18, 0.15);
      shape.closePath();

      const chevronGeo = new THREE.ShapeGeometry(shape);
      chevronGeo.rotateX(-Math.PI / 2);

      const chevronMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      });

      this.chevronMesh = new THREE.InstancedMesh(chevronGeo, chevronMat, this.chevronCount);
      this.chevronMesh.renderOrder = 9;
      const dummy = new THREE.Object3D();

      for (let i = 0; i < this.chevronCount; i++) {
        const cp = chevronPoints[i];
        dummy.position.set(cp.x, y + 0.005, cp.z);
        dummy.rotation.set(0, cp.yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.chevronMesh.setMatrixAt(i, dummy.matrix);
      }
      this.chevronMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.chevronMesh);
    }
  }

  clear() {
    this.setPath([]);
  }

  getWaypoints(): Point2D[] {
    return this.waypoints;
  }

  update(t: number) {
    if (this.beaconGroup.visible) {
      // Pulse beacon ring scale & opacity
      const s = 1 + Math.sin(t * 4) * 0.15;
      this.beaconRing.scale.set(s, 1, s);
      (this.beaconRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 4) * 0.25;

      // Rotate pillar gently
      this.beaconPillar.rotation.y = t * 1.5;
    }

    if (this.chevronMesh) {
      // Animate wave of brightness/opacity along the chevrons
      (this.chevronMesh.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 6) * 0.25;
    }
  }
}
