/**
 * Entry point. Loads only what the start screen needs: the venue shell (floors, walls, coloured
 * blocks for stands) under a slowly spinning overview camera. The detailed scene, the character
 * and the HUD live in `experience.ts`, fetched as a separate chunk when the visitor presses Start.
 */
import * as THREE from 'three';
import './ui/style.css';
import snapshot from './data/event-map.json';
import type { EventMapData } from './data/types';
import { worldRect } from './map/coords';
import { parseMap } from './map/parse';
import { FollowCamera } from './player/camera';
import { buildGround } from './scene/ground';
import { buildProxies } from './scene/proxies';
import { createScene, followSun } from './scene/setup';
import { buildWalls } from './scene/walls';
import { setupStartScreen } from './ui/start';
import type { Experience } from './experience';

async function loadData(): Promise<EventMapData> {
  const url = import.meta.env.VITE_MAP_URL as string | undefined;
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as EventMapData;
    } catch (err) {
      console.warn('Live map unavailable, using the bundled snapshot.', err);
    }
  }
  return snapshot as EventMapData;
}

async function main() {
  const app = document.getElementById('app')!;
  const hudRoot = document.getElementById('hud')!;

  const map = parseMap(await loadData());
  const ctx = createScene(app);
  const { scene, camera, renderer, sun, sky } = ctx;

  scene.add(buildGround(map));
  const walls = buildWalls(map);
  scene.add(walls.group);
  const proxies = buildProxies(map);
  scene.add(proxies);

  const b = worldRect(map.bounds);
  const center = new THREE.Vector3(b.cx, 0, b.cz);
  const occluders = [...walls.occluders];
  const follow = new FollowCamera(camera, renderer.domElement, occluders, center);
  follow.startShowcase();

  let experience: Experience | null = null;
  const start = setupStartScreen(async (gender) => {
    try {
      // Prefetch starts on hover/focus too (see below); this await is usually instant.
      const { startExperience } = await import('./experience');
      experience = await startExperience({
        map, ctx, follow, occluders, proxies, hudRoot, gender,
        onProgress: (f, label) => start.progress(f, label),
      });
      start.hide();
    } catch (err) {
      console.error(err);
      start.fail('Không tải được. Hãy tải lại trang.');
    }
  });
  // Warm the detail chunk as soon as the visitor shows intent.
  const prefetch = () => void import('./experience');
  document.getElementById('start-btn')?.addEventListener('pointerenter', prefetch, { once: true });
  document.getElementById('start-btn')?.addEventListener('focus', prefetch, { once: true });

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    if (experience) {
      experience.update(dt, t);
      const p = experience.player;
      follow.update(dt, p.position, p.heading);
      followSun(sun, follow.mode === 'overview' ? center : p.position);
    } else {
      follow.update(dt, center);
      followSun(sun, center);
    }
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  });

  start.ready();
  Object.assign(window, { __jf: { map, follow, renderer, scene } });
}

main().catch((err) => {
  console.error(err);
  const button = document.getElementById('start-btn');
  if (button) button.textContent = 'Không tải được bản đồ. Vui lòng thử lại.';
});
