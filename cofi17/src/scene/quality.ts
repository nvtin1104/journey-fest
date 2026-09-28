import * as THREE from 'three';
import type { SceneContext } from './setup';

export type QualityLevel = 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | QualityLevel;

export interface QualitySettings {
  /** Upper bound for the device pixel ratio. */
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  shadowRadius: number;
  /** Sign atlas density; lower = less GPU memory. */
  signPxPerMeter: number;
  label: string;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, shadowRadius: 2.5, signPxPerMeter: 128, label: 'Cao' },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, shadowRadius: 1.5, signPxPerMeter: 112, label: 'Vừa' },
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, shadowRadius: 1, signPxPerMeter: 96, label: 'Thấp' },
};

export interface DeviceHints {
  /** Primary input is touch (phones, tablets). */
  touch: boolean;
  /** `navigator.deviceMemory` in GB (Chromium only; undefined on Safari/Firefox). */
  memoryGB?: number;
  /** `navigator.hardwareConcurrency`. */
  cores?: number;
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    touch: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    memoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
  };
}

/** Starting quality from what the browser tells us about the device. */
export function detectQuality(h: DeviceHints): QualityLevel {
  const lowMemory = h.memoryGB !== undefined && h.memoryGB <= 2;
  const fewCores = h.cores !== undefined && h.cores <= 2;
  if (lowMemory || fewCores) return 'low';
  const midMemory = h.memoryGB !== undefined && h.memoryGB <= 4;
  const midCores = h.cores !== undefined && h.cores <= 4;
  if (h.touch || midMemory || midCores) return 'medium';
  return 'high';
}

/**
 * Watches frame times and asks for a lower quality when the average FPS over a window stays
 * below the threshold. Only very long frames (over 2 s: a debugger pause, the OS suspending the
 * page) reset the window; slow frames of a struggling device must count. Tab switches are already
 * absorbed by `THREE.Timer.connect(document)` and scene building by `hold()`.
 */
export class FpsGovernor {
  private time = 0;
  private frames = 0;
  private cooldown: number;

  constructor(private threshold = 40, private window = 3, warmup = 3) {
    this.cooldown = warmup;
  }

  /** Ignore measurements for a while (e.g. while building the scene). */
  hold(seconds: number) {
    this.cooldown = Math.max(this.cooldown, seconds);
    this.time = this.frames = 0;
  }

  /** Feed one raw frame time in seconds; returns true when quality should step down. */
  sample(dt: number): boolean {
    if (dt > 2) {
      this.time = this.frames = 0;
      return false;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return false;
    }
    this.time += dt;
    this.frames++;
    if (this.time < this.window) return false;
    const fps = this.frames / this.time;
    this.time = this.frames = 0;
    if (fps >= this.threshold) return false;
    this.cooldown = 3;
    return true;
  }
}

const LOWER: Record<QualityLevel, QualityLevel> = { high: 'medium', medium: 'low', low: 'low' };

/** Applies a quality level to the renderer and, in auto mode, steps down when the device struggles. */
export class QualityManager {
  mode: QualityMode;
  level: QualityLevel;
  onChange: (mode: QualityMode, level: QualityLevel) => void = () => {};
  private governor = new FpsGovernor();

  constructor(private ctx: SceneContext, mode: QualityMode, private detected: QualityLevel) {
    this.mode = mode;
    this.level = mode === 'auto' ? detected : mode;
    this.apply(true);
  }

  setMode(mode: QualityMode) {
    this.mode = mode;
    this.setLevel(mode === 'auto' ? this.detected : mode);
    this.governor.hold(3);
    this.onChange(this.mode, this.level);
  }

  hold(seconds: number) {
    this.governor.hold(seconds);
  }

  /** Call once per frame with the raw (unclamped) frame time. */
  frame(dt: number) {
    if (this.mode !== 'auto' || this.level === 'low') return;
    if (this.governor.sample(dt)) {
      this.detected = LOWER[this.level];
      this.setLevel(this.detected);
      this.onChange(this.mode, this.level);
    }
  }

  private setLevel(level: QualityLevel) {
    if (level === this.level) return;
    this.level = level;
    this.apply(false);
  }

  private apply(initial: boolean) {
    const q = QUALITY[this.level];
    const { renderer, sun, scene } = this.ctx;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    const shadowsChanged = renderer.shadowMap.enabled !== q.shadows;
    renderer.shadowMap.enabled = q.shadows;
    sun.castShadow = q.shadows;
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.radius = q.shadowRadius;
    // Turning shadows on/off changes the shader code of every lit material.
    if (shadowsChanged && !initial) {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
  }
}
