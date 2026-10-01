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
import { Pathfinder, type Point2D } from './map/pathfinding';
import { createAvatar, type Gender } from './player/avatar';
import type { FollowCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { buildAreas } from './scene/areas';
import { buildStands, standFront, standSize } from './scene/booths';
import { NavigationVisualizer } from './scene/navigation';
import { buildEntrancePosters } from './scene/posters';
import { QUALITY, type QualityManager } from './scene/quality';
import type { SceneContext } from './scene/setup';
import { FONT, SignAtlas } from './scene/signAtlas';
import { Hud, normalize } from './ui/hud';
import { savePref } from './ui/prefs';

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
  const pathfinder = new Pathfinder(world, map.bounds);

  const atlas = new SignAtlas(QUALITY[o.quality.level].signPxPerMeter);
  detail.add(buildStands(map, atlas));

  o.onProgress(0.5, 'Đang dựng khu vực…');
  await nextFrame();
  const areas = buildAreas(map, atlas);
  detail.add(areas.group);
  const entrancePosters = buildEntrancePosters(map, (position, tabletop) => {
    walkingRoute = [];
    player.stopWalking();
    hud.setItemFocused(true);
    leaveOverview();
    follow.skipIntro();
    follow.inspectStand(position, 0, tabletop ? 3.5 : 4.5);
  }, () => {
    follow.stopInspect();
    hud.setItemFocused(false);
  });
  detail.add(entrancePosters.group);
  occluders.push(...areas.occluders);

  // 3D Navigation path visualizer
  const navigation = new NavigationVisualizer();
  scene.add(navigation.group);

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

  // Marker that bobs over the booth the visitor is looking at or navigating to.
  const pointer = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#ff4f9a' }));
  pointer.visible = false;
  scene.add(pointer);

  const leaveOverview = () => {
    follow.setOverview(false);
    hud.setOverview(false);
  };

  let activeDestination: Stand | null = null;
  let activeRoute: Point2D[] = [];
  let lastRouteCalcTime = 0;
  let lastCalcPos = { x: spawn.x, z: spawn.z };

  const updateRoute = (force = false) => {
    if (!activeDestination) {
      activeRoute = [];
      navigation.clear();
      hud.setNavigation(null);
      return;
    }
    const p = standFront(activeDestination);
    const distFromLast = Math.hypot(player.position.x - lastCalcPos.x, player.position.z - lastCalcPos.z);
    if (!force && activeRoute.length > 0 && distFromLast < 1.2) {
      activeRoute[0] = { x: player.position.x, z: player.position.z };
      navigation.setPath(activeRoute);
      return;
    }
    lastCalcPos = { x: player.position.x, z: player.position.z };
    activeRoute = pathfinder.findPath(player.position.x, player.position.z, p.x, p.z);
    navigation.setPath(activeRoute);
  };

  let walkingRoute: Point2D[] = [];

  const beginWalking = () => {
    if (!activeDestination) return;
    updateRoute(true);
    if (activeRoute.length < 2) {
      hud.showToast("Không tìm được đường đi từ vị trí này");
      return;
    }
    walkingRoute = activeRoute.slice(1).map((point) => ({ ...point }));
    leaveOverview();
    follow.skipIntro();
    follow.stopInspect();
    hud.hideStand();
  };

  const startNavigation = (s: Stand) => {
    entrancePosters.close();
    walkingRoute = [];
    player.stopWalking();
    activeDestination = s;
    updateRoute(true);
    const p = standFront(s);
    const dist = Math.hypot(p.x - player.position.x, p.z - player.position.z);
    hud.setNavigation({ destination: s, distance: dist, isInspecting: follow.isInspecting() });
    hud.showToast(`Đang dẫn đường đến gian ${s.code || s.name}`);
  };

  const cancelNavigation = () => {
    walkingRoute = [];
    player.stopWalking();
    activeDestination = null;
    activeRoute = [];
    navigation.clear();
    hud.setNavigation(null);
  };

  /**
   * Search selection flow:
   * Frames the booth with the camera while KEEPING the visitor in place!
   * Automatically sets up guidance route from the visitor's current location to the booth.
   */
  const selectStandFromSearch = (s: Stand) => {
    entrancePosters.close();
    walkingRoute = [];
    player.stopWalking();
    const p = standFront(s);
    const { cx, cz } = worldRect(s.rect);
    const standCenter = new THREE.Vector3(cx, 1.4, cz);

    leaveOverview();
    follow.skipIntro();
    follow.inspectStand(standCenter, p.cameraYaw, 11);

    activeDestination = s;
    updateRoute(true);
    const dist = Math.hypot(p.x - player.position.x, p.z - player.position.z);
    hud.setNavigation({ destination: s, distance: dist, isInspecting: true });

    hud.showStand(s);
    history.replaceState(null, '', `#${encodeURIComponent(s.code.split('–')[0] || s.name)}`);
  };

  /** Fast travel directly to a booth */
  const teleportToStand = (s: Stand) => {
    const p = standFront(s);
    player.teleport(p.x, p.z, p.heading);
    leaveOverview();
    follow.skipIntro();
    follow.snapBehind(p.cameraYaw);
    if (activeDestination === s) {
      cancelNavigation();
      hud.showToast(`Đã đến gian hàng ${s.code || s.name}`);
    } else if (activeDestination) {
      updateRoute(true);
    }
    history.replaceState(null, '', `#${encodeURIComponent(s.code.split('–')[0] || s.name)}`);
  };

  /** User location setting (from "Vị trí của tôi" modal or "Tôi đang ở đây" button) */
  const setPlayerLocation = (x: number, z: number, heading = 0, label?: string) => {
    walkingRoute = [];
    player.teleport(x, z, heading);
    leaveOverview();
    follow.snapBehind(heading + Math.PI);
    follow.stopInspect();
    if (activeDestination) {
      updateRoute(true);
      const p = standFront(activeDestination);
      const dist = Math.hypot(p.x - player.position.x, p.z - player.position.z);
      hud.setNavigation({ destination: activeDestination, distance: dist, isInspecting: false });
    }
    if (label) {
      hud.showToast(`Đã chuyển vị trí về: ${label}`);
    }
  };

  const toggleCameraTarget = () => {
    if (follow.isInspecting()) {
      follow.stopInspect();
      if (activeDestination) {
        const p = standFront(activeDestination);
        const dist = Math.hypot(p.x - player.position.x, p.z - player.position.z);
        hud.setNavigation({ destination: activeDestination, distance: dist, isInspecting: false });
      }
    } else if (activeDestination) {
      const p = standFront(activeDestination);
      const { cx, cz } = worldRect(activeDestination.rect);
      follow.inspectStand(new THREE.Vector3(cx, 1.4, cz), p.cameraYaw, 11);
      const dist = Math.hypot(p.x - player.position.x, p.z - player.position.z);
      hud.setNavigation({ destination: activeDestination, distance: dist, isInspecting: true });
    }
  };

  const toggleOverview = () => {
    const on = follow.mode !== 'overview';
    follow.setOverview(on);
    hud.setOverview(on);
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
    onSelectStand: selectStandFromSearch,
    onToggleOverview: toggleOverview,
    onSelectCharacter: selectCharacter,
    onSelectQuality: (mode) => {
      o.quality.setMode(mode);
      savePref('quality', mode);
    },
    onGoEntrance: () => {
      setPlayerLocation(spawn.x, spawn.z, spawn.heading, 'Lối vào khu Check-in');
    },
    onMinimapClick: (mx, my) => {
      // Kiểm tra xem click trúng gian hàng nào trong danh sách
      const hitStand = interactive.find((s) => {
        const { x, y, w, h } = s.rect;
        return mx >= x - 0.4 && mx <= x + w + 0.4 && my >= y - 0.4 && my <= y + h + 0.4;
      });
      if (hitStand) {
        // Đưa góc nhìn tới gian và mở thông tin gian, user đứng nguyên!
        selectStandFromSearch(hitStand);
        return;
      }
      // Click vào vị trí bất kỳ trên bản đồ: đưa view camera tới đó luôn, user đứng yên!
      leaveOverview();
      follow.skipIntro();
      const wx = toWorldX(mx);
      const wz = toWorldZ(my);
      follow.inspectStand(new THREE.Vector3(wx, 1.4, wz), player.heading, 12);
      hud.showToast('Đã chuyển góc nhìn tới vị trí được chọn');
    },
    onJoystick: (x, y) => {
      player.joystick = { x, y };
      if (x || y) {
        follow.skipIntro();
        if (follow.isInspecting()) follow.stopInspect();
      }
    },
    onSetLocation: setPlayerLocation,
    onStartNavigation: startNavigation,
    onCancelNavigation: cancelNavigation,
    onBeginWalking: beginWalking,
    onTeleportToStand: teleportToStand,
    onToggleCameraTarget: toggleCameraTarget,
  });

  hud.setGender(gender);
  hud.setQuality(o.quality.mode, o.quality.level);
  o.quality.onChange = (mode, level) => hud.setQuality(mode, level);

  // Interactive booths for detection & tapping
  const interactive = map.stands.filter((s) => s.kind !== 'foodcourt');

  // Tap on the floor: walk there (or tap a stand in 3D to inspect it)
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  follow.onTap = (cx, cy) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const posterHit = raycaster.intersectObjects(entrancePosters.targets)[0];
    if (posterHit) {
      walkingRoute = [];
      player.stopWalking();
      entrancePosters.open(posterHit.object);
      return;
    }

    const hit = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
    if (!hit) return;

    // Check if user tapped directly on a stand in 3D
    const clickedStand = interactive.find((s) => {
      const { cx: scx, cz: scz, w, d } = worldRect(s.rect);
      return Math.abs(hit.x - scx) <= w / 2 + 0.4 && Math.abs(hit.z - scz) <= d / 2 + 0.4;
    });

    if (clickedStand) {
      selectStandFromSearch(clickedStand);
      return;
    }

    if (follow.mode === 'overview') {
      player.teleport(hit.x, hit.z);
      toggleOverview();
    } else {
      follow.skipIntro();
      if (follow.isInspecting()) follow.stopInspect();
      walkingRoute = [];
      player.walkTo(hit.x, hit.z);
    }
  };

  // Keyboard controls: Escape to close, M for overview, E to view stand details
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.code === 'KeyM') toggleOverview();
    else if (e.code === 'KeyE') {
      if (entrancePosters.inspectNearby()) return;
      const cur = hud.getCurrentNearbyStand();
      if (cur) {
        if (hud.isCardVisible()) {
          hud.hideStand();
        } else {
          hud.showStand(cur);
        }
      }
    } else if (e.code === 'Escape') {
      entrancePosters.close();
      if (hud.isCardVisible()) hud.hideStand();
      else if (follow.mode === 'overview') toggleOverview();
      else if (follow.isInspecting()) follow.stopInspect();
    } else {
      follow.skipIntro();
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) {
        if (follow.isInspecting()) follow.stopInspect();
      }
    }
  });

  // Which stand is the visitor standing in front of?
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

  // Deep link: #A15 or #D5 frames that booth without moving the visitor
  const findByHash = () => {
    const q = normalize(decodeURIComponent(location.hash.slice(1)));
    if (!q) return null;
    return map.stands.find((s) => normalize(s.code).split('–').includes(q)) ?? map.stands.find((s) => normalize(s.name) === q) ?? null;
  };
  const initial = findByHash();
  if (initial) {
    selectStandFromSearch(initial);
  }
  window.addEventListener('hashchange', () => {
    const s = findByHash();
    if (s) selectStandFromSearch(s);
  });

  o.onProgress(1, 'Sẵn sàng');
  let lastProbe = -1;
  let current: Stand | null = null;

  const update = (dt: number, t: number) => {
    if (player.hasInput) {
      walkingRoute = [];
      follow.skipIntro();
      if (follow.isInspecting()) follow.stopInspect();
    }
    while (walkingRoute.length && Math.hypot(walkingRoute[0].x - player.position.x, walkingRoute[0].z - player.position.z) < 0.35) walkingRoute.shift();
    if (walkingRoute.length) player.walkTo(walkingRoute[0].x, walkingRoute[0].z);
    player.update(dt, follow.forward());
    areas.update(t);
    navigation.update(t);

    if (t - lastProbe > 0.1) {
      lastProbe = t;
      current = follow.mode === 'follow' ? nearbyStand() : null;

      // Update nearby stand info (Desktop: show directly, Mobile: show tap pill)
      hud.updateNearbyStand(current, follow.isInspecting());
      entrancePosters.update(player.position, player.hasInput, !!current || hud.isCardVisible() || follow.mode === 'overview');

      // Update active navigation state
      if (activeDestination) {
        const pFront = standFront(activeDestination);
        const dist = Math.hypot(pFront.x - player.position.x, pFront.z - player.position.z);
        hud.setNavigation({ destination: activeDestination, distance: dist, isInspecting: follow.isInspecting() });

        if (dist < 2.0) {
          hud.showToast(`🎉 Bạn đã đến gian hàng ${activeDestination.code || activeDestination.name}!`);
          cancelNavigation();
        } else if (t - lastRouteCalcTime > 0.8) {
          lastRouteCalcTime = t;
          updateRoute();
        }
      }

      hud.drawMinimap(player.position.x, player.position.z, player.heading, activeRoute);
    }

    const highlightTarget = current || activeDestination;
    if (highlightTarget) {
      const { cx, cz } = worldRect(highlightTarget.rect);
      const f = facingVector(highlightTarget.facing);
      const { D } = standSize(highlightTarget);
      const top = highlightTarget.kind === 'pavilion' ? 3.9 : 2.95;
      pointer.visible = true;
      pointer.position.set(cx + f.x * (D / 2), top + Math.sin(t * 3) * 0.08, cz + f.z * (D / 2));
      pointer.rotation.y = t * 2;
    } else {
      pointer.visible = false;
    }
  };

  Object.assign((window as unknown as { __jf: object }).__jf, {
    player,
    world,
    pathfinder,
    selectStandFromSearch,
    teleportToStand,
    setPlayerLocation,
    startNavigation,
    cancelNavigation,
    switchCharacter,
  });

  return { player, update };
}
