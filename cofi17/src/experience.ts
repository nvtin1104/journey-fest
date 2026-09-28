/**
 * Everything that only matters once the visitor presses "Start": detailed stands and signs,
 * the character, controls and the HUD. Loaded as a separate chunk so the start screen appears fast.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPAWN } from './config';
import { buildColliders } from './map/colliders';
import { facingVector, toWorldX, toWorldZ, worldRect } from './map/coords';
import type { ParsedMap, Stand } from './map/parse';
import { createAvatar, type Gender } from './player/avatar';
import type { FollowCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { buildAreas } from './scene/areas';
import { buildStands, standSize } from './scene/booths';
import { QUALITY, type QualityManager } from './scene/quality';
import type { SceneContext } from './scene/setup';
import { FONT, SignAtlas } from './scene/signAtlas';
import { Hud, normalize } from './ui/hud';
import { loadPref, savePref } from './ui/prefs';

export interface ExperienceOptions {
  map: ParsedMap;
  ctx: SceneContext;
  follow: FollowCamera;
  /** Occluder list shared with the camera; detailed rooms are appended to it. */
  occluders: THREE.Mesh[];
  /** Overview stand-ins to remove once the detailed scene is ready. */
  proxies: THREE.Object3D;
  hudRoot: HTMLElement;
  gender: Gender;
  quality: QualityManager;
  onProgress: (fraction: number, label: string) => void;
}

export interface Experience {
  player: PlayerController;
  update: (dt: number, t: number) => void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

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

export async function startExperience(o: ExperienceOptions): Promise<Experience> {
  const { map, ctx, follow, occluders, proxies } = o;
  const { scene, camera, renderer } = ctx;

  // 1. Build the detailed scene off-screen, yielding between steps so the progress bar stays live.
  o.onProgress(0.05, 'Đang tải phông chữ…');
  await fontsReady();
  const detail = new THREE.Group();
  detail.name = 'detail';
  detail.visible = false;
  scene.add(detail);

  o.onProgress(0.2, 'Đang dựng gian hàng…');
  await nextFrame();
  const world = buildColliders(map);
  const atlas = new SignAtlas(QUALITY[o.quality.level].signPxPerMeter);
  detail.add(buildStands(map, atlas));

  o.onProgress(0.5, 'Đang dựng khu vực…');
  await nextFrame();
  const areas = buildAreas(map, atlas);
  detail.add(areas.group);
  occluders.push(...areas.occluders);

  o.onProgress(0.65, 'Đang in bảng tên…');
  await nextFrame();
  for (const mesh of atlas.build(mergeGeometries)) detail.add(mesh);

  o.onProgress(0.75, 'Đang chuẩn bị nhân vật…');
  await nextFrame();
  const avatar = createAvatar(o.gender);
  scene.add(avatar.root);
  const player = new PlayerController(avatar, world);

  o.onProgress(0.85, 'Đang chuẩn bị đồ hoạ…');
  detail.visible = true;
  proxies.visible = false;
  // Compile shaders up front; without parallel compilation support a plain compile avoids a console warning.
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  scene.remove(proxies);

  // 2. Spawn at the green arrow, facing along the sidewalk towards the check-in door.
  const spawnFacing = facingVector(SPAWN.facing);
  const spawn = { x: toWorldX(SPAWN.x), z: toWorldZ(SPAWN.y), heading: Math.atan2(spawnFacing.x, spawnFacing.z) };
  const spawnYaw = Math.atan2(-spawnFacing.x, -spawnFacing.z) - 0.35;
  player.teleport(spawn.x, spawn.z, spawn.heading);
  follow.intro(spawnYaw);

  // Marker that bobs over the booth the visitor is looking at.
  const pointer = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#ff4f9a' }));
  pointer.visible = false;
  scene.add(pointer);

  const leaveOverview = () => {
    follow.setOverview(false);
    hud.setOverview(false);
  };
  const goToStand = (s: Stand) => {
    const p = standFront(s);
    player.teleport(p.x, p.z, p.heading);
    leaveOverview();
    follow.skipIntro();
    follow.snapBehind(p.cameraYaw);
    history.replaceState(null, '', `#${encodeURIComponent(s.code.split('–')[0] || s.name)}`);
  };
  const toggleOverview = () => {
    const on = follow.mode !== 'overview';
    follow.setOverview(on);
    hud.setOverview(on);
  };
  const setFocus = (on: boolean) => {
    player.focus = on;
    follow.setFocus(on, player.heading);
    hud.setFocus(on);
    savePref('focus', on ? '1' : '0');
  };
  let gender = o.gender;
  const selectCharacter = (g: Gender) => {
    if (g === gender) return;
    gender = g;
    player.setAvatar(createAvatar(gender));
    hud.setGender(gender);
  hud.setQuality(o.quality.mode, o.quality.level);
  o.quality.onChange = (mode, level) => hud.setQuality(mode, level);
    savePref('gender', gender);
  };
  const switchCharacter = () => selectCharacter(gender === 'male' ? 'female' : 'male');

  const hud = new Hud(o.hudRoot, map, {
    onSelectStand: goToStand,
    onToggleOverview: toggleOverview,
    onToggleFocus: () => setFocus(!player.focus),
    onSelectCharacter: selectCharacter,
    onSelectQuality: (mode) => {
      o.quality.setMode(mode);
      savePref('quality', mode);
    },
    onGoEntrance: () => {
      player.teleport(spawn.x, spawn.z, spawn.heading);
      leaveOverview();
      follow.snapBehind(spawnYaw);
    },
    onMinimapClick: (mx, my) => {
      player.teleport(toWorldX(mx), toWorldZ(my));
      leaveOverview();
    },
    onJoystick: (x, y) => {
      player.joystick = { x, y };
      if (x || y) follow.skipIntro();
    },
  });
  hud.setGender(gender);
  hud.setQuality(o.quality.mode, o.quality.level);
  o.quality.onChange = (mode, level) => hud.setQuality(mode, level);
  setFocus(loadPref('focus') === '1');

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
    else if (e.code === 'KeyF') setFocus(!player.focus);
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
  if (initial) goToStand(initial);
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

  o.onProgress(1, 'Sẵn sàng');
  let lastProbe = -1;
  let current: Stand | null = null;

  const update = (dt: number, t: number) => {
    if (player.hasInput) follow.skipIntro();
    player.update(dt, follow.forward());
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
  };

  Object.assign((window as unknown as { __jf: object }).__jf, { player, world, goToStand, setFocus, switchCharacter });
  return { player, update };
}
