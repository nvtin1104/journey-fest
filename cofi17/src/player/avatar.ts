import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, toonUnique } from '../scene/materials';

export type Gender = 'male' | 'female';

export interface Avatar {
  root: THREE.Group;
  gender: Gender;
  /** Advances the walk cycle. `speed` in m/s. */
  animate: (dt: number, speed: number) => void;
  dispose: () => void;
}

const COLORS = {
  skin: '#ffe1cf',
  shirt: '#f4f0e6',
  navy: '#2d3752',
  hairMale: '#1f1d29',
  hairFemale: '#2b2231',
  strap: '#8a5a36',
  camera: '#1d1c24',
  lens: '#5f93b3',
  shoe: '#18171d',
  glasses: '#6b4f3a',
  outline: '#241f33',
};

/** Width (m) of the dark inverted-hull outline around the character. */
const OUTLINE = 0.011;

let outlineMaterial: THREE.MeshBasicMaterial | null = null;

/** Back-face material pushed out along the normals: the classic toon outline. */
function getOutlineMaterial() {
  if (outlineMaterial) return outlineMaterial;
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: OUTLINE };
    shader.vertexShader = `uniform float outlineWidth;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize( normal ) * outlineWidth;',
    );
  };
  mat.customProgramCacheKey = () => 'toon-outline';
  outlineMaterial = mat;
  return mat;
}

let cheekMaterial: THREE.MeshBasicMaterial | null = null;
function getCheekMaterial() {
  cheekMaterial ??= new THREE.MeshBasicMaterial({ color: '#ffb3c6', transparent: true, opacity: 0.7, depthWrite: false });
  return cheekMaterial;
}

/** Soft round contact shadow texture. */
let blobTexture: THREE.CanvasTexture | null = null;
function getBlobTexture() {
  if (blobTexture) return blobTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,30,70,0.55)');
  g.addColorStop(0.6, 'rgba(40,30,70,0.25)');
  g.addColorStop(1, 'rgba(40,30,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

interface PartOptions {
  outline?: boolean;
  shadow?: boolean;
}

function part(geo: THREE.BufferGeometry, color: string, opts: PartOptions = {}) {
  const mesh = new THREE.Mesh(geo, toon(color));
  mesh.castShadow = opts.shadow ?? true;
  if (opts.outline ?? true) {
    const hull = new THREE.Mesh(geo, getOutlineMaterial());
    hull.castShadow = false;
    hull.raycast = () => {};
    mesh.add(hull);
  }
  return mesh;
}

/**
 * Merges the static meshes directly under `group` into one mesh per material (plus one outline hull),
 * so the ~90 modelling parts cost a few dozen draw calls. Groups (animated pivots) are left alone,
 * as are meshes flagged with `userData.keep`.
 */
function mergeStatic(group: THREE.Object3D) {
  const outline = getOutlineMaterial();
  const buckets = new Map<string, { material: THREE.Material; castShadow: boolean; geos: THREE.BufferGeometry[]; hulls: THREE.BufferGeometry[] }>();
  const meshes = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && !c.userData.keep);
  for (const m of meshes) {
    m.updateMatrix();
    const material = m.material as THREE.Material;
    const key = `${material.uuid}|${m.castShadow}`;
    const bucket = buckets.get(key) ?? { material, castShadow: m.castShadow, geos: [], hulls: [] };
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    bucket.geos.push(geo);
    if (m.children.some((c) => c instanceof THREE.Mesh && c.material === outline)) bucket.hulls.push(geo);
    buckets.set(key, bucket);
    group.remove(m);
  }
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.material);
    mesh.castShadow = b.castShadow;
    if (b.hulls.length) {
      const hull = new THREE.Mesh(mergeGeometries(b.hulls), outline);
      hull.castShadow = false;
      hull.raycast = () => {};
      mesh.add(hull);
    }
    group.add(mesh);
    b.geos.forEach((g) => g.dispose());
  }
}

/** A thin strap between two points (in the parent's space). */
function strap(a: THREE.Vector3, b: THREE.Vector3, width: number, color: string) {
  const len = a.distanceTo(b);
  const mesh = part(new THREE.BoxGeometry(width, 0.012, len), color, { outline: false, shadow: false });
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  return mesh;
}

function maleHair(head: THREE.Group) {
  const c = COLORS.hairMale;
  const cap = part(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), c);
  cap.rotation.x = -0.25;
  cap.position.set(0, 0.015, -0.015);
  head.add(cap);
  // Messy spikes around the crown and back.
  const spike = new THREE.ConeGeometry(0.055, 0.17, 6);
  const spikes: Array<[number, number, number]> = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spikes.push([a, 0.35 + (i % 3) * 0.12, 0.2]);
  }
  for (let i = 0; i < 6; i++) spikes.push([(i / 6) * Math.PI * 2 + 0.3, 0.1, 0.19]);
  for (const [a, tilt, r] of spikes) {
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(tilt), Math.sin(tilt) + 0.35, Math.cos(a) * Math.cos(tilt) - 0.25).normalize();
    const m = part(spike, c);
    m.position.copy(dir).multiplyScalar(r * 0.85).add(new THREE.Vector3(0, 0.03, -0.02));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.add(m);
  }
  // Fringe falling over the forehead.
  for (let i = -2; i <= 2; i++) {
    const m = part(new THREE.ConeGeometry(0.045, 0.14, 5), c);
    m.position.set(i * 0.055, 0.1, 0.155 - Math.abs(i) * 0.015);
    m.rotation.set(Math.PI - 0.5, 0, i * 0.18);
    head.add(m);
  }
}

function femaleHair(head: THREE.Group) {
  const c = COLORS.hairFemale;
  const cap = part(new THREE.SphereGeometry(0.205, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), c);
  cap.rotation.x = -0.32;
  cap.position.set(0, 0.01, -0.01);
  head.add(cap);
  // Long hair down the back to the shoulder blades.
  const back = part(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), c);
  back.scale.set(1.05, 1, 0.55);
  back.position.set(0, -0.2, -0.1);
  head.add(back);
  // Side locks framing the face.
  for (const sx of [-1, 1]) {
    const lock = part(new THREE.CapsuleGeometry(0.05, 0.22, 4, 10), c);
    lock.position.set(sx * 0.16, -0.1, 0.04);
    lock.rotation.z = sx * 0.12;
    head.add(lock);
  }
  // Straight-cut fringe.
  const fringe = part(new THREE.SphereGeometry(0.2, 24, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.2, Math.PI * 0.16), c);
  fringe.position.set(0, 0.02, 0.012);
  head.add(fringe);
  const clip = part(new THREE.SphereGeometry(0.035, 12, 10), '#ff8fb8');
  clip.position.set(0.13, 0.12, 0.12);
  head.add(clip);
}

function face(head: THREE.Group, gender: Gender) {
  for (const sx of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.022, 12, 10), '#2b2640', { outline: false, shadow: false });
    eye.scale.set(1, gender === 'female' ? 1.45 : 1.2, 0.5);
    eye.position.set(sx * 0.065, -0.005, 0.178);
    head.add(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), getCheekMaterial());
    cheek.position.set(sx * 0.1, -0.06, 0.168);
    cheek.rotation.y = sx * 0.5;
    head.add(cheek);
    const ear = part(new THREE.SphereGeometry(0.035, 10, 8), COLORS.skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(sx * 0.19, -0.01, 0);
    head.add(ear);
  }
  const mouth = part(new THREE.BoxGeometry(0.035, 0.007, 0.01), '#8a4a55', { outline: false, shadow: false });
  mouth.position.set(0, -0.085, 0.172);
  head.add(mouth);
  if (gender === 'male') {
    // Round glasses.
    const ringGeo = new THREE.TorusGeometry(0.042, 0.0055, 8, 24);
    for (const sx of [-1, 1]) {
      const ring = part(ringGeo, COLORS.glasses, { outline: false, shadow: false });
      ring.position.set(sx * 0.066, -0.005, 0.19);
      head.add(ring);
      const arm = part(new THREE.BoxGeometry(0.006, 0.006, 0.17), COLORS.glasses, { outline: false, shadow: false });
      arm.position.set(sx * 0.108, 0, 0.1);
      head.add(arm);
    }
    const bridge = part(new THREE.BoxGeometry(0.05, 0.006, 0.006), COLORS.glasses, { outline: false, shadow: false });
    bridge.position.set(0, 0.005, 0.19);
    head.add(bridge);
  }
}

/** Visitor character in the style of the reference art: white shirt, camera on a neck strap, navy bottoms. */
export function createAvatar(gender: Gender): Avatar {
  const root = new THREE.Group();
  root.name = `avatar-${gender}`;
  const body = new THREE.Group();
  root.add(body);
  const female = gender === 'female';
  const shoulder = female ? 0.175 : 0.195;
  const hipY = 0.84;

  // Legs: wide trousers (male) or slim legs under a long skirt (female). Pivot at the hip.
  const legs = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.085, hipY, 0);
    const legLen = 0.76;
    const leg = female
      ? part(new THREE.CylinderGeometry(0.04, 0.04, legLen, 10), COLORS.skin, { outline: false })
      : part(new THREE.CylinderGeometry(0.08, 0.105, legLen, 14), COLORS.navy);
    leg.position.y = -legLen / 2;
    pivot.add(leg);
    const shoe = part(new THREE.SphereGeometry(0.07, 14, 10), COLORS.shoe);
    shoe.scale.set(1, 0.55, 1.5);
    shoe.position.set(0, -legLen - 0.015, 0.035);
    pivot.add(shoe);
    root.add(pivot);
    return pivot;
  });

  let skirt: THREE.Mesh | null = null;
  if (female) {
    skirt = part(new THREE.CylinderGeometry(0.15, 0.27, 0.72, 24, 1, true), COLORS.navy);
    // Open cylinder: its own double-sided material so the shared navy material stays single-sided.
    skirt.material = toonUnique(COLORS.navy, { side: THREE.DoubleSide });
    skirt.userData.keep = true; // animated separately
    skirt.position.y = hipY - 0.33;
    body.add(skirt);
    const waist = part(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20), COLORS.navy);
    waist.position.y = hipY + 0.03;
    body.add(waist);
  } else {
    const hips = part(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 20), COLORS.navy);
    hips.position.y = hipY;
    body.add(hips);
  }

  // Shirt: rounded torso, untucked hem, stand collar and a button placket.
  const torso = part(new THREE.CapsuleGeometry(female ? 0.14 : 0.155, 0.3, 8, 20), COLORS.shirt);
  torso.scale.set(1, 1, 0.78);
  torso.position.y = 1.08;
  body.add(torso);
  const hem = part(new THREE.CylinderGeometry(female ? 0.15 : 0.16, female ? 0.165 : 0.175, 0.14, 20), COLORS.shirt);
  hem.scale.z = 0.82;
  hem.position.y = hipY + 0.1;
  body.add(hem);
  const collar = part(new THREE.CylinderGeometry(0.062, 0.07, 0.05, 16), COLORS.shirt);
  collar.position.y = 1.35;
  body.add(collar);
  for (let i = 0; i < 4; i++) {
    const b = part(new THREE.SphereGeometry(0.011, 8, 6), '#b7ab96', { outline: false, shadow: false });
    b.position.set(0.012, 1.3 - i * 0.1, 0.123 - Math.abs(i - 1.5) * 0.004);
    body.add(b);
  }

  // Camera hanging on a neck strap.
  const cam = new THREE.Group();
  cam.position.set(-0.03, 1.07, 0.155);
  const camBody = part(new THREE.BoxGeometry(0.15, 0.095, 0.065), COLORS.camera);
  cam.add(camBody);
  const lens = part(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 18), COLORS.lens);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.012, -0.004, 0.05);
  cam.add(lens);
  const top = part(new THREE.BoxGeometry(0.05, 0.02, 0.04), COLORS.camera, { outline: false });
  top.position.set(-0.035, 0.055, 0);
  cam.add(top);
  body.add(cam);
  for (const sx of [-1, 1]) {
    body.add(strap(new THREE.Vector3(sx * 0.075, 1.35, 0.04), new THREE.Vector3(-0.03 + sx * 0.07, 1.08, 0.14), 0.022, COLORS.strap));
  }

  // Head.
  const head = new THREE.Group();
  head.position.y = 1.5;
  body.add(head);
  const neck = part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12), COLORS.skin, { outline: false });
  neck.position.y = 1.39;
  body.add(neck);
  const skull = part(new THREE.SphereGeometry(0.19, 28, 20), COLORS.skin);
  skull.scale.set(1, 1.04, 0.96);
  head.add(skull);
  face(head, gender);
  if (female) femaleHair(head);
  else maleHair(head);

  // Arms: sleeve, cuff and hand, pivot at the shoulder.
  const arms = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * shoulder, 1.27, 0);
    pivot.rotation.z = sx * 0.1;
    if (female) {
      const puff = part(new THREE.SphereGeometry(0.075, 14, 10), COLORS.shirt);
      puff.position.y = -0.02;
      pivot.add(puff);
    }
    const sleeve = part(new THREE.CapsuleGeometry(0.052, 0.34, 6, 12), COLORS.shirt);
    sleeve.position.y = -0.21;
    pivot.add(sleeve);
    const hand = part(new THREE.SphereGeometry(0.045, 12, 10), COLORS.skin);
    hand.position.y = -0.45;
    pivot.add(hand);
    body.add(pivot);
    return pivot;
  });

  for (const g of [head, body, cam, ...arms, ...legs]) mergeStatic(g);

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.075;
  blob.renderOrder = 1;
  root.add(blob);

  let phase = 0;
  let idle = 0;
  const animate = (dt: number, speed: number) => {
    const moving = speed > 0.1;
    const amount = Math.min(1, speed / 4.5);
    phase += dt * (moving ? 4 + speed * 1.3 : 0);
    idle += dt;
    const swing = Math.sin(phase) * (female ? 0.45 : 0.6) * amount;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8;
    arms[1].rotation.x = swing * 0.8;
    body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.045 * amount : Math.sin(idle * 2) * 0.008;
    head.rotation.z = moving ? Math.sin(phase) * 0.035 * amount : Math.sin(idle * 1.3) * 0.025;
    cam.rotation.x = moving ? Math.sin(phase * 2) * 0.12 * amount : 0;
    if (skirt) skirt.rotation.z = Math.sin(phase) * 0.05 * amount;
  };

  const dispose = () => {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  };

  return { root, gender, animate, dispose };
}
