import * as THREE from 'three';
import { exportHsinGLB } from './export';
import { buildHsinModel, type HsinPose } from './model';

/**
 * Dev-only lab page (tools/hsin-lab.html): shows the code-built model on a turntable and exports
 * it as models/hsin/hsin.glb. scripts/export-hsin.mjs drives `window.__hsinExport` headlessly.
 */

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0a0e');
scene.add(new THREE.HemisphereLight('#e6e3ff', '#f6f0ff', 2.2));
const sun = new THREE.DirectionalLight('#fff0da', 1.35);
sun.position.set(3, 6, 4);
sun.castShadow = true;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: '#2a2630' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0, 1.2, 4.6);
camera.lookAt(0, 0.95, 0);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ?pose=wave|photo|idle&yaw=<radians> shows one held pose from a fixed angle instead of the turntable.
const params = new URLSearchParams(location.search);
const pose = (params.get('pose') ?? 'idle') as HsinPose;
const fixedYaw = params.has('yaw') ? Number(params.get('yaw')) : null;
const look = pose === 'idle' ? null : new THREE.Vector3(0, 1.45, 3);
const model = buildHsinModel(renderer, 1);
scene.add(model.root);
for (let i = 0; i < 120; i++) model.update(1 / 30, i / 30, 0, pose, look);
const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const t = 4 + timer.getElapsed();
  model.update(Math.min(timer.getDelta(), 0.05), t, 0, pose, look);
  const yaw = fixedYaw ?? t * 0.4;
  camera.position.set(Math.sin(yaw) * 4.6, 1.2, Math.cos(yaw) * 4.6);
  camera.lookAt(0, 0.95, 0);
  renderer.render(scene, camera);
});

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

Object.assign(window, { __hsinExport: async () => toBase64(await exportHsinGLB(renderer)) });

const status = document.getElementById('status')!;
document.getElementById('export')!.addEventListener('click', async () => {
  status.textContent = 'Đang xuất…';
  const glb = await exportHsinGLB(renderer);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  link.download = 'hsin.glb';
  link.click();
  status.textContent = `Xong: ${(glb.byteLength / 1048576).toFixed(1)} MB (chưa tối ưu, chạy pnpm export:hsin để nén)`;
});
