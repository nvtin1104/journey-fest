import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './ui/style.css';
import { SPAWN } from './config';
import snapshot from './data/event-map.json';
import type { EventMapData } from './data/types';
import { buildColliders } from './map/colliders';
import { facingVector, toWorldX, toWorldZ, worldRect } from './map/coords';
import { parseMap, type Stand } from './map/parse';
import { createAvatar } from './player/avatar';
import { FollowCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { buildAreas } from './scene/areas';
import { buildStands, standSize } from './scene/booths';
import { buildGround } from './scene/ground';
import { createScene, followSun } from './scene/setup';
import { FONT, SignAtlas } from './scene/signAtlas';
import { buildWalls } from './scene/walls';
import { Hud, normalize } from './ui/hud';

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

async function fontsReady() {
  const load = Promise.all([document.fonts.load(`800 32px ${FONT}`), document.fonts.load(`700 32px ${FONT}`)]);
  await Promise.race([load, new Promise((r) => setTimeout(r, 2500))]);
}

/** Point in front of a stand's counter plus the heading that looks at it. */
function standFront(s: Stand, gap = 1.3) {
  const { cx, cz } = worldRect(s.rect);
  const f = facingVector(s.facing);
  const { D } = standSize(s);
  return { x: cx + f.x * (D / 2 + gap), z: cz + f.z * (D / 2 + gap), heading: Math.atan2(-f.x, -f.z), cameraYaw: Math.atan2(f.x, f.z) };
}

async function main() {
  const app = document.getElementById('app')!;
  const hudRoot = document.getElementById('hud')!;
  const loading = document.getElementById('loading')!;

  const [data] = await Promise.all([loadData(), fontsReady()]);
  const map = parseMap(data);
  const world = buildColliders(map);
  const ctx = createScene(app);
  const { scene, camera, renderer, sun } = ctx;

  const atlas = new SignAtlas();
  scene.add(buildGround(map));
  const walls = buildWalls(map);
  scene.add(walls.group);
  scene.add(buildStands(map, atlas));
  const areas = buildAreas(map, atlas);
  scene.add(areas.group);
  for (const mesh of atlas.build(mergeGeometries)) scene.add(mesh);

  const avatar = createAvatar();
  scene.add(avatar.root);
  const player = new PlayerController(avatar, world);

  const b = worldRect(map.bounds);
  const follow = new FollowCamera(camera, renderer.domElement, [...walls.occluders, ...areas.occluders], new THREE.Vector3(b.cx, 0, b.cz));

  // Spawn at the green arrow, facing along the sidewalk towards the check-in door.
  const spawnFacing = facingVector(SPAWN.facing);
  const spawn = { x: toWorldX(SPAWN.x), z: toWorldZ(SPAWN.y), heading: Math.atan2(spawnFacing.x, spawnFacing.z) };
  const spawnYaw = Math.atan2(-spawnFacing.x, -spawnFacing.z) - 0.35;
  player.teleport(spawn.x, spawn.z, spawn.heading);
  follow.intro(new THREE.Vector3(spawn.x, 0, spawn.z), spawnYaw);

  // Marker that bobs over the booth the visitor is looking at.
  const pointer = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#ff4f9a' }));
  pointer.visible = false;
  scene.add(pointer);

  const goToStand = (s: Stand) => {
    const p = standFront(s);
    player.teleport(p.x, p.z, p.heading);
    follow.setOverview(false);
    hud.setOverview(false);
    follow.snapBehind(p.cameraYaw);
    history.replaceState(null, '', `#${encodeURIComponent(s.code.split('–')[0] || s.name)}`);
  };
  const toggleOverview = () => {
    const on = follow.mode !== 'overview';
    follow.setOverview(on);
    hud.setOverview(on);
  };

  const hud = new Hud(hudRoot, map, {
    onSelectStand: goToStand,
    onToggleOverview: toggleOverview,
    onGoEntrance: () => {
      player.teleport(spawn.x, spawn.z, spawn.heading);
      follow.setOverview(false);
      hud.setOverview(false);
      follow.snapBehind(spawnYaw);
    },
    onMinimapClick: (mx, my) => {
      player.teleport(toWorldX(mx), toWorldZ(my));
      follow.setOverview(false);
      hud.setOverview(false);
    },
    onJoystick: (x, y) => {
      player.joystick = { x, y };
      if (x || y) follow.skipIntro();
    },
  });

  // Tap on the floor: walk there (or jump there from the overview).
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  follow.onTap = (cx, cy) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
    if (!hit) return;
    if (follow.mode === 'overview') {
      player.teleport(hit.x, hit.z);
      toggleOverview();
    } else {
      follow.skipIntro();
      player.walkTo(hit.x, hit.z);
    }
  };

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'KeyM') toggleOverview();
    else if (e.code === 'Escape' && follow.mode === 'overview') toggleOverview();
    else follow.skipIntro();
  });

  // Deep link: #A15 jumps to that booth.
  const findByHash = () => {
    const q = normalize(decodeURIComponent(location.hash.slice(1)));
    if (!q) return null;
    return map.stands.find((s) => normalize(s.code).split('–').includes(q)) ?? map.stands.find((s) => normalize(s.name) === q) ?? null;
  };
  const initial = findByHash();
  if (initial) {
    goToStand(initial);
    follow.skipIntro();
  }
  window.addEventListener('hashchange', () => {
    const s = findByHash();
    if (s) goToStand(s);
  });

  // Which stand is the visitor standing in front of?
  const interactive = map.stands.filter((s) => s.kind !== 'foodcourt');
  const nearbyStand = (): Stand | null => {
    let best: Stand | null = null;
    let bestDist = Infinity;
    for (const s of interactive) {
      const { cx, cz } = worldRect(s.rect);
      const f = facingVector(s.facing);
      const { W, D } = standSize(s);
      const dx = player.position.x - cx;
      const dz = player.position.z - cz;
      const out = dx * f.x + dz * f.z - D / 2;
      const side = Math.abs(-dx * f.z + dz * f.x);
      if (out >= -0.2 && out <= 2.4 && side <= W / 2 + 0.2 && out < bestDist) {
        best = s;
        bestDist = out;
      }
    }
    return best;
  };

  let lastProbe = 0;
  let current: Stand | null = null;
  const timer = new THREE.Timer();
  timer.connect(document);
  loading.classList.add('hide');

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    if (player.hasInput) follow.skipIntro();
    player.update(dt, follow.forward());
    follow.update(dt, player.position);
    followSun(sun, player.position);
    areas.update(t);

    if (t - lastProbe > 0.1) {
      lastProbe = t;
      current = follow.mode === 'follow' ? nearbyStand() : null;
      hud.showStand(current);
      hud.drawMinimap(player.position.x, player.position.z, player.heading);
    }
    if (current) {
      const { cx, cz } = worldRect(current.rect);
      const f = facingVector(current.facing);
      const { D } = standSize(current);
      const top = current.kind === 'pavilion' ? 3.9 : 2.95;
      pointer.visible = true;
      pointer.position.set(cx + f.x * (D / 2), top + Math.sin(t * 3) * 0.08, cz + f.z * (D / 2));
      pointer.rotation.y = t * 2;
    } else {
      pointer.visible = false;
    }
    renderer.render(scene, camera);
  });

  Object.assign(window, { __jf: { map, player, follow, world, renderer, goToStand } });
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Không tải được bản đồ. Vui lòng thử lại.';
});
