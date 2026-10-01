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
import { detectQuality, QualityManager, readDeviceHints, type QualityMode } from './scene/quality';
import { createScene, followSun, hasWebGL2 } from './scene/setup';
import { buildWalls } from './scene/walls';
import { loadPref } from './ui/prefs';
import { setupStartScreen } from './ui/start';
import type { Experience } from './experience';

async function loadData(): Promise<EventMapData> {
  const url = import.meta.env.VITE_MAP_URL as string | undefined;
  if (url) {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (res.ok) return (await res.json()) as EventMapData;
    } catch (err) {
      console.warn('Live map unavailable, using the bundled snapshot.', err);
    }
  }
  return snapshot as EventMapData;
}

/** Late-bound hooks so the start screen can exist before the scene does. */
let onStartPressed: (gender: 'male' | 'female') => void = () => {};
const start = setupStartScreen((gender) => onStartPressed(gender));

async function main() {
  const app = document.getElementById('app')!;
  const hudRoot = document.getElementById('hud')!;

  if (!hasWebGL2()) {
    start.fail(
      'Thiết bị chưa hỗ trợ bản đồ 3D',
      'Trình duyệt này không có WebGL2. Hãy cập nhật trình duyệt (iPhone/iPad: iOS 15 trở lên; Chrome, Edge, Firefox bản mới) hoặc bật "tăng tốc phần cứng" trong cài đặt trình duyệt.',
    );
    return;
  }

  const map = parseMap(await loadData());
  const savedMode = loadPref('quality') as QualityMode | null;
  const mode: QualityMode = savedMode && ['auto', 'high', 'medium', 'low'].includes(savedMode) ? savedMode : 'auto';
  const detected = detectQuality(readDeviceHints());
  const initialLevel = mode === 'auto' ? detected : mode;
  const ctx = createScene(app, { antialias: initialLevel !== 'low' });
  const { scene, camera, renderer, sun, sky } = ctx;
  const quality = new QualityManager(ctx, mode, detected);

  // Mobile browsers may drop the WebGL context under memory pressure: say so instead of a black screen.
  const notice = document.getElementById('notice')!;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    notice.hidden = false;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    notice.hidden = true;
  });

  scene.add(buildGround(map));
  const walls = buildWalls(map);
  scene.add(walls.group);
  const proxies = buildProxies(map);
  scene.add(proxies);

  const b = worldRect(map.bounds);
  const center = new THREE.Vector3(b.cx, 0, b.cz);
  const occluders = [...walls.occluders];
  const follow = new FollowCamera(camera, renderer.domElement, occluders, center, Math.max(b.w, b.d) / 2);
  follow.startShowcase();
  const onResize = () => follow.refit();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => {
    onResize();
    setTimeout(onResize, 100);
    setTimeout(onResize, 300);
  });

  let experience: Experience | null = null;
  onStartPressed = async (gender) => {
    try {
      quality.hold(10);
      // Prefetch starts on hover/focus too (see below); this await is usually instant.
      const { startExperience } = await import('./experience');
      experience = await startExperience({
        map, ctx, follow, occluders, proxies, hudRoot, gender, quality,
        onProgress: (f, label) => start.progress(f, label),
      });
      quality.hold(3);
      start.hide();
    } catch (err) {
      console.error(err);
      start.fail('Không tải được bản đồ', 'Hãy tải lại trang. Nếu vẫn lỗi, thử trình duyệt khác hoặc đóng bớt tab để giải phóng bộ nhớ.');
    }
  };
  // Warm the detail chunk as soon as the visitor shows intent.
  const prefetch = () => void import('./experience').catch(() => { /* Start retries and reports failures. */ });
  document.getElementById('start-btn')?.addEventListener('pointerenter', prefetch, { once: true });
  document.getElementById('start-btn')?.addEventListener('focus', prefetch, { once: true });

  const timer = new THREE.Timer();
  timer.connect(document);
  const fog = scene.fog as THREE.Fog;
  renderer.setAnimationLoop(() => {
    timer.update();
    const raw = timer.getDelta();
    quality.frame(raw);
    const dt = Math.min(raw, 0.05);
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
    // Push the fog back when the camera is far out (overview, portrait phones) so the map stays visible.
    fog.near = Math.max(90, follow.distance * 0.9);
    fog.far = Math.max(320, follow.distance * 2.2);
    renderer.render(scene, camera);
  });

  start.ready();
  Object.assign(window, { __jf: { map, follow, renderer, scene, quality } });
}

main().catch((err) => {
  console.error(err);
  start.fail('Không tải được bản đồ', 'Hãy tải lại trang. Nếu vẫn lỗi, thử trình duyệt khác.');
});
