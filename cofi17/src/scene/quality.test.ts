import { describe, expect, it } from 'vitest';
import { detectQuality, FpsGovernor } from './quality';

describe('detectQuality', () => {
  it('starts desktops with plenty of resources on high', () => {
    expect(detectQuality({ touch: false, memoryGB: 8, cores: 8 })).toBe('high');
    expect(detectQuality({ touch: false })).toBe('high');
  });

  it('starts phones and tablets on medium', () => {
    expect(detectQuality({ touch: true, cores: 6 })).toBe('medium');
    expect(detectQuality({ touch: true, memoryGB: 8, cores: 8 })).toBe('medium');
  });

  it('starts weak devices on low', () => {
    expect(detectQuality({ touch: true, memoryGB: 2, cores: 8 })).toBe('low');
    expect(detectQuality({ touch: false, cores: 2 })).toBe('low');
  });
});

describe('FpsGovernor', () => {
  const run = (g: FpsGovernor, fps: number, seconds: number) => {
    let asked = false;
    for (let i = 0; i < fps * seconds; i++) asked = g.sample(1 / fps) || asked;
    return asked;
  };

  it('asks for lower quality when FPS stays low after the warm-up', () => {
    const g = new FpsGovernor(40, 3, 3);
    expect(run(g, 25, 2.9)).toBe(false);
    expect(run(g, 25, 4)).toBe(true);
  });

  it('leaves smooth devices alone', () => {
    expect(run(new FpsGovernor(40, 3, 1), 60, 20)).toBe(false);
  });

  it('counts very slow frames on devices running at 1–2 FPS', () => {
    const g = new FpsGovernor(40, 3, 1);
    let asked = false;
    for (let i = 0; i < 8; i++) asked = g.sample(0.8) || asked;
    expect(asked).toBe(true);
  });

  it('ignores long hitches such as a tab switch', () => {
    const g = new FpsGovernor(40, 3, 0);
    expect(g.sample(5)).toBe(false);
    expect(run(g, 60, 5)).toBe(false);
  });
});
