import { describe, expect, it } from 'vitest';
import { roundRect } from './signAtlas';

function fakeContext(withRoundRect: boolean) {
  const calls: string[] = [];
  const ctx = {
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    arcTo: () => calls.push('arcTo'),
    closePath: () => calls.push('closePath'),
    ...(withRoundRect ? { roundRect: () => calls.push('roundRect') } : {}),
  };
  return { ctx, calls };
}

describe('roundRect', () => {
  it('uses the native path when the browser has it', () => {
    const { ctx, calls } = fakeContext(true);
    roundRect(ctx as never, 0, 0, 100, 40, 8);
    expect(calls).toEqual(['beginPath', 'roundRect']);
  });

  it('falls back to arcTo on older browsers (iOS 15)', () => {
    const { ctx, calls } = fakeContext(false);
    roundRect(ctx as never, 0, 0, 100, 40, 8);
    expect(calls).toEqual(['beginPath', 'moveTo', 'arcTo', 'arcTo', 'arcTo', 'arcTo', 'closePath']);
  });
});
