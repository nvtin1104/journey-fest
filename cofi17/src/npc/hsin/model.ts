import * as THREE from 'three';
import { clothPanel, curveOf, lathe, merge, prepare, rng, starGeometry, strand } from './geometry';
import { createHsinMaterials, type HsinMaterials } from './materials';

/**
 * Hsin's own rigged model, built in code at realistic proportions (about 1.75 m).
 * Front is +Z, feet on y = 0. Joints are groups so the walk, idle, wave and photo pose can drive them.
 */

const HIPS_Y = 0.99;

/** Held photo pose (Euler XYZ, radians), after the reference art: right hand on the chest, left hand raised beside the head. */
const PHOTO = {
  rightShoulder: [-0.55, 0.15, -0.12],
  rightElbow: [-2.0, 0, 0.75],
  leftShoulder: [-0.25, -0.2, 2.55],
  leftElbow: [-0.2, 0, 1.35],
};

const qRoot = new THREE.Quaternion();
const qElbow = new THREE.Quaternion();
const qHang = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export type HsinPose = 'idle' | 'wave' | 'photo';

export interface HsinModel {
  root: THREE.Group;
  /** Advances the animation. `speed` in m/s; `look` is a target in world space to turn the head to. */
  update: (dt: number, time: number, speed: number, pose: HsinPose, look: THREE.Vector3 | null) => void;
}

const HAIR_ROOT = new THREE.Color('#b7c6d9');
const HAIR_MID = new THREE.Color('#dde6f0');
const HAIR_TIP = new THREE.Color('#f4f7fb');
const FUR_WHITE = new THREE.Color('#f8f9fc');
const FUR_GREY = new THREE.Color('#9ea5b6');
const FUR_TIP = new THREE.Color('#16141c');

function hairColor(t: number) {
  return t < 0.4 ? HAIR_ROOT.clone().lerp(HAIR_MID, t / 0.4) : HAIR_MID.clone().lerp(HAIR_TIP, (t - 0.4) / 0.6);
}

function tailColor(s: number) {
  const c = FUR_WHITE.clone().lerp(FUR_GREY, THREE.MathUtils.smoothstep(s, 0.48, 0.7));
  return c.lerp(FUR_TIP, THREE.MathUtils.smoothstep(s, 0.68, 0.94));
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function group(name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/** Point on the (slightly egg-shaped) head, theta from the crown, phi around Y with 0 at the face. */
function headPoint(theta: number, phi: number, scale = 1) {
  const r = 0.1 * scale;
  return new THREE.Vector3(Math.sin(theta) * Math.sin(phi) * r * 0.93, Math.cos(theta) * r * 1.12, Math.sin(theta) * Math.cos(phi) * r * 1.03);
}

/** Head sphere with a tapered anime jaw; keeps the sphere UVs for the painted face. */
function headGeometry() {
  const geo = new THREE.SphereGeometry(0.1, 48, 32);
  const pos = geo.getAttribute('position');
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.set(p.x * 0.93, p.y * 1.12, p.z * 1.03);
    if (p.y < 0) {
      const k = Math.pow(-p.y / 0.112, 1.6);
      p.x *= 1 - 0.42 * k;
      p.z = p.z * (1 - 0.3 * k) + 0.012 * k;
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return prepare(geo);
}

function placed(geo: THREE.BufferGeometry, pos: THREE.Vector3, dir: THREE.Vector3, scale = 1, sway?: number) {
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()), new THREE.Vector3(scale, scale, scale));
  const g = geo.clone().applyMatrix4(m);
  if (sway !== undefined) g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(sway), 1));
  return g;
}

function buildHair(head: THREE.Group, spine: THREE.Group, mats: HsinMaterials, detail: number) {
  const rand = rng(7);
  const outward = (p: THREE.Vector3) => p.clone();
  const geos: THREE.BufferGeometry[] = [];

  // Scalp, tilted back so the hairline sits above the brows in front and low at the nape.
  const cap = prepare(new THREE.SphereGeometry(0.106, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, '#cdd8e6');
  cap.scale(0.95, 1.13, 1.05);
  cap.rotateX(-0.38);
  geos.push(cap);

  // Fringe: flat locks falling over the forehead, longer towards the temples.
  for (let k = -9; k <= 9; k++) {
    const phi = k * 0.095;
    const side = Math.abs(k) / 9;
    const root = headPoint(0.24 * Math.PI, phi, 1.02);
    const mid = headPoint(0.38 * Math.PI, phi * 1.05, 1.12);
    const tip = headPoint((0.45 + side * 0.17 + rand() * 0.02) * Math.PI, phi * (1.08 + side * 0.1), 1.08);
    geos.push(strand(curveOf([root.x, root.y, root.z], [mid.x, mid.y, mid.z], [tip.x, tip.y, tip.z]), {
      radius: (t) => 0.021 * Math.sin(Math.min(1, 0.2 + t) * Math.PI * 0.5) * (1 - t) ** 0.6 + 0.0015, flat: 0.22, outward, color: hairColor, segments: 12, radial: 8,
    }));
  }

  // Long locks framing the face down to the collarbone.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const phi = sx * (1.05 + k * 0.2);
      const root = headPoint(0.3 * Math.PI, phi, 1.03);
      const a = headPoint(0.55 * Math.PI, phi, 1.12);
      const len = 0.3 + k * 0.24;
      const wave = 0.012 * (k % 2 ? 1 : -1);
      geos.push(strand(curveOf(
        [root.x, root.y, root.z], [a.x, a.y, a.z],
        [a.x + sx * 0.008 + wave, a.y - len * 0.45, a.z + 0.01], [a.x + sx * 0.012 - wave, a.y - len, a.z + 0.02],
      ), { radius: (t) => 0.02 * (1 - t) ** 0.6 + 0.0015, flat: 0.3, outward, color: hairColor, segments: 16, radial: 8 }));
    }
  }

  // Sides and back swept up into the bun.
  const bun = new THREE.Vector3(0, 0.085, -0.098);
  const sweep = Math.round(26 * detail);
  for (let k = 0; k < sweep; k++) {
    const phi = 1.0 + (k / (sweep - 1)) * (Math.PI * 2 - 2.0);
    const root = headPoint(0.6 * Math.PI, phi, 1.0);
    const mid = headPoint(0.4 * Math.PI, phi * 0.98 + (phi > Math.PI ? 0.08 : -0.08), 1.09);
    const end = bun.clone().add(new THREE.Vector3(Math.sin(phi) * 0.02, -0.01, 0.01));
    geos.push(strand(curveOf([root.x, root.y, root.z], [mid.x, mid.y, mid.z], [end.x, end.y, end.z]), {
      radius: (t) => 0.015 - t * 0.006, flat: 0.45, outward, color: (t) => hairColor(0.25 + t * 0.4), segments: 14, radial: 6,
    }));
  }

  // Braided bun: three strands woven around a tilted ring, with a full core.
  const ringNormal = new THREE.Vector3(0, 0.5, -0.86).normalize();
  const ringA = new THREE.Vector3(1, 0, 0);
  const ringB = new THREE.Vector3().crossVectors(ringNormal, ringA).normalize();
  for (let i = 0; i < 3; i++) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 96; s++) {
      const u = (s / 96) * Math.PI * 2;
      const w = u * 6 + (i * Math.PI * 2) / 3;
      const radial = ringA.clone().multiplyScalar(Math.cos(u)).add(ringB.clone().multiplyScalar(Math.sin(u)));
      const r = 0.042 + Math.cos(w) * 0.011;
      pts.push(bun.clone().add(radial.multiplyScalar(r)).addScaledVector(ringNormal, Math.sin(2 * w) * 0.007 + 0.01));
    }
    geos.push(strand(new THREE.CatmullRomCurve3(pts, true), {
      radius: () => 0.0125, flat: 0.8, outward: (p) => p.clone().sub(bun), color: () => hairColor(0.5), segments: 120, radial: 6,
    }));
  }
  const core = prepare(new THREE.SphereGeometry(0.036, 20, 14), 0, '#d9e2ee');
  core.translate(bun.x, bun.y, bun.z);
  geos.push(core);
  head.add(mesh(merge(geos), mats.hair));

  // Ponytail from under the bun down the back, swaying; lives on the spine so it does not follow head turns.
  const tail: THREE.BufferGeometry[] = [];
  const count = Math.round(18 * detail);
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2;
    const r = 0.012 * Math.sqrt(rand());
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const len = 0.85 + rand() * 0.12;
    tail.push(strand(curveOf(
      [0.01 + ox, 0.735, -0.12 + oz], [0.025 + ox, 0.62, -0.165 + oz], [0.035 + ox * 1.6, 0.45, -0.15 + oz * 1.6],
      [0.045 + ox * 2, 0.3, -0.15 + oz * 2], [0.05 + ox * 1.2, 0.735 - len * 0.78, -0.155 + oz],
    ), {
      radius: (t) => 0.0085 * (1 - t) ** 0.5 + 0.0012, flat: 0.7, outward: () => new THREE.Vector3(0, 0, -1),
      color: (t) => hairColor(0.3 + t * 0.7), segments: 18, radial: 5,
    }));
  }
  spine.add(mesh(merge(tail), mats.ponytail));
  const tie = prepare(new THREE.TorusGeometry(0.014, 0.004, 8, 20));
  tie.rotateX(Math.PI / 2 - 0.4);
  tie.translate(0.015, 0.72, -0.13);
  spine.add(mesh(tie, mats.gold));
}

/** Fox ears with grey-black tips, a pale inner ear and white tufts. */
function buildEars(head: THREE.Group, mats: HsinMaterials) {
  for (const sx of [-1, 1]) {
    const ear = group(sx > 0 ? 'ear-l' : 'ear-r');
    const base = headPoint(0.22 * Math.PI, sx * 0.85, 0.98);
    ear.position.copy(base);
    ear.rotation.set(-0.12, 0, -sx * 0.32);
    const h = 0.15;
    const outerGeo = new THREE.ConeGeometry(0.044, h, 24, 8, true);
    outerGeo.translate(0, h / 2, 0);
    const pos = outerGeo.getAttribute('position');
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      // Flatten, then hollow the front so the cone becomes a cupped ear.
      p.z *= 0.45;
      if (p.z > 0) p.z *= -0.25;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    outerGeo.computeVertexNormals();
    const outer = prepare(outerGeo, 0, (q) => {
      const t = q.y / h;
      return FUR_WHITE.clone().lerp(new THREE.Color('#8c95a8'), THREE.MathUtils.smoothstep(t, 0.55, 0.8)).lerp(new THREE.Color('#2a2d38'), THREE.MathUtils.smoothstep(t, 0.8, 1));
    });
    const innerGeo = new THREE.ConeGeometry(0.03, h * 0.78, 18, 4, true);
    innerGeo.translate(0, h * 0.39, 0);
    innerGeo.scale(1, 1, 0.12);
    innerGeo.translate(0, 0.004, 0.004);
    const inner = prepare(innerGeo, 0, '#ffe2ea');
    const tufts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const x = (k / 6 - 0.5) * 0.04;
      tufts.push(strand(curveOf([x, 0.005, 0.006], [x * 1.2, 0.035, 0.016], [x * 1.5 + sx * 0.004, 0.07, 0.012]), {
        radius: (t) => 0.004 * (1 - t) + 0.0005, outward: () => new THREE.Vector3(0, 0, 1), segments: 6, radial: 4,
      }));
    }
    ear.add(mesh(merge([outer, inner, ...tufts]), mats.ears));
    const ring = prepare(new THREE.TorusGeometry(0.03, 0.0032, 6, 24));
    ring.rotateX(Math.PI / 2);
    ring.scale(1, 1, 0.5);
    ring.translate(0, 0.05, 0);
    ear.add(mesh(ring, mats.gold));
    // White pompom at the base of the ear.
    const pomRand = rng(70 + sx);
    const pom: THREE.BufferGeometry[] = [prepare(new THREE.SphereGeometry(0.022, 14, 10))];
    for (let k = 0; k < 26; k++) {
      const d = new THREE.Vector3(pomRand() - 0.5, pomRand() - 0.5, pomRand() - 0.5).normalize();
      const tip = d.clone().multiplyScalar(0.034 + pomRand() * 0.01);
      pom.push(strand(curveOf([d.x * 0.015, d.y * 0.015, d.z * 0.015], [tip.x * 0.7, tip.y * 0.7, tip.z * 0.7], [tip.x, tip.y, tip.z]), {
        radius: (t) => 0.007 * (1 - t) + 0.0008, outward: () => d, segments: 4, radial: 4,
      }));
    }
    const pomGeo = merge(pom);
    pomGeo.translate(sx * 0.02, 0.005, 0.03);
    ear.add(mesh(pomGeo, mats.fur));
    head.add(ear);
  }
}

/** Ring of fur strands around a limb axis (local Y), hanging outwards and down. */
function furRing(o: { y: number; radius: number; count: number; length: [number, number]; droop: number; seed: number; thickness?: number }) {
  const rand = rng(o.seed);
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < o.count; k++) {
    const a = (k / o.count) * Math.PI * 2 + rand() * 0.2;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const len = THREE.MathUtils.lerp(o.length[0], o.length[1], rand());
    const root = dir.clone().multiplyScalar(o.radius).setY(o.y + (rand() - 0.5) * 0.02);
    const mid = root.clone().addScaledVector(dir, len * 0.45).setY(root.y - len * o.droop * 0.4);
    const tip = root.clone().addScaledVector(dir, len * (0.75 - o.droop * 0.3)).setY(root.y - len * o.droop);
    const thick = (o.thickness ?? 0.012) * (0.7 + rand() * 0.6);
    geos.push(strand(curveOf([root.x, root.y, root.z], [mid.x + (rand() - 0.5) * 0.02, mid.y, mid.z + (rand() - 0.5) * 0.02], [tip.x, tip.y, tip.z]), {
      radius: (t) => thick * Math.cos(t * Math.PI * 0.5) ** 0.6 + 0.0012, flat: 0.45, outward: () => dir,
      color: (t) => new THREE.Color('#d8dce6').lerp(FUR_WHITE, Math.min(1, t * 2.5)), segments: 8, radial: 4,
    }));
  }
  return geos;
}

function buildArm(spine: THREE.Group, side: 1 | -1, mats: HsinMaterials, detail: number) {
  const shoulder = group(side > 0 ? 'shoulder-l' : 'shoulder-r', side * 0.172, 0.44, -0.005);
  shoulder.rotation.z = side * 0.14;
  spine.add(shoulder);
  shoulder.add(mesh(lathe([[0.004, 0.026], [0.028, 0.02], [0.042, 0.003], [0.045, -0.04], [0.039, -0.15], [0.033, -0.26], [0.031, -0.29]]), mats.skin));
  // Off-shoulder sleeve with a fur band at the top.
  shoulder.add(mesh(lathe([[0.066, -0.29], [0.062, -0.2], [0.058, -0.12], [0.054, -0.07]], { segments: 28 }), mats.sleeve));
  shoulder.add(mesh(merge(furRing({ y: -0.07, radius: 0.05, count: Math.round(110 * detail), length: [0.04, 0.075], droop: 0.45, seed: 11 + side, thickness: 0.016 })), mats.fur));
  // Dark feathered pauldron over the top of the shoulder.
  const feathers: THREE.BufferGeometry[] = [];
  const featherRand = rng(31 + side);
  for (let k = 0; k < 11; k++) {
    const a = side * (0.25 + (k / 10) * 2.6);
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const root = dir.clone().multiplyScalar(0.04).setY(0.01 - featherRand() * 0.02);
    const mid = root.clone().addScaledVector(dir, 0.05).setY(root.y + 0.012);
    const tip = root.clone().addScaledVector(dir, 0.1 + featherRand() * 0.03).setY(root.y - 0.05);
    feathers.push(strand(curveOf([root.x, root.y, root.z], [mid.x, mid.y, mid.z], [tip.x, tip.y, tip.z]), {
      radius: (t) => 0.022 * Math.sin(Math.min(1, 0.25 + t) * Math.PI * 0.5) * (1 - t) ** 0.8 + 0.001, flat: 0.18, outward: () => UP,
      color: (t) => new THREE.Color('#6d7282').lerp(new THREE.Color('#15151b'), t), segments: 8, radial: 6,
    }));
  }
  shoulder.add(mesh(merge(feathers), mats.fur));

  const elbow = group(side > 0 ? 'elbow-l' : 'elbow-r', 0, -0.29, 0);
  elbow.rotation.x = -0.18;
  shoulder.add(elbow);
  elbow.add(mesh(lathe([[0.031, 0.012], [0.032, -0.05], [0.027, -0.17], [0.021, -0.24], [0.02, -0.25]]), mats.skin));
  // Wide bell sleeve, cuff at the bottom (points listed hem first so the gold band lands on the hem).
  // Long open sleeve hanging below the hand: red silk outside, pale blue lining, open on the inner side.
  const sleeveAngle = (u: number) => -side * Math.PI / 2 + 0.45 + u * (Math.PI * 2 - 0.9);
  const sleeveRadius = (_u: number, v: number) => 0.066 + 0.11 * v ** 1.2;
  // The sleeve hangs from the elbow on its own pivot; update() turns it so it falls with gravity.
  const drape = group(side > 0 ? 'sleeve-l' : 'sleeve-r');
  elbow.add(drape);
  drape.add(mesh(clothPanel({ angle: sleeveAngle, radius: sleeveRadius, top: 0.02, length: 0.44, cols: 28, rows: 14, sway: () => 0 }), mats.sleeve));
  drape.add(mesh(clothPanel({ angle: sleeveAngle, radius: (u, v) => sleeveRadius(u, v) - 0.005, top: 0.015, length: 0.43, cols: 28, rows: 14, sway: () => 0 }), mats.lining, false));
  drape.add(mesh(merge(furRing({ y: -0.415, radius: 0.165, count: Math.round(130 * detail), length: [0.07, 0.16], droop: 0.9, seed: 21 + side, thickness: 0.016 })), mats.fur));

  const wrist = group(side > 0 ? 'wrist-l' : 'wrist-r', 0, -0.25, 0);
  elbow.add(wrist);
  const palm = prepare(new THREE.SphereGeometry(0.04, 18, 14));
  palm.scale(0.36, 1.1, 0.78);
  palm.translate(0, -0.035, 0);
  const fingers: THREE.BufferGeometry[] = [palm];
  for (let k = 0; k < 4; k++) {
    const z = (k - 1.5) * 0.0125;
    const len = [0.062, 0.07, 0.066, 0.052][k];
    fingers.push(strand(curveOf([0, -0.07, z], [-side * 0.004, -0.07 - len * 0.55, z * 1.05], [-side * 0.012, -0.07 - len, z * 1.1]), {
      radius: (t) => 0.0075 - t * 0.0022, outward: () => new THREE.Vector3(side, 0, 0), segments: 6, radial: 6,
    }));
  }
  fingers.push(strand(curveOf([-side * 0.008, -0.03, 0.022], [-side * 0.016, -0.055, 0.035], [-side * 0.02, -0.08, 0.038]), {
    radius: (t) => 0.0085 - t * 0.002, outward: () => new THREE.Vector3(side, 0, 0), segments: 6, radial: 6,
  }));
  const bracelet = prepare(new THREE.TorusGeometry(0.024, 0.003, 6, 20));
  bracelet.rotateX(Math.PI / 2);
  wrist.add(mesh(merge(fingers), mats.skin), mesh(bracelet, mats.gold));
  return { shoulder, elbow, wrist, drape };
}

function buildLeg(hips: THREE.Group, side: 1 | -1, mats: HsinMaterials) {
  const hip = group(side > 0 ? 'hip-l' : 'hip-r', side * 0.085, -0.05, 0);
  hips.add(hip);
  hip.add(mesh(lathe([[0.074, 0.03], [0.077, -0.06], [0.066, -0.2], [0.052, -0.36], [0.044, -0.43]]), mats.skin));
  const knee = group(side > 0 ? 'knee-l' : 'knee-r', 0, -0.43, 0);
  hip.add(knee);
  knee.add(mesh(lathe([[0.044, 0.012], [0.047, -0.06], [0.046, -0.13], [0.034, -0.28], [0.024, -0.38], [0.023, -0.41]]), mats.skin));
  const ankle = group(side > 0 ? 'ankle-l' : 'ankle-r', 0, -0.41, 0);
  knee.add(ankle);
  const foot = group(side > 0 ? 'foot-l' : 'foot-r');
  foot.rotation.x = 0.55;
  ankle.add(foot);
  foot.add(mesh(strand(curveOf([0, -0.005, -0.035], [0, -0.012, 0.04], [0, -0.012, 0.13]), {
    radius: (t) => (t < 0.6 ? 0.03 - t * 0.012 : 0.023 - (t - 0.6) * 0.03), flat: 0.62, outward: () => UP, segments: 12, radial: 10,
  }), mats.skin));
  // Gold strappy heel: sole, slim heel, ankle and toe straps, a star on the instep.
  const gold: THREE.BufferGeometry[] = [];
  gold.push(strand(curveOf([0, -0.03, -0.04], [0, -0.032, 0.05], [0, -0.03, 0.135]), {
    radius: () => 0.022, flat: 0.12, outward: () => UP, segments: 10, radial: 8,
  }));
  for (const [z, r] of [[0.03, 0.026], [0.085, 0.022]] as const) {
    const strap = prepare(new THREE.TorusGeometry(r, 0.0028, 6, 20));
    strap.scale(1, 0.6, 1);
    strap.rotateY(Math.PI / 2);
    strap.rotateZ(Math.PI / 2);
    strap.translate(0, -0.012, z);
    gold.push(strap);
  }
  gold.push(placed(starGeometry(0.016), new THREE.Vector3(0, 0.012, 0.035), new THREE.Vector3(0, 1, 0.3)));
  foot.add(mesh(merge(gold), mats.gold));
  const ankleStrap = prepare(new THREE.TorusGeometry(0.027, 0.003, 6, 20));
  ankleStrap.rotateX(Math.PI / 2);
  ankleStrap.translate(0, 0.01, 0);
  const heel = prepare(new THREE.CylinderGeometry(0.006, 0.009, 0.075, 8));
  heel.translate(0, -0.06, -0.036);
  ankle.add(mesh(merge([ankleStrap, heel]), mats.gold));
  return { hip, knee, ankle };
}

function buildOutfit(hips: THREE.Group, spine: THREE.Group, mats: HsinMaterials) {
  // Black satin bodice over the front and sides, open at the back.
  spine.add(mesh(lathe([[0.157, -0.06], [0.146, 0.04], [0.124, 0.14], [0.128, 0.22], [0.15, 0.3], [0.156, 0.36]], {
    phiStart: -1.95, phiLength: 3.9, scaleX: 1.12, scaleZ: 0.74, segments: 40,
  }), mats.bodice));
  for (const sx of [-1, 1]) {
    const cup = prepare(new THREE.SphereGeometry(0.066, 24, 16, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6));
    cup.scale(1, 0.9, 0.85);
    cup.translate(sx * 0.058, 0.335, 0.072);
    spine.add(mesh(cup, mats.bodice));
  }
  // Red sash with a bow, gold medallion and a hanging gold tassel.
  const sash = prepare(new THREE.TorusGeometry(0.124, 0.014, 10, 64));
  sash.rotateX(Math.PI / 2);
  sash.scale(1.13, 1, 0.76);
  sash.translate(0, 0.13, 0);
  const bows: THREE.BufferGeometry[] = [sash];
  for (const sx of [-1, 1]) {
    const loop = prepare(new THREE.SphereGeometry(0.024, 14, 10));
    loop.scale(1.6, 0.85, 0.5);
    loop.rotateZ(sx * 0.4);
    loop.translate(sx * 0.034, 0.3, 0.122);
    bows.push(loop);
    bows.push(strand(curveOf([sx * 0.008, 0.29, 0.125], [sx * 0.03, 0.2, 0.128], [sx * 0.036, 0.08, 0.13]), {
      radius: () => 0.01, flat: 0.25, outward: () => new THREE.Vector3(0, 0, 1), segments: 10, radial: 6,
    }));
  }
  spine.add(mesh(merge(bows), mats.sleeve));
  const gold: THREE.BufferGeometry[] = [];
  const frame = prepare(new THREE.TorusGeometry(0.024, 0.004, 8, 28));
  frame.scale(0.8, 1.15, 1);
  frame.translate(0, 0.262, 0.128);
  gold.push(frame, placed(starGeometry(0.04), new THREE.Vector3(0, 0.262, 0.122), new THREE.Vector3(0, 0, 1)));
  const cord = prepare(new THREE.CylinderGeometry(0.0025, 0.0025, 0.3, 6));
  cord.translate(0, 0.08, 0.124);
  gold.push(cord);
  const tassel = prepare(new THREE.ConeGeometry(0.012, 0.07, 10));
  tassel.rotateX(Math.PI);
  tassel.translate(0, -0.1, 0.126);
  gold.push(tassel);
  spine.add(mesh(merge(gold), mats.gold));
  const gem = prepare(new THREE.SphereGeometry(0.02, 20, 14));
  gem.scale(0.8, 1.15, 0.55);
  gem.translate(0, 0.262, 0.132);
  spine.add(mesh(gem, mats.gem));

  // Choker with a gold pendant and a red drop.
  const choker = prepare(new THREE.TorusGeometry(0.043, 0.005, 8, 32));
  choker.rotateX(Math.PI / 2);
  choker.translate(0, 0.585, 0);
  spine.add(mesh(choker, mats.bodice));
  spine.add(mesh(placed(starGeometry(0.012), new THREE.Vector3(0, 0.575, 0.046), new THREE.Vector3(0, 0, 1)), mats.gold));
  const drop = prepare(new THREE.OctahedronGeometry(0.006));
  drop.scale(1, 1.6, 0.7);
  drop.translate(0, 0.56, 0.047);
  spine.add(mesh(drop, mats.ruby));

  // Pale blue chiffon underskirt, open at the front for the high slits.
  hips.add(mesh(clothPanel({
    angle: (u) => 0.52 + u * (Math.PI * 2 - 1.04), radius: (_u, v) => 0.152 + 0.11 * v ** 1.1,
    top: 0.03, length: 0.9, scaleX: 1.1, scaleZ: 0.82, cols: 48, rows: 18,
  }), mats.chiffon, false));
  // Black front panel, slightly away from the legs so a stride does not cut through it.
  hips.add(mesh(clothPanel({
    angle: (u, v) => (u - 0.5) * (0.86 - v * 0.14), radius: (_u, v) => 0.165 + 0.06 * v,
    top: 0.05, length: 0.94, scaleX: 1.05, scaleZ: 0.85, cols: 8, rows: 20,
  }), mats.frontPanel));

  // Long red robe panels hanging from under the arms to the floor, open at the front and down the back.
  const robeAngle = (sx: number) => (u: number) => sx * (0.78 + u * 1.78);
  const robeRadius = (_u: number, v: number) => 0.175 + 0.22 * v ** 1.3;
  const robeTop = 0.38;
  const robeLength = HIPS_Y + robeTop - 0.012;
  const robeGold: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const panel = clothPanel({
      angle: robeAngle(sx), radius: robeRadius, top: robeTop, length: robeLength, scaleX: 1.08, scaleZ: 0.9, cols: 28, rows: 34,
      sway: (_u, v) => Math.pow(v, 1.3),
    });
    // u = 0 is the front edge on both sides, so the red hem stays in front and the fox motif behind.
    hips.add(mesh(panel, mats.robe));
    // Gold tassels on the front edges at mid-thigh.
    const v = 0.45;
    const a = robeAngle(sx)(0.02);
    const r = robeRadius(0, v);
    const at = new THREE.Vector3(Math.sin(a) * r * 1.08, robeTop - v * robeLength, Math.cos(a) * r * 0.9 + 0.006);
    const sway = Math.pow(v, 1.3);
    const ring = prepare(new THREE.TorusGeometry(0.014, 0.003, 6, 16), sway);
    ring.translate(at.x, at.y, at.z);
    const bead = prepare(new THREE.SphereGeometry(0.008, 10, 8), sway);
    bead.translate(at.x, at.y - 0.03, at.z);
    const tas = prepare(new THREE.ConeGeometry(0.011, 0.07, 10), sway);
    tas.rotateX(Math.PI);
    tas.translate(at.x, at.y - 0.075, at.z);
    robeGold.push(ring, bead, tas);
  }
  hips.add(mesh(merge(robeGold), mats.robeGold));
}

function buildTail(hips: THREE.Group, mats: HsinMaterials, detail: number) {
  const spine = curveOf([0, -0.02, -0.12], [0.05, -0.22, -0.33], [0.16, -0.5, -0.6], [0.36, -0.68, -0.9], [0.62, -0.66, -1.1], [0.82, -0.46, -1.2]);
  const radiusAt = (s: number) => 0.055 + 0.23 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.8);
  const frameAt = (s: number) => {
    const t = spine.getTangentAt(s).normalize();
    const side = new THREE.Vector3().crossVectors(t, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, t).normalize();
    return { p: spine.getPointAt(s), t, side, up };
  };
  const rand = rng(42);
  const geos: THREE.BufferGeometry[] = [];
  geos.push(strand(spine, { radius: (s) => radiusAt(s) * 0.82, color: tailColor, sway: (s) => s, segments: 48, radial: 18 }));
  const count = Math.round(170 * detail);
  for (let k = 0; k < count; k++) {
    const s0 = rand() * 0.28;
    const s1 = Math.min(1, s0 + 0.45 + rand() * 0.5);
    const a0 = rand() * Math.PI * 2;
    const f = 0.55 + 0.5 * Math.sqrt(rand());
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const s = s0 + (s1 - s0) * t;
      const { p, side, up } = frameAt(s);
      const a = a0 + t * 0.9;
      const converge = s1 > 0.97 ? 1 - Math.pow(t, 3) * 0.85 : 1 - t * 0.25;
      pts.push(p.addScaledVector(side, Math.cos(a) * radiusAt(s) * f * converge).addScaledVector(up, Math.sin(a) * radiusAt(s) * f * converge));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const thick = 0.03 + rand() * 0.03;
    geos.push(strand(curve, {
      // Swells just after the root, then tapers to a fine tip.
      radius: (t) => thick * Math.sin(Math.min(1, 0.15 + t) * Math.PI * 0.5) * Math.pow(1 - t, 0.7) + 0.002,
      flat: 0.32,
      outward: (p) => {
        const s = s0 + (s1 - s0) * 0.5;
        return p.clone().sub(spine.getPointAt(s));
      },
      color: (t) => tailColor(s0 + (s1 - s0) * t),
      sway: (t) => s0 + (s1 - s0) * t,
      segments: 14,
      radial: 5,
    }));
  }
  const fur = mesh(merge(geos), mats.tail);
  hips.add(fur);
  // Gold four-pointed stars caught in the fur, like the reference.
  const stars: THREE.BufferGeometry[] = [];
  for (const [s, size, around] of [[0.52, 0.06, 0.4], [0.66, 0.075, -0.3], [0.79, 0.065, 0.9], [0.9, 0.05, 0.1]] as const) {
    const { p, side, up } = frameAt(s);
    const out = side.clone().multiplyScalar(Math.cos(around)).addScaledVector(up, Math.sin(around));
    stars.push(placed(starGeometry(size), p.addScaledVector(out, radiusAt(s) * 0.95), out, 1, s));
  }
  hips.add(mesh(merge(stars), mats.tailGold));
}

/** Gold star clips, a hairpin through the bun, dangling chains and drop earrings. */
function buildOrnaments(head: THREE.Group, mats: HsinMaterials) {
  const gold: THREE.BufferGeometry[] = [];
  const bun = new THREE.Vector3(0, 0.085, -0.098);
  gold.push(placed(starGeometry(0.03), bun.clone().add(new THREE.Vector3(0.05, 0.025, 0.02)), new THREE.Vector3(1, 0.4, 0.3)));
  gold.push(placed(starGeometry(0.018), bun.clone().add(new THREE.Vector3(0.058, -0.012, 0.035)), new THREE.Vector3(1, 0.2, 0.5)));
  gold.push(placed(starGeometry(0.02), bun.clone().add(new THREE.Vector3(-0.048, 0.03, 0.01)), new THREE.Vector3(-1, 0.4, 0.2)));
  const pin = prepare(new THREE.CylinderGeometry(0.0028, 0.0028, 0.16, 6));
  pin.rotateZ(1.2);
  pin.translate(bun.x, bun.y + 0.01, bun.z - 0.01);
  gold.push(pin);
  // Chains with tassels hanging from the right clip.
  for (let k = 0; k < 3; k++) {
    const x = 0.05 + k * 0.008;
    for (let b = 0; b < 4; b++) {
      const bead = prepare(new THREE.SphereGeometry(0.0035, 6, 5));
      bead.translate(x, bun.y - 0.005 - b * 0.014 - k * 0.006, bun.z + 0.035 + k * 0.006);
      gold.push(bead);
    }
    const t = prepare(new THREE.ConeGeometry(0.0055, 0.03, 8));
    t.rotateX(Math.PI);
    t.translate(x, bun.y - 0.075 - k * 0.006, bun.z + 0.035 + k * 0.006);
    gold.push(t);
  }
  for (const sx of [-1, 1]) {
    const hook = prepare(new THREE.CylinderGeometry(0.0018, 0.0018, 0.04, 6));
    hook.translate(sx * 0.093, -0.035, 0.0);
    gold.push(hook, placed(starGeometry(0.009), new THREE.Vector3(sx * 0.094, -0.06, 0.004), new THREE.Vector3(sx, 0, 0.6)));
    const t = prepare(new THREE.ConeGeometry(0.004, 0.026, 8));
    t.rotateX(Math.PI);
    t.translate(sx * 0.094, -0.08, 0.002);
    gold.push(t);
  }
  head.add(mesh(merge(gold), mats.gold));
}

export function buildHsinModel(renderer: THREE.WebGLRenderer, detail = 1): HsinModel {
  const mats = createHsinMaterials(renderer, detail);
  const root = new THREE.Group();
  root.name = 'npc-hsin';
  const hips = group('hips', 0, HIPS_Y, 0);
  root.add(hips);
  hips.add(mesh(lathe([[0.12, -0.12], [0.16, -0.05], [0.158, 0.04], [0.14, 0.08]], { scaleX: 1.1, scaleZ: 0.76 }), mats.skin));
  const spine = group('spine', 0, 0.04, 0);
  hips.add(spine);
  spine.add(mesh(lathe([[0.15, -0.04], [0.14, 0.04], [0.118, 0.14], [0.122, 0.22], [0.144, 0.3], [0.148, 0.36], [0.143, 0.42], [0.118, 0.47], [0.058, 0.52], [0.044, 0.54]], { scaleX: 1.12, scaleZ: 0.72, segments: 40 }), mats.skin));
  for (const sx of [-1, 1]) {
    const bust = prepare(new THREE.SphereGeometry(0.06, 24, 16));
    bust.scale(1, 0.9, 0.85);
    bust.translate(sx * 0.058, 0.338, 0.07);
    spine.add(mesh(bust, mats.skin));
  }
  spine.add(mesh(lathe([[0.046, 0.5], [0.042, 0.56], [0.04, 0.63]], { segments: 24 }), mats.skin));
  const neck = group('neck', 0, 0.6, 0);
  spine.add(neck);
  const head = group('head', 0, 0.065, 0.006);
  neck.add(head);
  head.add(mesh(headGeometry(), mats.face));

  buildHair(head, spine, mats, detail);
  buildEars(head, mats);
  buildOrnaments(head, mats);
  buildOutfit(hips, spine, mats);
  buildTail(hips, mats, detail);
  const armL = buildArm(spine, 1, mats, detail);
  const armR = buildArm(spine, -1, mats, detail);
  const legL = buildLeg(hips, 1, mats);
  const legR = buildLeg(hips, -1, mats);
  const ears = head.children.filter((c) => c.name.startsWith('ear-'));

  // Animation state.
  let phase = 0;
  let headYaw = 0;
  let headPitch = 0;
  const blend = { wave: 0, photo: 0 };
  const lookLocal = new THREE.Vector3();
  const swayList = Object.values(mats.sway);

  const update: HsinModel['update'] = (dt, time, speed, pose, look) => {
    const amt = Math.min(1, speed / 0.9);
    phase += dt * speed * 5.6;
    const k = 1 - Math.exp(-6 * dt);
    blend.wave += ((pose === 'wave' ? 1 : 0) - blend.wave) * k;
    blend.photo += ((pose === 'photo' ? 1 : 0) - blend.photo) * k;
    const s = Math.sin(phase);
    const c = Math.cos(phase);

    // Hips: bob, sway and twist while walking; slow weight shift when idle.
    hips.position.y = HIPS_Y + Math.cos(phase * 2) * 0.012 * amt - 0.004 * (1 - amt);
    hips.rotation.y = s * 0.09 * amt;
    hips.rotation.z = s * 0.035 * amt + Math.sin(time * 0.45) * 0.02 * (1 - amt);
    spine.rotation.y = -s * 0.07 * amt;
    spine.rotation.x = 0.02 * amt;
    spine.scale.setScalar(1 + Math.sin(time * 1.7) * 0.006);

    // Legs: thighs swing, knees fold on the forward swing, heel-walk pitch of the feet stays.
    legL.hip.rotation.x = -s * 0.36 * amt;
    legR.hip.rotation.x = s * 0.36 * amt;
    legL.knee.rotation.x = amt * (0.12 + 0.55 * Math.max(0, c));
    legR.knee.rotation.x = amt * (0.12 + 0.55 * Math.max(0, -c));
    legL.ankle.rotation.x = -legL.hip.rotation.x * 0.3 - legL.knee.rotation.x * 0.5;
    legR.ankle.rotation.x = -legR.hip.rotation.x * 0.3 - legR.knee.rotation.x * 0.5;
    // Idle: the right knee relaxes slightly.
    legR.knee.rotation.x += 0.08 * (1 - amt);
    legR.hip.rotation.x -= 0.04 * (1 - amt);

    // Arms: natural swing; the right arm waves, and for a photo both hands meet in front of the waist.
    const swing = s * 0.22 * amt;
    const p = blend.photo;
    const w = blend.wave;
    const mix = (rest: number, wave: number, photo: number) => rest + (wave - rest) * w + (photo - rest) * p;
    armL.shoulder.rotation.set(
      mix(swing - 0.05 * (1 - amt), swing - 0.05 * (1 - amt), PHOTO.leftShoulder[0]),
      mix(0, 0, PHOTO.leftShoulder[1]),
      mix(0.14 + Math.sin(time * 1.1) * 0.01, 0.14, PHOTO.leftShoulder[2]),
    );
    armL.elbow.rotation.set(mix(-0.2 - 0.15 * amt, -0.2 - 0.15 * amt, PHOTO.leftElbow[0]), mix(0, 0, PHOTO.leftElbow[1]), mix(0, 0, PHOTO.leftElbow[2]));
    armR.shoulder.rotation.set(
      mix(-swing - 0.05 * (1 - amt), -0.25, PHOTO.rightShoulder[0]),
      mix(0, 0.2, PHOTO.rightShoulder[1]),
      mix(-0.14, -2.35 + Math.sin(time * 6.5) * 0.08, PHOTO.rightShoulder[2]),
    );
    armR.elbow.rotation.set(
      mix(-0.2 - 0.15 * amt, -0.6 + Math.sin(time * 6.5 + 0.6) * 0.3, PHOTO.rightElbow[0]),
      mix(0, 0, PHOTO.rightElbow[1]),
      mix(0, 0, PHOTO.rightElbow[2]),
    );
    armR.wrist.rotation.set(0, 0, 0.3 * w);

    // Sleeves fall with gravity: mostly hanging straight down, following the arm a little.
    hips.updateWorldMatrix(true, true);
    root.getWorldQuaternion(qRoot);
    for (const arm of [armL, armR]) {
      arm.elbow.getWorldQuaternion(qElbow);
      qHang.copy(qElbow).slerp(qRoot, 0.8);
      arm.drape.quaternion.copy(qElbow.invert().multiply(qHang));
    }

    // Head: turns towards the visitor within a natural range, tilts for the photo.
    let yaw = Math.sin(time * 0.35) * 0.12;
    let pitch = 0.03;
    if (look) {
      head.updateWorldMatrix(true, false);
      lookLocal.copy(look);
      neck.worldToLocal(lookLocal);
      yaw = THREE.MathUtils.clamp(Math.atan2(lookLocal.x, lookLocal.z), -0.6, 0.6);
      pitch = THREE.MathUtils.clamp(-Math.atan2(lookLocal.y - 0.1, Math.hypot(lookLocal.x, lookLocal.z)), -0.25, 0.3);
    }
    headYaw += (yaw - headYaw) * (1 - Math.exp(-5 * dt));
    headPitch += (pitch - headPitch) * (1 - Math.exp(-5 * dt));
    head.rotation.set(headPitch, headYaw, (0.12 + Math.sin(time * 0.9) * 0.02) * blend.photo + 0.06 * blend.wave);

    // Ears: a quick twitch every few seconds.
    ears.forEach((ear, i) => {
      const tw = Math.max(0, Math.sin(time * 1.3 + i * 2.1) - 0.93) * 6;
      ear.rotation.x = -0.12 - tw * 0.25;
    });

    // Cloth, hair and tail sway; the tail and robe trail behind while walking.
    for (const u of swayList) u.uTime.value = time;
    mats.sway.tail.uDrag.value.set(s * 0.12 * amt, 0.1 * amt, 0.08 * amt);
    mats.sway.robe.uDrag.value.set(0, 0.03 * amt, -0.12 * amt);
    mats.sway.chiffon.uDrag.value.set(0, 0.02 * amt, -0.06 * amt);
    mats.sway.front.uDrag.value.set(0, 0.03 * amt, 0.05 * amt * Math.abs(s));
    mats.sway.ponytail.uDrag.value.set(0, 0, -0.05 * amt);
  };

  update(0, 0, 0, 'idle', null);
  return { root, update };
}
