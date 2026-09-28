import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SHADOW_AXES, snapToShadowTexel } from './setup';

const texel = 64 / 2048;
const onGrid = (v: number) => Math.abs(v / texel - Math.round(v / texel)) < 1e-6;

describe('snapToShadowTexel', () => {
  it('lands on whole texels of the shadow camera', () => {
    for (const p of [new THREE.Vector3(10.001, 0, -5.002), new THREE.Vector3(-73.37, 0, 41.9)]) {
      const s = snapToShadowTexel(p, texel);
      expect(onGrid(s.dot(SHADOW_AXES.right))).toBe(true);
      expect(onGrid(s.dot(SHADOW_AXES.up))).toBe(true);
    }
  });

  it('moves a point by at most one texel', () => {
    const p = new THREE.Vector3(3.3, 0, 7.7);
    expect(snapToShadowTexel(p, texel).distanceTo(p)).toBeLessThanOrEqual(texel);
  });
});
