import { describe, expect, it } from 'vitest';
import { fitDistance } from './camera';

describe('fitDistance', () => {
  it('backs off further on a portrait phone than on a landscape monitor', () => {
    const desktop = fitDistance(100, 55, 16 / 10, 0, 1000);
    const phone = fitDistance(100, 55, 9 / 19.5, 0, 1000);
    expect(desktop).toBeGreaterThan(180);
    expect(desktop).toBeLessThan(200);
    expect(phone).toBeGreaterThan(desktop * 2);
  });

  it('respects the limits', () => {
    expect(fitDistance(100, 55, 0.2, 60, 480)).toBe(480);
    expect(fitDistance(1, 55, 1.6, 60, 480)).toBe(60);
  });
});
