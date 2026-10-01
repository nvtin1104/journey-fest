import * as THREE from 'three';
import type { Gender } from '../player/avatar';
import { avatarMotion, createAvatar } from '../player/avatar';
import { BOOTH } from '../config';
import type { Point2D, Pathfinder } from '../map/pathfinding';
import type { CollisionWorld } from '../map/colliders';
import type { ParsedMap, Stand } from '../map/parse';
import { facingAngle, toWorldX, toWorldZ, worldRect, type Rect } from '../map/coords';
import { Instancer } from './instancer';
import { toonUnique, unitBox } from './materials';
import { standFront, standMatrix, standSize } from './booths';

const STYLES = [
  { gender: 'male', hairStyle: 'spiky', shirtStyle: 'button-up', hairColor: '#251d2a', shirtColor: '#f4f0e6', bottomsColor: '#2d3752' },
  { gender: 'male', hairStyle: 'short', shirtStyle: 'tee', hairColor: '#4a2f25', shirtColor: '#e78268', bottomsColor: '#31465b' },
  { gender: 'male', hairStyle: 'spiky', shirtStyle: 'tee', hairColor: '#382a21', shirtColor: '#70b9a0', bottomsColor: '#594575' },
  { gender: 'male', hairStyle: 'short', shirtStyle: 'button-up', hairColor: '#272632', shirtColor: '#759bd5', bottomsColor: '#493b35' },
  { gender: 'male', hairStyle: 'spiky', shirtStyle: 'button-up', hairColor: '#5a3828', shirtColor: '#d9a94f', bottomsColor: '#37434f' },
  { gender: 'male', hairStyle: 'short', shirtStyle: 'tee', hairColor: '#312936', shirtColor: '#d67c9b', bottomsColor: '#3a5265' },
  { gender: 'female', hairStyle: 'long', shirtStyle: 'button-up', hairColor: '#302330', shirtColor: '#f4f0e6', bottomsColor: '#2d3752' },
  { gender: 'female', hairStyle: 'bob', shirtStyle: 'tee', hairColor: '#542e24', shirtColor: '#e78268', bottomsColor: '#415e50' },
  { gender: 'female', hairStyle: 'ponytail', shirtStyle: 'tee', hairColor: '#362a24', shirtColor: '#70b9a0', bottomsColor: '#594575' },
  { gender: 'female', hairStyle: 'long', shirtStyle: 'tee', hairColor: '#332936', shirtColor: '#759bd5', bottomsColor: '#493b35' },
  { gender: 'female', hairStyle: 'bob', shirtStyle: 'button-up', hairColor: '#69472e', shirtColor: '#d9a94f', bottomsColor: '#37434f' },
  { gender: 'female', hairStyle: 'ponytail', shirtStyle: 'button-up', hairColor: '#382934', shirtColor: '#d67c9b', bottomsColor: '#3a5265' },
] as const satisfies ReadonlyArray<{
  gender: Gender;
  hairStyle: 'spiky' | 'short' | 'long' | 'bob' | 'ponytail';
  shirtStyle: 'button-up' | 'tee';
  hairColor: string;
  shirtColor: string;
  bottomsColor: string;
}>;

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Stable style assignment: the same booth id always selects the same seller. */
export function vendorStyleIndex(boothId: string) {
  return hashSeed(boothId) % STYLES.length;
}

/** Local booth-space position for a seller, or null when the counter leaves too little room. */
export interface VendorPlacement {
  z: number;
  seated: boolean;
  walkRadius: number;
  walkDepth: number;
}

export function vendorBoothPosition(stand: Stand): VendorPlacement | null {
  if (stand.kind === 'foodcourt') return null;
  const { W, D } = standSize(stand);
  const isPavilion = stand.kind === 'pavilion';
  const counterDepth = isPavilion ? 0.7 : THREE.MathUtils.clamp(D * BOOTH.counterDepthRatio, 0.5, 1.2);
  const counterZ = isPavilion ? D / 2 - 0.6 : D / 2 - counterDepth / 2 - 0.03;
  const backEdge = -D / 2 + (isPavilion ? 0.36 : 0.11);
  const counterBack = counterZ - counterDepth / 2 - (isPavilion ? 0.45 : 0.12);
  if (W < 0.65 || counterBack - backEdge < 0.55) return null;
  const seated = hashSeed(stand.id) % 5 === 0;
  const walkRadius = seated || W < 3.2 ? 0 : Math.min(0.9, (W - 0.8) / 2);
  const walkDepth = walkRadius > 0 ? Math.max(0, Math.min(0.28, (counterBack - backEdge - 0.44) / 2)) : 0;
  return { z: (backEdge + counterBack) / 2, seated, walkRadius, walkDepth };
}

export type VendorAction = 'idle' | 'check-stock' | 'arrange-stock';

/** Deterministic repeating shopkeeper actions, offset by each booth's stable phase. */
export function vendorActionAt(time: number, phase: number): VendorAction {
  const cycle = ((time + phase / (Math.PI * 2) * 18) % 18 + 18) % 18;
  if (cycle < 2.8) return 'check-stock';
  if (cycle >= 8 && cycle < 10.8) return 'arrange-stock';
  return 'idle';
}

interface VendorInstance {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  right: THREE.Vector3;
  phase: number;
  standId: string;
  seated: boolean;
  walkRadius: number;
  walkDepth: number;
  walkPhaseZ: number;
  role: 'vendor' | 'staff' | 'visitor' | 'wanderer';
  gender: Gender;
  roam?: RoamingState;
}

interface RoamingState {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  heading: number;
  route: Point2D[];
  routeIndex: number;
  speed: number;
  currentSpeed: number;
  phase: number;
  waitUntil: number;
  nextPlanAt: number;
  area?: Rect;
}

interface Batch {
  source: THREE.Mesh;
  part: string;
  instances: VendorInstance[];
  mesh?: THREE.InstancedMesh;
}

export interface VendorScene {
  group: THREE.Group;
  update: (time: number, focusedStandId?: string | null) => void;
}

const tempPosition = new THREE.Vector3();
const tempRoot = new THREE.Matrix4();
const tempDelta = new THREE.Matrix4();
const tempTranslation = new THREE.Matrix4();
const tempRotation = new THREE.Matrix4();
const tempRotationX = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempForward = new THREE.Vector3(0, 0, 1);
const unitScale = new THREE.Vector3(1, 1, 1);
const unitY = new THREE.Vector3(0, 1, 0);

function vendorBoxMatrix(base: THREE.Matrix4, w: number, h: number, d: number, x: number, y: number, z: number) {
  return base.clone().multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d),
  ));
}

/** Builds one instanced seller per booth, sharing each of the finite character looks. */
export function buildVendors(stands: Stand[], map?: ParsedMap, pathfinder?: Pathfinder, world?: CollisionWorld): VendorScene {
  const group = new THREE.Group();
  group.name = 'booth-vendors';
  const batches = new Map<THREE.Mesh, Batch>();
  const templates = STYLES.flatMap((style, index) => (['standing', 'seated'] as const).map((pose) => {
    const avatar = createAvatar(style.gender, {
      hairStyle: style.hairStyle,
      shirtStyle: style.shirtStyle,
      hairColor: style.hairColor,
      shirtColor: style.shirtColor,
      bottomsColor: style.bottomsColor,
      camera: false,
      pose,
    });
    avatar.root.name = `vendor-look-${index}-${pose}`;
    avatar.root.updateMatrixWorld(true);
    avatar.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.vendorIgnore) return;
      const batch = batches.get(object) ?? {
        source: object,
        part: String(object.userData.vendorPart ?? ''),
        instances: [],
      };
      batches.set(object, batch);
    });
    return avatar;
  }));

  const chairSeats = new Instancer();
  const chairCushions = new Instancer();
  const chairBacks = new Instancer();
  const chairLegs = new Instancer();
  let chairCount = 0;
  let roamingAgentsUpdate = (_time: number) => {};

  const addAgent = (styleIndex: number, position: THREE.Vector3, rotation: THREE.Quaternion, id: string, walkRadius: number, role: 'staff' | 'visitor' | 'wanderer', roam?: RoamingState) => {
    const sourceRoot = templates[styleIndex * 2].root;
    sourceRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.vendorIgnore) return;
      batches.get(object)?.instances.push({
        position: position.clone(),
        rotation: rotation.clone(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
        phase: (hashSeed(id) % 1000) / 1000 * Math.PI * 2,
        standId: id,
        seated: false,
        walkRadius,
        walkDepth: 0,
        walkPhaseZ: (hashSeed(`${id}:depth`) % 1000) / 1000 * Math.PI * 2,
        role,
        gender: STYLES[styleIndex].gender,
        roam,
      });
    });
  };

  for (const stand of stands) {
    const local = vendorBoothPosition(stand);
    if (!local) continue;
    const styleIndex = vendorStyleIndex(stand.id);
    const sourceRoot = templates[styleIndex * 2 + (local.seated ? 1 : 0)].root;
    const standTransform = standMatrix(stand);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(standTransform);
    const center = new THREE.Vector3().setFromMatrixPosition(standTransform);
    const position = center.add(new THREE.Vector3(0, 0, local.z).applyQuaternion(rotation));
    sourceRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.vendorIgnore) return;
      batches.get(object)?.instances.push({
        position: position.clone(),
        rotation: rotation.clone(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
        phase: (hashSeed(stand.id) % 1000) / 1000 * Math.PI * 2,
        standId: stand.id,
        seated: local.seated,
        walkRadius: local.walkRadius,
        walkDepth: local.walkDepth,
        walkPhaseZ: (hashSeed(`${stand.id}:walk-z`) % 1000) / 1000 * Math.PI * 2,
        role: 'vendor',
        gender: STYLES[styleIndex].gender,
      });
    });

    if (local.seated) {
      const seatColor = ['#b76554', '#6379a4', '#638b75', '#af7b49'][hashSeed(stand.id) % 4];
      const base = standMatrix(stand);
      const z = local.z;
      chairSeats.push(vendorBoxMatrix(base, 0.46, 0.08, 0.42, 0, 0.52, z), seatColor);
      chairCushions.push(vendorBoxMatrix(base, 0.42, 0.035, 0.38, 0, 0.578, z + 0.005), seatColor);
      chairBacks.push(vendorBoxMatrix(base, 0.46, 0.42, 0.065, 0, 0.80, z - 0.22), seatColor);
      for (const x of [-0.17, 0.17]) for (const dz of [-0.15, 0.15]) {
        chairLegs.push(vendorBoxMatrix(base, 0.04, 0.52, 0.04, x, 0.26, z + dz), '#494653');
      }
      for (const x of [-0.17, 0.17]) chairLegs.push(vendorBoxMatrix(base, 0.04, 0.04, 0.38, x, 0.31, z), '#494653');
      chairCount++;
    }
  }

  if (map) {
    // Check-in staff stand behind each desk, facing the visitor queue.
    for (const [index, desk] of map.props.filter((prop) => prop.kind === 'checkin-desk').entries()) {
      const { cx, cz } = worldRect(desk.rect);
      const rotation = new THREE.Quaternion().setFromAxisAngle(unitY, facingAngle(desk.facing));
      const position = new THREE.Vector3(cx, 0, cz).add(new THREE.Vector3(0, 0, -0.9).applyQuaternion(rotation));
      addAgent(vendorStyleIndex(`checkin-staff-${desk.rect.x}-${desk.rect.y}`), position, rotation, `checkin-staff-${index}`, 0, 'staff');
    }

    // Independent event visitors choose new destinations from walkable hall and sidewalk cells.
    // Route planning is throttled below, so a large crowd cannot stall the render loop.
    if (pathfinder && world) {
      const walkAreas: Rect[] = [
        ...map.halls.filter((hall) => !hall.sealed),
        ...map.grounds.filter((ground) => ground.kind !== 'parking').map((ground) => ground.rect),
      ];
      const weights = walkAreas.map((area) => area.w * area.h);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const browsePoints = map.stands
        .filter((stand) => stand.kind !== 'foodcourt')
        .map((stand) => standFront(stand, 1.05))
        .filter((point) => world.isFree(point.x, point.z, 0.24));
      const randomWalkPoint = (restrictedArea?: Rect): Point2D | null => {
        const areas = restrictedArea ? [restrictedArea] : walkAreas;
        const areaWeights = restrictedArea ? [restrictedArea.w * restrictedArea.h] : weights;
        const areaWeight = restrictedArea ? areaWeights[0] : totalWeight;
        if (areas.length === 0 || areaWeight <= 0) return null;
        for (let attempt = 0; attempt < 80; attempt++) {
          let pick = Math.random() * areaWeight;
          let area = areas[0];
          for (let i = 0; i < areas.length; i++) {
            pick -= areaWeights[i];
            if (pick <= 0) { area = areas[i]; break; }
          }
          const marginX = Math.min(20, area.w * 0.15);
          const marginY = Math.min(20, area.h * 0.15);
          const mx = area.x + marginX + Math.random() * Math.max(1, area.w - 2 * marginX);
          const my = area.y + marginY + Math.random() * Math.max(1, area.h - 2 * marginY);
          const grid = pathfinder.toGrid(toWorldX(mx), toWorldZ(my));
          const nearest = pathfinder.nearestWalkable(grid.gx, grid.gz, 3);
          if (!nearest) continue;
          const point = pathfinder.toWorld(nearest.gx, nearest.gz);
          if (world.isFree(point.x, point.z, 0.24)) return point;
        }
        return null;
      };

      const roamingAgents: RoamingState[] = [];
      const addRoamingAgent = (id: string, styleIndex: number, start: Point2D, area?: Rect) => {
        const heading = Math.random() * Math.PI * 2;
        const rotation = new THREE.Quaternion().setFromAxisAngle(unitY, heading);
        const state: RoamingState = {
          position: new THREE.Vector3(start.x, 0, start.z),
          rotation,
          heading,
          route: [],
          routeIndex: 0,
          speed: 0.85 + Math.random() * 0.6,
          currentSpeed: 0,
          phase: Math.random() * Math.PI * 2,
          waitUntil: Math.random() * 2.5,
          nextPlanAt: 0,
          area,
        };
        roamingAgents.push(state);
        addAgent(styleIndex, state.position, state.rotation, id, 0, area ? 'visitor' : 'wanderer', state);
      };

      for (let i = 0; i < 14; i++) {
        let start: Point2D | null = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const candidate = randomWalkPoint();
          if (candidate && roamingAgents.every((agent) => Math.hypot(candidate.x - agent.position.x, candidate.z - agent.position.z) > 2.5)) {
            start = candidate;
            break;
          }
        }
        if (!start) continue;
        addRoamingAgent(`map-wanderer-${i}`, i % STYLES.length, start);
      }

      for (const zone of map.zones.filter((candidate) => /check\s*-?\s*in/i.test(candidate.label))) {
        const starts: Point2D[] = [];
        for (let i = 0; i < 4; i++) {
          const start = randomWalkPoint(zone.rect);
          if (start && starts.every((other) => Math.hypot(start.x - other.x, start.z - other.z) > 2.5)) {
            starts.push(start);
            addRoamingAgent(`checkin-visitor-${zone.id}-${i}`, (i + 4) % STYLES.length, start, zone.rect);
          }
        }
      }

      let lastRoamUpdate = 0;
      let lastRoutePlan = -1;
      const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
      const advanceRoamers = (time: number) => {
        const dt = lastRoamUpdate === 0 ? 0 : THREE.MathUtils.clamp(time - lastRoamUpdate, 0, 0.1);
        lastRoamUpdate = time;
        for (const agent of roamingAgents) {
          if (dt > 0 && agent.routeIndex < agent.route.length) {
            const target = agent.route[agent.routeIndex];
            const dx = target.x - agent.position.x;
            const dz = target.z - agent.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 0.12) {
              agent.position.set(target.x, 0, target.z);
              agent.routeIndex++;
            } else {
              const desiredHeading = Math.atan2(dx, dz);
              const turn = angleDelta(agent.heading, desiredHeading);
              const turnFactor = THREE.MathUtils.clamp(1 - Math.abs(turn) * 0.2, 0.55, 1);
              const desiredSpeed = Math.min(agent.speed, Math.sqrt(distance) * 1.35) * turnFactor;
              agent.currentSpeed += (desiredSpeed - agent.currentSpeed) * (1 - Math.exp(-2.8 * dt));
              agent.heading += turn * (1 - Math.exp(-8 * dt));
              agent.rotation.setFromAxisAngle(unitY, agent.heading);
              const step = Math.min(agent.currentSpeed * dt, distance);
              if (step > 1e-5) {
                agent.position.x += (dx / distance) * step;
                agent.position.z += (dz / distance) * step;
                agent.phase += dt * (4 + agent.currentSpeed * 1.3);
              }
              if (step >= distance - 1e-4) {
                agent.position.set(target.x, 0, target.z);
                agent.routeIndex++;
              }
            }
            if (agent.routeIndex >= agent.route.length) {
              agent.route = [];
              agent.routeIndex = 0;
              agent.currentSpeed = 0;
              agent.waitUntil = time + 1.5 + Math.random() * 5;
              agent.nextPlanAt = agent.waitUntil;
            }
          }
        }

        if (time - lastRoutePlan < 0.3) return;
        const agent = roamingAgents.find((candidate) => candidate.route.length === 0 && time >= candidate.waitUntil && time >= candidate.nextPlanAt);
        if (!agent) return;
        lastRoutePlan = time;
        agent.nextPlanAt = time + 1.5;
        for (let attempt = 0; attempt < 12; attempt++) {
          const target = agent.area
            ? randomWalkPoint(agent.area)
            : browsePoints.length > 0 && Math.random() < 0.78
            ? browsePoints[Math.floor(Math.random() * browsePoints.length)]
            : randomWalkPoint();
          if (!target || Math.hypot(target.x - agent.position.x, target.z - agent.position.z) < 7) continue;
          const route = pathfinder.findPath(agent.position.x, agent.position.z, target.x, target.z, false);
          if (route.length < 2) continue;
          const clear = route.slice(1).every((point, index) => {
            const previous = route[index];
            const from = pathfinder.toGrid(previous.x, previous.z);
            const to = pathfinder.toGrid(point.x, point.z);
            return pathfinder.isLineClear(from.gx, from.gz, to.gx, to.gz);
          });
          if (!clear) continue;
          agent.route = route.slice(1);
          agent.routeIndex = 0;
          break;
        }
      };

      roamingAgentsUpdate = advanceRoamers;
    }
  }

  for (const batch of batches.values()) {
    if (batch.instances.length === 0) continue;
    const mesh = new THREE.InstancedMesh(batch.source.geometry, batch.source.material, batch.instances.length);
    mesh.name = `${batch.source.parent?.name ?? 'vendor'}-instances`;
    mesh.castShadow = batch.source.castShadow;
    mesh.receiveShadow = batch.source.receiveShadow;
    mesh.frustumCulled = false;
    batch.mesh = mesh;
    group.add(mesh);
  }

  if (chairCount) {
    const chairMaterial = toonUnique('#ffffff');
    group.add(
      chairSeats.build(unitBox, chairMaterial, 'vendor-chair-seats', false),
      chairCushions.build(unitBox, toonUnique('#ffffff'), 'vendor-chair-cushions', false),
      chairBacks.build(unitBox, chairMaterial, 'vendor-chair-backs', false),
      chairLegs.build(unitBox, toonUnique('#ffffff'), 'vendor-chair-legs', false),
    );
  }

  const update = (time: number, focusedStandId: string | null = null) => {
    roamingAgentsUpdate(time);
    for (const batch of batches.values()) {
      if (!batch.mesh) continue;
      batch.instances.forEach((instance, index) => {
        tempPosition.copy(instance.position);
        if (instance.roam) tempPosition.copy(instance.roam.position);
        const action = instance.role === 'visitor' || instance.role === 'wanderer' ? 'idle' : vendorActionAt(time, instance.phase);
        const walkingPhase = time * 0.42 + instance.phase;
        const walking = (instance.roam ? instance.roam.routeIndex < instance.roam.route.length : instance.walkRadius > 0 && (instance.role === 'visitor' || action === 'idle'));
        const zPhase = walkingPhase * 0.71 + instance.walkPhaseZ;
        const localX = Math.sin(walkingPhase) * instance.walkRadius
          + Math.sin(walkingPhase * 0.37 + instance.walkPhaseZ) * instance.walkRadius * 0.2;
        const localZ = Math.cos(zPhase) * instance.walkDepth;
        const velocityX = Math.cos(walkingPhase) * instance.walkRadius * 0.42
          + Math.cos(walkingPhase * 0.37 + instance.walkPhaseZ) * instance.walkRadius * 0.2 * 0.37 * 0.42;
        const velocityZ = -Math.sin(zPhase) * instance.walkDepth * 0.71 * 0.42;
        if (!instance.roam && walking) {
          tempPosition.addScaledVector(instance.right, localX);
          tempPosition.addScaledVector(tempForward.set(0, 0, 1).applyQuaternion(instance.rotation), localZ);
        }
        const movementSpeed = instance.roam ? (walking ? instance.roam.speed : 0) : (walking ? Math.hypot(velocityX, velocityZ) : 0);
        const animationPhase = instance.roam?.phase ?? (walking ? time * (4 + movementSpeed * 1.3) + instance.phase : 0);
        const motion = avatarMotion(animationPhase, time + instance.phase, movementSpeed, instance.gender);

        if (instance.roam) tempQuaternion.copy(instance.roam.rotation);
        else {
          tempQuaternion.setFromAxisAngle(unitY, walking ? Math.atan2(velocityX, velocityZ) : 0);
          tempQuaternion.premultiply(instance.rotation);
        }
        tempRoot.compose(tempPosition, tempQuaternion, unitScale);

        const bodyPart = batch.part === 'body' || batch.part === 'head' || batch.part === 'arm-right' || batch.part === 'arm-left';
        tempDelta.makeTranslation(0, bodyPart ? motion.bodyBob : 0, 0);
        const waving = instance.standId === focusedStandId && batch.part === 'arm-right';
        const shoulderY = 1.27 - (instance.seated ? 0.28 : 0);
        if (waving) {
          const angle = 1.8 + Math.sin(time * 7 + instance.phase) * 0.2;
          tempDelta.multiply(tempTranslation.makeTranslation(0.195, shoulderY, 0))
            .multiply(tempRotation.makeRotationZ(angle))
            .multiply(tempRotationX.makeTranslation(-0.195, -shoulderY, 0));
        } else if ((batch.part === 'arm-right' || batch.part === 'arm-left') && action === 'check-stock') {
          const side = batch.part === 'arm-right' ? 1 : -1;
          const angle = -0.7 + Math.sin(time * 2 + instance.phase + side) * 0.1;
          tempDelta.multiply(tempTranslation.makeTranslation(side * 0.19, shoulderY, 0))
            .multiply(tempRotation.makeRotationX(angle))
            .multiply(tempRotationX.makeTranslation(-side * 0.19, -shoulderY, 0));
        } else if ((batch.part === 'arm-right' || batch.part === 'arm-left') && action === 'arrange-stock') {
          const side = batch.part === 'arm-right' ? 1 : -1;
          const angle = side * (0.3 + Math.sin(time * 3.2 + instance.phase) * 0.24);
          tempDelta.multiply(tempTranslation.makeTranslation(side * 0.19, shoulderY, 0))
            .multiply(tempRotation.makeRotationZ(angle))
            .multiply(tempRotationX.makeTranslation(-side * 0.19, -shoulderY, 0));
        } else if (batch.part === 'arm-right' || batch.part === 'arm-left') {
          const side = batch.part === 'arm-right' ? 1 : -1;
          const angle = side * motion.swing * 0.8;
          tempDelta.multiply(tempTranslation.makeTranslation(side * 0.19, shoulderY, 0))
            .multiply(tempRotation.makeRotationX(angle))
            .multiply(tempRotationX.makeTranslation(-side * 0.19, -shoulderY, 0));
        } else if ((batch.part === 'leg-right' || batch.part === 'leg-left') && walking) {
          const side = batch.part === 'leg-right' ? 1 : -1;
          const hipY = instance.seated ? 0.56 : 0.84;
          const angle = (side > 0 ? -1 : 1) * motion.swing;
          tempDelta.makeTranslation(side * 0.085, hipY, 0)
            .multiply(tempRotation.makeRotationX(angle))
            .multiply(tempRotationX.makeTranslation(-side * 0.085, -hipY, 0));
        } else if (batch.part === 'head') {
          const headY = instance.seated ? 1.22 : 1.5;
          const headTurn = action === 'arrange-stock' ? Math.sin(time * 1.4 + instance.phase) * 0.2 : 0;
          const nod = action === 'check-stock' ? 0.16 + Math.sin(time * 2 + instance.phase) * 0.035 : motion.headTilt;
          tempDelta.multiply(tempTranslation.makeTranslation(0, headY, 0))
            .multiply(tempRotation.makeRotationY(headTurn).multiply(tempRotationX.makeRotationX(nod)))
            .multiply(tempTranslation.makeTranslation(0, -headY, 0));
        }

        tempRoot.multiply(tempDelta).multiply(batch.source.matrixWorld);
        batch.mesh!.setMatrixAt(index, tempRoot);
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { group, update };
}
