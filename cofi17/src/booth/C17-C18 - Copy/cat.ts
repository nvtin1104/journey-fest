import * as THREE from 'three';
export type CatAction = 'walk' | 'sit' | 'scratch' | 'groom';

/** Smooth ginger cat rig; all animation pivots keep their original mesh scale. */
export function createCat() {
  const root = new THREE.Group();
  root.name = 'c17-c18-gold-cat';
  const fur = new THREE.MeshStandardMaterial({ color: '#dba34e', roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0d4', roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#34281e', roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: '#d99787', roughness: 0.8 });
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  function oval(parent: THREE.Object3D, material: THREE.Material, size: number[], position: number[]) {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const torso = new THREE.Group();
  root.add(torso);
  oval(torso, fur, [0.14, 0.15, 0.25], [0, 0.26, -0.025]);
  oval(torso, cream, [0.1, 0.12, 0.13], [0, 0.25, 0.12]);
  const head = new THREE.Group();
  head.position.set(0, 0.4, 0.21);
  torso.add(head);
  oval(head, fur, [0.13, 0.12, 0.115], [0, 0, 0]);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.064, 0.14, 32), fur);
    ear.position.set(side * 0.085, 0.13, -0.025);
    ear.rotation.z = side * -0.2;
    ear.scale.z = 0.6;
    head.add(ear);
    oval(head, pink, [0.025, 0.045, 0.009], [side * 0.083, 0.13, 0.005]);
    oval(head, cream, [0.05, 0.036, 0.043], [side * 0.033, -0.038, 0.097]);
    oval(head, dark, [0.019, 0.024, 0.01], [side * 0.058, 0.017, 0.097]);
    oval(head, cream, [0.006, 0.007, 0.004], [side * 0.058 - 0.004, 0.025, 0.106]);
  }
  oval(head, pink, [0.017, 0.011, 0.011], [0, -0.027, 0.139]);
  const legs = [-1, 1].flatMap(side => [-1, 1].map(end => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.085, 0.22, end * 0.16);
    root.add(pivot);
    oval(pivot, fur, [0.041, 0.1, 0.043], [0, -0.085, 0]);
    oval(pivot, cream, [0.05, 0.035, 0.068], [0, -0.185, 0.022]);
    return pivot;
  }));
  const tail = new THREE.Group();
  tail.position.set(0, 0.28, -0.24);
  root.add(tail);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0.08, -0.12), new THREE.Vector3(0, 0.23, -0.19), new THREE.Vector3(0.04, 0.32, -0.16)]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.028, 12, false), fur));
  return { root, animate(time: number, action: CatAction) {
    const sitting = action !== 'walk';
    torso.position.y = sitting ? -0.045 : Math.abs(Math.sin(time * 6)) * 0.008;
    torso.rotation.x = sitting ? -0.2 : 0;
    legs.forEach((leg, index) => {
      leg.rotation.set(sitting ? (index % 2 ? -0.7 : 0.15) : Math.sin(time * 6 + (index === 0 || index === 3 ? 0 : Math.PI)) * 0.28, 0, 0);
    });
    head.rotation.x = 0;
    head.rotation.z = 0;
    head.rotation.y = Math.sin(time * 0.8) * 0.08;
    if (action === 'scratch') {
      legs[0].rotation.set(-1.9 + Math.sin(time * 17) * 0.3, 0, -0.65);
      head.rotation.z = -0.2;
      head.rotation.y = -0.25;
    } else if (action === 'groom') {
      legs[1].rotation.x = -1.5;
      head.rotation.x = 0.45 + Math.sin(time * 5) * 0.12;
      head.rotation.y = -0.2;
    }
    tail.rotation.z = Math.sin(time * 1.6) * 0.15;
  } };
}
