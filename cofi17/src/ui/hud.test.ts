import { describe, expect, it } from 'vitest';
import { searchStands } from './hud';
import type { Stand } from '../map/parse';
const stand = (code: string, name = '') => ({ code, name, groups: [] } as unknown as Stand);
describe('stand search', () => {
  it('finds a code inside a merged booth range', () => {
    const booth = stand('A23–A26');
    expect(searchStands([booth], 'A24')).toEqual([booth]);
    expect(searchStands([booth], 'A27')).toEqual([]);
  });
  it('accepts spaces, leading zeroes and a booth prefix', () => {
    const booth = stand('L03');
    for (const query of ['L3', 'l 03', 'Gian L03', 'Gian hàng L03']) {
      expect(searchStands([booth], query)).toEqual([booth]);
    }
  });
  it('still finds accented names and prioritizes exact codes', () => {
    const booth = stand('A24', 'Đồ cổ');
    expect(searchStands([booth], 'do co')).toEqual([booth]);
    expect(searchStands([stand('A240'), booth], 'A24')[0]).toBe(booth);
  });
});
