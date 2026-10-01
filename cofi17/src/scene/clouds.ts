import * as THREE from 'three';
import { worldRect } from '../map/coords';
import type { ParsedMap } from '../map/parse';
import { toonGradient } from './materials';

export interface Clouds {
  group: THREE.Group;
  update(t: number): void;
}

/** Deterministic pseudo-random so the sky looks the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Soft toon clouds drifting in a ring around the venue, some above it and some below the base. */
export function buildClouds(map: ParsedMap): Clouds {
  const b = worldRect(map.bounds);
  const rand = rng(17);
  const ringR = Math.hypot(b.w, b.d) / 2 + 40;
  const puffs: Array<{ x: number; y: number; z: number; s: number }> = [];
  const CLUSTERS = 18;
  for (let i = 0; i < CLUSTERS; i++) {
    const a = (i / CLUSTERS) * Math.PI * 2 + rand() * 0.25;
    const r = ringR + rand() * 90;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = -18 + rand() * 70;
    const size = 7 + rand() * 8;
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) * size * 0.75;
      puffs.push({
        x: cx + Math.cos(a + Math.PI / 2) * spread,
        y: cy + (k % 2 ? 1 : 0) * size * 0.25 + (1 - Math.abs(k - (n - 1) / 2) / n) * size * 0.3,
        z: cz + Math.sin(a + Math.PI / 2) * spread,
        s: size * (0.7 + (1 - Math.abs(k - (n - 1) / 2) / n) * 0.5),
      });
    }
  }

  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient(), fog: false });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, puffs.length);
  const m = new THREE.Matrix4();
  puffs.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(p.s, p.s * 0.62, p.s));
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'clouds';
  group.position.set(b.cx, 0, b.cz);
  group.add(mesh);
  return { group, update: (t) => { group.rotation.y = t * 0.008; } };
}
