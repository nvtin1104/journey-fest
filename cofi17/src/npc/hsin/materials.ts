import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Hsin's own look, separate from the pastel toon style of the rest of the venue:
 * physically based materials lit by a private studio environment map, a soft rim light and
 * a filmic tone curve applied in her shaders only (the renderer itself stays untonemapped).
 */

/** Exposure inside her tone curve: the venue lights are tuned bright for toon shading. */
const EXPOSURE = 0.5;

/** Shared animation inputs for the sway shader, one set per moving piece (tail, ponytail, robe…). */
export interface SwayUniforms {
  uTime: { value: number };
  /** x/z amplitude (m), frequency, phase. */
  uSway: { value: THREE.Vector4 };
  /** Extra offset at the free end, e.g. the tail trailing behind while walking (local space). */
  uDrag: { value: THREE.Vector3 };
}

export function swayUniforms(ampX: number, ampZ: number, freq: number, phase = 0): SwayUniforms {
  return {
    uTime: { value: 0 },
    uSway: { value: new THREE.Vector4(ampX, ampZ, freq, phase) },
    uDrag: { value: new THREE.Vector3() },
  };
}

let envTexture: THREE.Texture | null = null;

/** Studio reflections for her materials only (the scene environment is left untouched). */
export function hsinEnvironment(renderer: THREE.WebGLRenderer) {
  if (envTexture) return envTexture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  envTexture = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();
  return envTexture;
}

interface Look {
  rim?: THREE.ColorRepresentation;
  rimStrength?: number;
  sway?: SwayUniforms;
}

/**
 * Khronos PBR Neutral tone curve. The renderer runs without tone mapping, so three.js does not
 * include its own tone mapping functions in the shaders; this copy lives in Hsin's shaders only.
 */
const NEUTRAL_GLSL = `
vec3 hsinNeutral( vec3 color ) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < startCompression ) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / ( peak + d - startCompression );
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
  return mix( color, vec3( newPeak ), g );
}`;

let lookId = 0;

/** Patches a material with the rim light, the filmic tone curve and (optionally) the sway deformer. */
function cinematic<T extends THREE.MeshStandardMaterial>(mat: T, look: Look = {}): T {
  const rim = new THREE.Color(look.rim ?? '#d9e2ff');
  const strength = look.rimStrength ?? 0.28;
  const key = `hsin-${look.sway ? 'sway' : 'static'}-${lookId++}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = `uniform vec3 uRim;\nuniform float uRimStrength;\n${NEUTRAL_GLSL}\n${shader.fragmentShader}`.replace(
      '#include <tonemapping_fragment>',
      `{
        float facing = saturate( dot( normalize( normal ), normalize( vViewPosition ) ) );
        gl_FragColor.rgb += uRim * pow( 1.0 - facing, 3.0 ) * uRimStrength;
      }
      gl_FragColor.rgb = hsinNeutral( gl_FragColor.rgb * ${EXPOSURE.toFixed(3)} );`,
    );
    if (look.sway) {
      Object.assign(shader.uniforms, look.sway);
      shader.vertexShader = `attribute float aSway;\nuniform float uTime;\nuniform vec4 uSway;\nuniform vec3 uDrag;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = aSway * aSway;
          float ph = uTime * uSway.z + uSway.w;
          transformed.x += ( sin( ph + aSway * 2.4 ) + 0.35 * sin( ph * 2.3 + aSway * 5.0 ) ) * uSway.x * w;
          transformed.z += ( cos( ph * 0.8 + aSway * 1.9 ) ) * uSway.y * w;
          transformed += uDrag * w;
        }`,
      );
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export interface HsinMaterials {
  skin: THREE.MeshPhysicalMaterial;
  face: THREE.MeshPhysicalMaterial;
  hair: THREE.MeshPhysicalMaterial;
  ponytail: THREE.MeshPhysicalMaterial;
  fur: THREE.MeshPhysicalMaterial;
  tail: THREE.MeshPhysicalMaterial;
  tailGold: THREE.MeshStandardMaterial;
  ears: THREE.MeshPhysicalMaterial;
  bodice: THREE.MeshPhysicalMaterial;
  frontPanel: THREE.MeshPhysicalMaterial;
  chiffon: THREE.MeshPhysicalMaterial;
  robe: THREE.MeshPhysicalMaterial;
  sleeve: THREE.MeshPhysicalMaterial;
  gold: THREE.MeshStandardMaterial;
  robeGold: THREE.MeshStandardMaterial;
  gem: THREE.MeshPhysicalMaterial;
  ruby: THREE.MeshPhysicalMaterial;
  lining: THREE.MeshPhysicalMaterial;
  sway: { tail: SwayUniforms; ponytail: SwayUniforms; robe: SwayUniforms; chiffon: SwayUniforms; front: SwayUniforms };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

type HeightFn = (x: number, y: number) => number;

/** Seeded value noise in [0, 1] on an integer lattice, smoothly interpolated. */
function valueNoise(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed * 1442695041;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/**
 * Bakes a tangent-space normal map and a roughness map from one height function
 * (0..1 over the texture, tiling). Roughness = base + variation * (height - 0.5).
 */
function surfaceMaps(size: number, height: HeightFn, strength: number, roughness: { base: number; variation: number }, repeat: [number, number] = [1, 1]) {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = height(x / size, y / size);
  const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = roughCanvas.width = roughCanvas.height = size;
  const nctx = normalCanvas.getContext('2d')!;
  const rctx = roughCanvas.getContext('2d')!;
  const nimg = nctx.createImageData(size, size);
  const rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      // Canvas rows run top-down while UV v runs bottom-up, hence the flipped green channel.
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
      const r = THREE.MathUtils.clamp(roughness.base + roughness.variation * (at(x, y) - 0.5), 0.04, 1) * 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r;
      rimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const make = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 4;
    return t;
  };
  return { normalMap: make(normalCanvas), roughnessMap: make(roughCanvas), normalScale: new THREE.Vector2(1, 1) };
}

/** Silk/satin: a fine weave plus long soft folds running down the cloth. */
function silkSurface(seed: number, folds: number) {
  const n = valueNoise(seed);
  return (x: number, y: number) =>
    0.5 + 0.08 * Math.sin(x * Math.PI * 2 * 180) * Math.sin(y * Math.PI * 2 * 180)
    + 0.32 * Math.sin(x * Math.PI * 2 * folds + n(x * 6, y * 2) * 2.5)
    + 0.1 * (n(x * 40, y * 40) - 0.5);
}

/** Chiffon: a sheer, open weave with gentle ripples. */
function chiffonSurface(seed: number) {
  const n = valueNoise(seed);
  return (x: number, y: number) =>
    0.5 + 0.18 * Math.sin(x * Math.PI * 2 * 260) * Math.sin(y * Math.PI * 2 * 260) + 0.25 * Math.sin(x * Math.PI * 2 * 9 + n(x * 4, y * 3) * 3);
}

/** Hair and fur: fine grooves along each strand (UV v runs along the strand). */
function strandSurface(seed: number) {
  const n = valueNoise(seed);
  return (x: number, y: number) => 0.5 + 0.45 * (n(x * 96, y * 3) - 0.5) + 0.2 * Math.sin(x * Math.PI * 2 * 48);
}

/** Skin: soft pores and micro-variation. */
function skinSurface(seed: number) {
  const n = valueNoise(seed);
  const m = valueNoise(seed + 1);
  return (x: number, y: number) => 0.5 + 0.35 * (n(x * 220, y * 220) - 0.5) + 0.25 * (m(x * 24, y * 24) - 0.5);
}

/** Stylised fox mask in white strokes, drawn centred on (cx, cy). */
function foxMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.05;
  // Ears and cheek ruffs.
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.15);
  ctx.lineTo(-s * 0.42, -s * 0.85);
  ctx.lineTo(-s * 0.12, -s * 0.38);
  ctx.quadraticCurveTo(0, -s * 0.45, s * 0.12, -s * 0.38);
  ctx.lineTo(s * 0.42, -s * 0.85);
  ctx.lineTo(s * 0.55, -s * 0.15);
  ctx.quadraticCurveTo(s * 0.45, s * 0.35, 0, s * 0.62);
  ctx.quadraticCurveTo(-s * 0.45, s * 0.35, -s * 0.55, -s * 0.15);
  ctx.stroke();
  // Eyes.
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * s * 0.22, -s * 0.05, s * 0.11, s * 0.045, sx * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // Swirling flames around the mask.
  ctx.lineWidth = s * 0.03;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const ox = sx * s * (0.75 + k * 0.18);
      ctx.moveTo(ox, s * (0.5 - k * 0.25));
      ctx.bezierCurveTo(ox + sx * s * 0.3, s * (0.2 - k * 0.2), ox - sx * s * 0.1, -s * (0.2 + k * 0.2), ox + sx * s * 0.25, -s * (0.55 + k * 0.1));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.85, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function silk(ctx: CanvasRenderingContext2D, w: number, h: number, from: string, to: string) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, from);
  g.addColorStop(0.5, to);
  g.addColorStop(1, from);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Fine vertical weave and soft folds.
  for (let x = 0; x < w; x += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + 0.03 * Math.abs(Math.sin(x * 0.7))})`;
    ctx.fillRect(x, 0, 1, h);
  }
  for (let k = 0; k < 7; k++) {
    const x = (k + 0.5) * (w / 7);
    const fold = ctx.createLinearGradient(x - w * 0.06, 0, x + w * 0.06, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(0.5, 'rgba(0,0,0,0.16)');
    fold.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fold;
    ctx.fillRect(x - w * 0.06, 0, w * 0.12, h);
  }
}

/** Long red robe panel: silk body, gold borders, black hem with the white fox motif and crescent moons. */
function robeTexture() {
  const w = 512;
  const h = 1536;
  return canvasTexture(w, h, (ctx) => {
    silk(ctx, w, h, '#9c0d18', '#d0202d');
    const hem = h * 0.7;
    const black = ctx.createLinearGradient(0, hem, 0, h);
    black.addColorStop(0, '#16121a');
    black.addColorStop(1, '#0c0a10');
    ctx.fillStyle = black;
    ctx.fillRect(0, hem, w, h - hem);
    // Red splash fading into the black band, and red under the hem.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(200,24,40,${0.15 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, h - Math.random() * 60, 6 + Math.random() * 30, 3 + Math.random() * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Front half of the hem (u < 0.45): sparkling red, like the reference's front view.
    const glitter = ctx.createLinearGradient(0, hem, 0, h);
    glitter.addColorStop(0, '#b3121f');
    glitter.addColorStop(1, '#e0303e');
    ctx.fillStyle = glitter;
    ctx.fillRect(0, hem, w * 0.45, h - hem);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,${190 + Math.floor(Math.random() * 60)},${170 + Math.floor(Math.random() * 60)},${0.25 + Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * w * 0.45, hem + Math.random() * (h - hem), 1.5 + Math.random() * 2, 1.5 + Math.random() * 2);
    }
    const fade = ctx.createLinearGradient(w * 0.38, 0, w * 0.5, 0);
    fade.addColorStop(0, 'rgba(14,10,16,0)');
    fade.addColorStop(1, 'rgba(14,10,16,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(w * 0.38, hem, w * 0.12, h - hem);
    foxMotif(ctx, w * 0.74, hem + (h - hem) * 0.45, w * 0.22);
    crescent(ctx, w * 0.6, hem + (h - hem) * 0.84, w * 0.05, '#f2f0f6');
    crescent(ctx, w * 0.9, hem + (h - hem) * 0.84, w * 0.05, '#f2f0f6');
    // Gold borders down both edges and across the top of the hem band.
    ctx.fillStyle = '#e2b45c';
    ctx.fillRect(0, 0, 10, h);
    ctx.fillRect(w - 10, 0, 10, h);
    ctx.fillRect(22, 0, 3, h);
    ctx.fillRect(w - 25, 0, 3, h);
    ctx.fillRect(0, hem - 10, w, 8);
    ctx.fillRect(0, hem + 4, w, 3);
    // Gold vines and small stars on the silk.
    ctx.strokeStyle = 'rgba(226,180,92,0.8)';
    ctx.fillStyle = 'rgba(236,196,110,0.9)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const x0 = w * (0.3 + k * 0.2);
      ctx.beginPath();
      ctx.moveTo(x0, h * 0.04);
      for (let y = 0; y < hem - 40; y += 120) {
        const dir = (y / 120) % 2 ? 1 : -1;
        ctx.bezierCurveTo(x0 + dir * 46, h * 0.04 + y + 40, x0 - dir * 46, h * 0.04 + y + 80, x0, h * 0.04 + y + 120);
      }
      ctx.stroke();
      for (let y = h * 0.1 + k * 70; y < hem - 60; y += 210) starPath(ctx, x0 + ((y / 210) % 2 ? 26 : -26), y, 11);
    }
  });
}

/** Sleeve silk: red with a gold band at the cuff (v = 0) and gold rings. */
function sleeveTexture() {
  const w = 512;
  const h = 512;
  return canvasTexture(w, h, (ctx) => {
    silk(ctx, w, h, '#a50f1b', '#d3222f');
    ctx.fillStyle = '#e2b45c';
    ctx.fillRect(0, h - 26, w, 12);
    ctx.fillRect(0, h - 40, w, 4);
    ctx.strokeStyle = 'rgba(226,180,92,0.85)';
    ctx.fillStyle = 'rgba(236,196,110,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    for (let x = 0; x < w; x += 64) ctx.bezierCurveTo(x + 20, h * 0.6, x + 44, h * 0.84, x + 64, h * 0.72);
    ctx.stroke();
    for (let k = 0; k < 4; k++) starPath(ctx, (k + 0.5) * (w / 4), h * 0.4, 12);
  });
}

/** Black satin front panel with gold edging, a moon and stars. */
function frontPanelTexture() {
  const w = 256;
  const h = 1024;
  return canvasTexture(w, h, (ctx) => {
    silk(ctx, w, h, '#09080b', '#18151c');
    ctx.fillStyle = '#e2b45c';
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w - 6, 0, 6, h);
    ctx.fillRect(14, 0, 2, h);
    ctx.fillRect(w - 16, 0, 2, h);
    crescent(ctx, w * 0.5, h * 0.3, w * 0.12, '#e2b45c');
    ctx.strokeStyle = 'rgba(226,180,92,0.8)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * (0.42 + k * 0.1));
      ctx.lineTo(w * 0.5 + 18, h * (0.45 + k * 0.1));
      ctx.lineTo(w * 0.5, h * (0.48 + k * 0.1));
      ctx.lineTo(w * 0.5 - 18, h * (0.45 + k * 0.1));
      ctx.closePath();
      ctx.stroke();
    }
  });
}

/** Pale chiffon with a soft vertical sheen, white hem and gold piping. */
function chiffonTexture() {
  const w = 512;
  const h = 512;
  return canvasTexture(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d9eef7');
    g.addColorStop(1, '#bfe2f1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.12 * Math.abs(Math.sin(x * 0.11))})`;
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = '#f5fbff';
    ctx.fillRect(0, h - 30, w, 30);
    ctx.fillStyle = '#e2b45c';
    ctx.fillRect(0, h - 34, w, 4);
  });
}

/**
 * Face painted on the head sphere's UVs (u wraps around, front at u = 0.25; v from the top).
 * The canvas is 2:1 so features keep their proportions near the equator.
 */
function faceTexture() {
  const w = 1024;
  const h = 512;
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#f6d9cc';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.25;
    const eyeY = h * 0.53;
    const ex = w * 0.052;
    // Blush.
    for (const sx of [-1, 1]) {
      const g = ctx.createRadialGradient(cx + sx * ex * 1.25, eyeY + h * 0.07, 2, cx + sx * ex * 1.25, eyeY + h * 0.07, w * 0.03);
      g.addColorStop(0, 'rgba(255,120,140,0.45)');
      g.addColorStop(1, 'rgba(255,120,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx + sx * ex * 1.25 - w * 0.04, eyeY, w * 0.08, h * 0.15);
    }
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex;
      // Eye white.
      ctx.fillStyle = '#fbf7f6';
      ctx.beginPath();
      ctx.ellipse(x, eyeY, w * 0.024, h * 0.034, 0, 0, Math.PI * 2);
      ctx.fill();
      // Iris: deep crimson with a lighter lower half and a dark pupil.
      const iris = ctx.createLinearGradient(x, eyeY - h * 0.034, x, eyeY + h * 0.034);
      iris.addColorStop(0, '#4a0b16');
      iris.addColorStop(0.55, '#a3182b');
      iris.addColorStop(1, '#ff6f86');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(x, eyeY + h * 0.002, w * 0.016, h * 0.031, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#25040b';
      ctx.beginPath();
      ctx.ellipse(x, eyeY, w * 0.006, h * 0.016, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(x - sx * w * 0.006, eyeY - h * 0.014, w * 0.004, 0, Math.PI * 2);
      ctx.fill();
      // Upper lash line flicking outwards, thin lower lash.
      ctx.strokeStyle = '#1d1218';
      ctx.lineCap = 'round';
      ctx.lineWidth = h * 0.009;
      ctx.beginPath();
      ctx.moveTo(x - sx * w * 0.026, eyeY - h * 0.012);
      ctx.quadraticCurveTo(x, eyeY - h * 0.05, x + sx * w * 0.03, eyeY - h * 0.03);
      ctx.lineTo(x + sx * w * 0.036, eyeY - h * 0.042);
      ctx.stroke();
      ctx.lineWidth = h * 0.003;
      ctx.beginPath();
      ctx.moveTo(x - sx * w * 0.016, eyeY + h * 0.036);
      ctx.quadraticCurveTo(x, eyeY + h * 0.042, x + sx * w * 0.02, eyeY + h * 0.03);
      ctx.stroke();
      // Thin, gently arched brows (pale, hair-coloured).
      ctx.strokeStyle = '#a8a2ae';
      ctx.lineWidth = h * 0.005;
      ctx.beginPath();
      ctx.moveTo(x - sx * w * 0.02, eyeY - h * 0.075);
      ctx.quadraticCurveTo(x + sx * w * 0.005, eyeY - h * 0.09, x + sx * w * 0.03, eyeY - h * 0.078);
      ctx.stroke();
      // Red eyeliner wing.
      ctx.strokeStyle = 'rgba(200,30,50,0.8)';
      ctx.lineWidth = h * 0.004;
      ctx.beginPath();
      ctx.moveTo(x + sx * w * 0.026, eyeY - h * 0.02);
      ctx.lineTo(x + sx * w * 0.042, eyeY - h * 0.034);
      ctx.stroke();
    }
    // Nose hint and lips.
    ctx.strokeStyle = 'rgba(190,120,110,0.55)';
    ctx.lineWidth = h * 0.004;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.002, eyeY + h * 0.06);
    ctx.lineTo(cx - w * 0.003, eyeY + h * 0.085);
    ctx.stroke();
    ctx.fillStyle = '#c94a5c';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.012, eyeY + h * 0.128);
    ctx.quadraticCurveTo(cx, eyeY + h * 0.12, cx + w * 0.012, eyeY + h * 0.128);
    ctx.quadraticCurveTo(cx, eyeY + h * 0.142, cx - w * 0.012, eyeY + h * 0.128);
    ctx.fill();
  });
}

export function createHsinMaterials(renderer: THREE.WebGLRenderer, detail = 1): HsinMaterials {
  const envMap = hsinEnvironment(renderer);
  const sway = {
    tail: swayUniforms(0.16, 0.08, 1.4),
    ponytail: swayUniforms(0.05, 0.04, 1.7, 1),
    robe: swayUniforms(0.035, 0.05, 1.2, 2),
    chiffon: swayUniforms(0.025, 0.03, 1.5, 0.5),
    front: swayUniforms(0.012, 0.02, 1.3, 1.5),
  };
  const physical = (p: THREE.MeshPhysicalMaterialParameters, look?: Look) =>
    cinematic(new THREE.MeshPhysicalMaterial({ envMap, envMapIntensity: 0.55, ...p }), look);
  const metal = (p: THREE.MeshStandardMaterialParameters, look?: Look) =>
    cinematic(new THREE.MeshStandardMaterial({ envMap, envMapIntensity: 1.4, metalness: 1, roughness: 0.24, color: '#e9bd62', ...p }), look);

  // Smaller bakes on weaker devices: they are computed on the main thread while the scene loads.
  const big = detail >= 0.8 ? 512 : 256;
  const small = detail >= 0.8 ? 256 : 128;
  const silk = surfaceMaps(big, silkSurface(3, 7), 6, { base: 0.42, variation: 0.3 });
  const satin = surfaceMaps(big, silkSurface(5, 5), 4, { base: 0.3, variation: 0.2 });
  const sheer = surfaceMaps(small, chiffonSurface(9), 5, { base: 0.5, variation: 0.25 });
  const hairMaps = surfaceMaps(small, strandSurface(11), 8, { base: 0.36, variation: 0.35 }, [4, 1]);
  const furMaps = surfaceMaps(small, strandSurface(13), 10, { base: 0.75, variation: 0.3 }, [6, 1]);
  const skinMaps = surfaceMaps(big, skinSurface(17), 2.5, { base: 0.5, variation: 0.25 }, [2, 2]);
  skinMaps.normalScale.set(0.35, 0.35);
  const skinParams: THREE.MeshPhysicalMaterialParameters = {
    ...skinMaps, color: '#f6dccf', roughness: 1, sheen: 0.35, sheenColor: new THREE.Color('#ffb2a0'), sheenRoughness: 0.6,
  };
  const hairParams: THREE.MeshPhysicalMaterialParameters = {
    ...hairMaps, vertexColors: true, roughness: 1, sheen: 1, sheenColor: new THREE.Color('#bcd2ff'), sheenRoughness: 0.35,
    clearcoat: 0.2, clearcoatRoughness: 0.4,
  };
  const furParams: THREE.MeshPhysicalMaterialParameters = {
    ...furMaps, vertexColors: true, roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.8,
  };
  const robeMap = robeTexture();
  return {
    skin: physical(skinParams, { rim: '#ffd9cc', rimStrength: 0.22 }),
    face: physical({ ...skinParams, map: faceTexture() }, { rim: '#ffd9cc', rimStrength: 0.18 }),
    hair: physical(hairParams, { rim: '#e6efff', rimStrength: 0.35 }),
    ponytail: physical(hairParams, { rim: '#e6efff', rimStrength: 0.35, sway: sway.ponytail }),
    fur: physical(furParams, { rim: '#ffffff', rimStrength: 0.4 }),
    tail: physical(furParams, { rim: '#ffffff', rimStrength: 0.45, sway: sway.tail }),
    tailGold: metal({}, { rim: '#fff1c4', rimStrength: 0.2, sway: sway.tail }),
    ears: physical(furParams, { rim: '#ffffff', rimStrength: 0.4 }),
    bodice: physical({
      ...satin, color: '#0d0b10', roughness: 1, sheen: 0.4, sheenColor: new THREE.Color('#3a3346'), clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.35,
    }, { rim: '#b9b0d0', rimStrength: 0.12 }),
    frontPanel: physical({
      ...satin, map: frontPanelTexture(), roughness: 1, sheen: 0.4, sheenColor: new THREE.Color('#3a3346'), clearcoat: 0.4, envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    }, { rim: '#b9b0d0', rimStrength: 0.12, sway: sway.front }),
    chiffon: physical({
      ...sheer, map: chiffonTexture(), roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    }, { rim: '#ffffff', rimStrength: 0.3, sway: sway.chiffon }),
    robe: physical({
      ...silk, map: robeMap, roughness: 1, sheen: 0.9, sheenColor: new THREE.Color('#ff7a7a'), sheenRoughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35,
      side: THREE.DoubleSide,
    }, { rim: '#ffb0b0', rimStrength: 0.2, sway: sway.robe }),
    sleeve: physical({
      ...silk, map: sleeveTexture(), roughness: 1, sheen: 0.9, sheenColor: new THREE.Color('#ff7a7a'), sheenRoughness: 0.4, clearcoat: 0.3,
      side: THREE.DoubleSide,
    }, { rim: '#ffb0b0', rimStrength: 0.2 }),
    gold: metal({}, { rim: '#fff1c4', rimStrength: 0.2 }),
    robeGold: metal({}, { rim: '#fff1c4', rimStrength: 0.2, sway: sway.robe }),
    gem: physical({ color: '#8fd6ff', roughness: 0.05, clearcoat: 1, ior: 1.7, specularIntensity: 1, envMapIntensity: 1.6 }, { rim: '#d8f2ff', rimStrength: 0.4 }),
    ruby: physical({ color: '#c0122b', roughness: 0.08, clearcoat: 1, envMapIntensity: 1.2 }, { rim: '#ff8090', rimStrength: 0.3 }),
    lining: physical({
      ...sheer, map: chiffonTexture(), roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), transparent: true, opacity: 0.94,
      side: THREE.DoubleSide,
    }, { rim: '#ffffff', rimStrength: 0.25 }),
    sway,
  };
}
