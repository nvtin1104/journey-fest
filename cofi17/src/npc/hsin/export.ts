import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildHsinModel, type HsinModel, type HsinPose } from './model';

/**
 * Exports Hsin as a binary glTF (GLB) for use in any Three.js scene.
 *
 * The rig is a plain node hierarchy (hips → spine → neck → head, shoulders → elbows → wrists,
 * hips → knees → ankles → feet, ears), so the clips below animate node transforms and need no
 * skinning. Materials export as glTF PBR with KHR_materials_sheen / clearcoat, vertex colours
 * (hair, fur, tail gradients) and the baked normal / roughness maps. The cloth, hair and tail
 * sway of the in-app shader is not part of glTF; each vertex keeps its sway weight in the
 * `_ASWAY` attribute so a viewer can re-add it (see models/hsin/viewer.html).
 */

const FPS = 30;

interface Sampled { name: string; duration: number; frames: Array<Map<string, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>> }

function joints(root: THREE.Object3D) {
  const list: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o instanceof THREE.Group && o.name) list.push(o);
  });
  return list;
}

/** Runs the model's own animation and records every joint at 30 fps. */
function sample(model: HsinModel, name: string, duration: number, speed: number, pose: HsinPose, look: THREE.Vector3 | null, t0: number): Sampled {
  const dt = 1 / FPS;
  // Settle the pose blends first so the clip starts in its steady state.
  for (let t = 0; t < 3; t += dt) model.update(dt, t0 + t, speed, pose, look);
  const nodes = joints(model.root);
  const frames: Sampled['frames'] = [];
  const count = Math.round(duration * FPS);
  for (let i = 0; i <= count; i++) {
    if (i > 0) model.update(dt, t0 + 3 + i * dt, speed, pose, look);
    const frame = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
    for (const n of nodes) frame.set(n.name, { p: n.position.clone(), q: n.quaternion.clone(), s: n.scale.clone() });
    frames.push(frame);
  }
  return { name, duration: count / FPS, frames };
}

function toClip(s: Sampled) {
  const times = s.frames.map((_, i) => i / FPS);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const name of s.frames[0].keys()) {
    const ps = s.frames.map((f) => f.get(name)!.p);
    const qs = s.frames.map((f) => f.get(name)!.q);
    const ss = s.frames.map((f) => f.get(name)!.s);
    // Every joint gets position and rotation tracks, even when they hold still: a held pose (photo)
    // differs from the exported rest pose. gltf-transform's resample step drops the redundant keys.
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, ps.flatMap((v) => v.toArray())));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, qs.flatMap((q) => q.toArray())));
    if (ss.some((v) => v.distanceToSquared(ss[0]) > 1e-10 || v.distanceToSquared(new THREE.Vector3(1, 1, 1)) > 1e-10)) {
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, ss.flatMap((v) => v.toArray())));
    }
  }
  return new THREE.AnimationClip(s.name, s.duration, tracks);
}

export async function exportHsinGLB(renderer: THREE.WebGLRenderer): Promise<ArrayBuffer> {
  const model = buildHsinModel(renderer, 1);
  const root = model.root;
  root.name = 'Hsin';
  const walkSpeed = 0.75;
  const walkCycle = (Math.PI * 2) / (walkSpeed * 5.6);
  const front = new THREE.Vector3(0, 1.45, 3);
  const clips = [
    sample(model, 'idle', 6, 0, 'idle', null, 0),
    sample(model, 'walk', walkCycle, walkSpeed, 'idle', null, 20),
    sample(model, 'wave', 2, 0, 'wave', front, 40),
    sample(model, 'photo', 3, 0, 'photo', front, 60),
  ].map(toClip);
  // Leave the exported rest pose standing straight and idle.
  for (let t = 0; t < 3; t += 1 / FPS) model.update(1 / FPS, 80 + t, 0, 'idle', null);

  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips, onlyVisible: true, maxTextureSize: 2048 });
  return glb as ArrayBuffer;
}
