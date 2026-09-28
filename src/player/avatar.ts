import * as THREE from 'three';
import { toon } from '../scene/materials';

export interface Avatar {
  root: THREE.Group;
  /** Advances the walk cycle. `speed` in m/s. */
  animate: (dt: number, speed: number) => void;
}

function limb(radius: number, length: number, color: string) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), toon(color));
  mesh.position.y = -length / 2 - radius * 0.6;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/** Chibi visitor (~1.6 m) built from primitives. Local +Z is the front. */
export function createAvatar(shirt = '#ff8fc7'): Avatar {
  const root = new THREE.Group();
  root.name = 'avatar';
  const body = new THREE.Group();
  root.add(body);

  const skin = '#ffe2d1';
  const hairColor = '#5b4a7a';

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 6, 16), toon(shirt));
  torso.position.y = 0.78;
  torso.castShadow = true;
  body.add(torso);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, 0.2, 16), toon('#7aa7ff'));
  skirt.position.y = 0.6;
  skirt.castShadow = true;
  body.add(skirt);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.28;
  body.add(headGroup);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), toon(skin));
  head.castShadow = true;
  headGroup.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(hairColor));
  hair.rotation.x = -0.35;
  hair.position.set(0, 0.03, -0.03);
  hair.castShadow = true;
  headGroup.add(hair);
  for (const sx of [-1, 1]) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), toon(hairColor));
    bun.position.set(sx * 0.24, 0.2, -0.08);
    headGroup.add(bun);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), toon('#2b2640'));
    eye.position.set(sx * 0.1, -0.02, 0.27);
    eye.scale.set(1, 1.3, 0.6);
    headGroup.add(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: '#ffadc6', transparent: true, opacity: 0.8 }));
    cheek.position.set(sx * 0.17, -0.1, 0.262);
    cheek.rotation.y = sx * 0.55;
    headGroup.add(cheek);
  }

  const arms = [-1, 1].map((sx) => {
    const arm = limb(0.065, 0.3, skin);
    arm.position.set(sx * 0.27, 0.98, 0);
    arm.rotation.z = sx * 0.12;
    body.add(arm);
    return arm;
  });
  const legs = [-1, 1].map((sx) => {
    const leg = limb(0.08, 0.28, '#4b4766');
    leg.position.set(sx * 0.1, 0.52, 0);
    root.add(leg);
    return leg;
  });

  // Soft contact shadow so the avatar reads well even outside the shadow map.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 24),
    new THREE.MeshBasicMaterial({ color: '#3a2f5a', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.07;
  root.add(blob);

  let phase = 0;
  let idle = 0;
  const animate = (dt: number, speed: number) => {
    const moving = speed > 0.1;
    const amount = Math.min(1, speed / 4.5);
    phase += dt * (moving ? 4 + speed * 1.4 : 0);
    idle += dt;
    const swing = Math.sin(phase) * 0.75 * amount;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.9;
    arms[1].rotation.x = swing * 0.9;
    body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.06 * amount : Math.sin(idle * 2) * 0.012;
    headGroup.rotation.z = moving ? Math.sin(phase) * 0.04 * amount : Math.sin(idle * 1.3) * 0.03;
  };

  return { root, animate };
}
