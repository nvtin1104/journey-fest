import { describe, expect, it } from 'vitest';
import data from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import type { Stand } from '../map/parse';
import { parseMap } from '../map/parse';
import { standSize } from './booths';
import { vendorActionAt, vendorBoothPosition, vendorStyleIndex } from './vendors';

function booth(id: string, width = 40, height = 40): Stand {
  return {
    id,
    nodeIds: [id],
    kind: 'booth',
    code: id,
    name: '',
    rect: { x: 0, y: 0, w: width, h: height },
    color: '#9ed7ff',
    facing: 'S',
    groups: [],
  };
}

describe('booth vendors', () => {
  it('supports booths, stalls, and pavilions across all event halls', () => {
    const map = parseMap(data as EventMapData);
    const saleStands = map.stands.filter((stand) => stand.kind !== 'foodcourt');
    expect(saleStands.length).toBeGreaterThan(0);
    expect(saleStands.every((stand) => vendorBoothPosition(stand) !== null)).toBe(true);
  });

  it('keeps pavilion sellers clear of the mid-floor display tables', () => {
    const map = parseMap(data as EventMapData);
    for (const stand of map.stands.filter((candidate) => candidate.kind === 'pavilion')) {
      const position = vendorBoothPosition(stand);
      if (!position) continue;
      const { D } = standSize(stand);
      expect(position.z).toBeGreaterThan(-D * 0.1 + 0.35);
    }
  });

  it('selects a stable style for the same booth id', () => {
    expect(vendorStyleIndex('booth-a')).toBe(vendorStyleIndex('booth-a'));
    expect(vendorStyleIndex('booth-a')).toBeGreaterThanOrEqual(0);
  });

  it('places a seller behind the counter in a standard two metre booth', () => {
    const position = vendorBoothPosition(booth('A1'));
    expect(position).not.toBeNull();
    expect(position!.z).toBeLessThan(0);
    expect(position!.walkRadius).toBe(0);
  });

  it('lets sellers pace in a wide booth and assigns the same sitting choice each time', () => {
    const wide = vendorBoothPosition(booth('wide-booth', 80, 40));
    expect(wide).not.toBeNull();
    expect(wide!.walkRadius).toBeGreaterThan(0);
    expect(wide!.seated).toBe(vendorBoothPosition(booth('wide-booth', 80, 40))!.seated);
  });

  it('skips a booth whose usable interior is too narrow', () => {
    expect(vendorBoothPosition(booth('tiny', 10, 10))).toBeNull();
  });

  it('places sellers in other hall stalls and pavilions, while skipping dining zones', () => {
    expect(vendorBoothPosition({ ...booth('stall'), kind: 'stall' })).not.toBeNull();
    expect(vendorBoothPosition({ ...booth('pavilion', 200, 200), kind: 'pavilion' })).not.toBeNull();
    expect(vendorBoothPosition({ ...booth('dining'), kind: 'foodcourt' })).toBeNull();
  });

  it('cycles vendors through checking and arranging stock gestures', () => {
    expect(vendorActionAt(0, 0)).toBe('check-stock');
    expect(vendorActionAt(5, 0)).toBe('idle');
    expect(vendorActionAt(9, 0)).toBe('arrange-stock');
    expect(vendorActionAt(12, 0)).toBe('idle');
  });
});
