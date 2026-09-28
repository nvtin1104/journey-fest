import * as THREE from 'three';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
}

const SKY_TOP = new THREE.Color('#9fd3ff');
const SKY_BOTTOM = new THREE.Color('#fdf1ff');
export const FOG_COLOR = new THREE.Color('#f3ecff');

export function createScene(container: HTMLElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, 90, 320);
  scene.add(skyDome());

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.3, 1800);

  scene.add(new THREE.HemisphereLight('#e8f4ff', '#f4e6ff', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e6', 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 32;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { renderer, scene, camera, sun };
}

/** Keeps the shadow frustum centred on the visitor so a single 2048 map stays crisp. */
export function followSun(sun: THREE.DirectionalLight, target: THREE.Vector3) {
  sun.target.position.copy(target);
  sun.position.set(target.x + 28, target.y + 60, target.z + 18);
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
