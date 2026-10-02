import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry builders for Hsin's model. Every builder emits the same attribute set
 * (position, normal, uv, color, aSway) so the pieces of one material can be merged.
 *
 * `aSway` is 0 where a piece is attached and grows towards its free end; the cloth/hair
 * shader in materials.ts bends vertices by it.
 */

export interface StrandOptions {
  /** Radius along the strand, t = 0 at the root and 1 at the tip. */
  radius: (t: number) => number;
  /** Cross-section squash (1 = round, < 1 = flat ribbon facing `outward`). */
  flat?: number;
  /** Direction the flat side faces at a point (e.g. away from the head centre). */
  outward?: (p: THREE.Vector3) => THREE.Vector3;
  /** Vertex colour along the strand. */
  color?: (t: number) => THREE.Color;
  /** Sway weight along the strand. */
  sway?: (t: number) => number;
  segments?: number;
  radial?: number;
}

const WHITE = new THREE.Color('#ffffff');
const tmpSide = new THREE.Vector3();
const tmpOut = new THREE.Vector3();

/** Tapered tube along `curve`, framed by an outward direction so it never twists. */
export function strand(curve: THREE.Curve<THREE.Vector3>, o: StrandOptions): THREE.BufferGeometry {
  const segments = o.segments ?? 16;
  const radial = o.radial ?? 6;
  const flat = o.flat ?? 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const sways: number[] = [];
  const indices: number[] = [];
  const fallbackUp = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const out = o.outward ? o.outward(p).normalize() : fallbackUp;
    tmpSide.crossVectors(tangent, out);
    if (tmpSide.lengthSq() < 1e-6) tmpSide.crossVectors(tangent, new THREE.Vector3(1, 0, 0));
    tmpSide.normalize();
    tmpOut.crossVectors(tmpSide, tangent).normalize();
    const r = Math.max(0.0004, o.radius(t));
    const c = o.color ? o.color(t) : WHITE;
    const s = o.sway ? o.sway(t) : t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      const nx = tmpSide.x * cx + tmpOut.x * sy;
      const ny = tmpSide.y * cx + tmpOut.y * sy;
      const nz = tmpSide.z * cx + tmpOut.z * sy;
      positions.push(
        p.x + tmpSide.x * cx * r + tmpOut.x * sy * r * flat,
        p.y + tmpSide.y * cx * r + tmpOut.y * sy * r * flat,
        p.z + tmpSide.z * cx * r + tmpOut.z * sy * r * flat,
      );
      normals.push(nx, ny, nz);
      uvs.push(j / radial, t);
      colors.push(c.r, c.g, c.b);
      sways.push(s);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return finish(positions, normals, uvs, colors, sways, indices);
}

function finish(positions: number[], normals: number[], uvs: number[], colors: number[], sways: number[], indices: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 1));
  geo.setIndex(indices);
  return geo;
}

/** Adds white vertex colours and a constant sway weight to a stock geometry so it merges with strands. */
export function prepare(geo: THREE.BufferGeometry, sway: number | ((p: THREE.Vector3) => number) = 0, color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.Color) = '#ffffff') {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const sways = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fixed ?? (color as (p: THREE.Vector3) => THREE.Color)(p);
    colors.set([c.r, c.g, c.b], i * 3);
    sways[i] = typeof sway === 'function' ? sway(p) : sway;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(sways, 1));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  return geo;
}

/** Merges prepared geometries into one indexed geometry (dropping any attribute not shared by all). */
export function merge(geos: THREE.BufferGeometry[]) {
  const keep = ['position', 'normal', 'uv', 'color', 'aSway'];
  const clean = geos.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    g.clearGroups();
    // Keep vertices shared: an indexed mesh is about a third of the size in the exported GLB.
    return g.index ? g : mergeVertices(g);
  });
  const merged = mergeGeometries(clean, false)!;
  clean.forEach((g) => g.dispose());
  return merged;
}

/** Smooth body part turned around Y from a (radius, y) profile. */
export function lathe(profile: Array<[number, number]>, opts: { segments?: number; samples?: number; phiStart?: number; phiLength?: number; scaleX?: number; scaleZ?: number } = {}) {
  const spline = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)));
  const geo = new THREE.LatheGeometry(spline.getPoints(opts.samples ?? 24), opts.segments ?? 32, opts.phiStart ?? 0, opts.phiLength ?? Math.PI * 2);
  geo.scale(opts.scaleX ?? 1, 1, opts.scaleZ ?? 1);
  geo.computeVertexNormals();
  return prepare(geo);
}

/**
 * A cloth panel hanging around the body axis. u runs across the panel, v from the top (0) to the hem (1).
 * The surface is an elliptic cone section: `angle(u, v)` around Y (0 = front), `radius(v)`, height `top - v * length`.
 */
export function clothPanel(o: {
  angle: (u: number, v: number) => number;
  radius: (u: number, v: number) => number;
  top: number;
  length: number;
  scaleX?: number;
  scaleZ?: number;
  cols?: number;
  rows?: number;
  sway?: (u: number, v: number) => number;
}) {
  const cols = o.cols ?? 24;
  const rows = o.rows ?? 24;
  const sx = o.scaleX ?? 1;
  const sz = o.scaleZ ?? 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const sways: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const a = o.angle(u, v);
      const r = o.radius(u, v);
      positions.push(Math.sin(a) * r * sx, o.top - v * o.length, Math.cos(a) * r * sz);
      uvs.push(u, 1 - v);
      colors.push(1, 1, 1);
      sways.push(o.sway ? o.sway(u, v) : v * v);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = finish(positions, new Array(positions.length).fill(0), uvs, colors, sways, indices);
  geo.computeVertexNormals();
  return geo;
}

/** Flat four-pointed star, lightly bevelled, centred on the origin in the XY plane. */
export function starGeometry(size: number, depth = size * 0.18) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.26;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: size * 0.05, bevelSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return prepare(geo);
}

/** Small deterministic PRNG so the model looks the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const curveOf = (...pts: Array<[number, number, number]>) =>
  new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
