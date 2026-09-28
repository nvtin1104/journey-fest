import * as THREE from 'three';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  /** Sky dome; keep it centred on the camera. */
  sky: THREE.Mesh;
}

const SKY_TOP = new THREE.Color('#9fd3ff');
const SKY_BOTTOM = new THREE.Color('#fdf1ff');
export const FOG_COLOR = new THREE.Color('#f3ecff');

/** True when the browser can create a WebGL2 context (required by three.js since r163). */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Pixel ratio and shadow settings are applied afterwards by QualityManager. */
export function createScene(container: HTMLElement, opts: { antialias: boolean }): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: opts.antialias, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, 90, 320);
  const sky = skyDome();
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.5, 1800);

  // Pastel toon lighting: a cool lilac fill so the shaded side and cast shadows read lilac-blue
  // instead of grey, and a warm, stronger sun for clear light/shadow contrast.
  scene.add(new THREE.HemisphereLight('#e6e3ff', '#f6f0ff', 2.2));
  const sun = new THREE.DirectionalLight('#fff0da', 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 32;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  // Soft edges (PCF with a Vogel-disk kernel in r186).
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { renderer, scene, camera, sun, sky };
}

/** Direction from the ground towards the sun. */
const SUN_OFFSET = new THREE.Vector3(36, 55, 22);
const SUN_DIR = SUN_OFFSET.clone().normalize();
/** Axes of the shadow camera (same construction as Matrix4.lookAt with +Y up). */
const SUN_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
const SUN_UP = new THREE.Vector3().crossVectors(SUN_DIR, SUN_RIGHT).normalize();
export const SHADOW_AXES = { right: SUN_RIGHT, up: SUN_UP };

/**
 * Moves `p` to the nearest point whose shadow-camera coordinates are whole texels.
 * A shadow map that slides by fractions of a texel makes every shadow edge shimmer while walking.
 */
export function snapToShadowTexel(p: THREE.Vector3, texel: number): THREE.Vector3 {
  const r = p.dot(SUN_RIGHT);
  const u = p.dot(SUN_UP);
  return p
    .clone()
    .addScaledVector(SUN_RIGHT, Math.round(r / texel) * texel - r)
    .addScaledVector(SUN_UP, Math.round(u / texel) * texel - u);
}

/** Keeps the shadow frustum centred on the visitor so a single 2048 map stays crisp, snapped to its texel grid. */
export function followSun(sun: THREE.DirectionalLight, target: THREE.Vector3) {
  const cam = sun.shadow.camera;
  const texel = (cam.right - cam.left) / sun.shadow.mapSize.x;
  const p = snapToShadowTexel(target, texel);
  sun.target.position.copy(p);
  sun.position.copy(p).add(SUN_OFFSET);
}

function skyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP }, bottom: { value: SKY_BOTTOM } },
    vertexShader: `varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      varying float vH;
      void main() {
        float t = smoothstep(-0.05, 0.6, vH);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
