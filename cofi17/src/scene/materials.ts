import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/**
 * Cel ramp for MeshToonMaterial, indexed by N·L remapped to 0..1.
 * Faces turned away from the sun (N·L < 0) get no direct light, exactly like cast shadows, so the
 * shaded side and shadows share one tone and self-shadowing noise on those faces is multiplied by 0.
 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const ramp = [0, 0, 190, 255];
  const steps = new Uint8Array(ramp.flatMap((v) => [v, v, v, 255]));
  gradient = new THREE.DataTexture(steps, ramp.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon material per colour. Do not mutate: use `toonUnique` for per-mesh tweaks. */
export function toon(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  const key = new THREE.Color(color).getHexString();
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    cache.set(key, m);
  }
  return m;
}

export function toonUnique(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

/** Mixes a colour towards white. `t` = 0 keeps it, 1 is white. */
export function tint(color: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(color).lerp(new THREE.Color('#ffffff'), t);
}

export function shade(color: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(color).lerp(new THREE.Color('#2b2640'), t);
}

/** A unit box shared by every instanced part. */
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
