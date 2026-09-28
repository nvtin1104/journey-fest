import { describe, expect, it } from 'vitest';
import data from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import { parseMap, splitLabel } from './parse';

const map = parseMap(data as EventMapData);
const byCode = (code: string) => map.stands.find((s) => s.code === code || s.code.split('–').includes(code));

describe('parseMap', () => {
  it('drops duplicate hall outlines', () => {
    expect(map.halls).toHaveLength(5);
    expect(map.halls.map((h) => h.id)).not.toContain('22fa2c9a-1a7f-465a-ae3c-dfa56e8ee803');
    expect(map.halls.map((h) => h.id)).not.toContain('7badbf62-7d1a-4488-a19c-c9e483337765');
  });

  it('turns every small gate into a door', () => {
    expect(map.gates).toHaveLength(16);
    expect(map.doors).toHaveLength(16);
  });

  it('merges double booths that share a refId', () => {
    const a15 = byCode('A15')!;
    expect(a15.code).toBe('A15–A16');
    expect(a15.nodeIds).toHaveLength(2);
    expect(a15.rect).toEqual({ x: 1410, y: -290, w: 100, h: 40 });
    expect(map.stands.filter((s) => s.code.includes('A16'))).toHaveLength(1);
    expect(byCode('A7')!.code).toBe('A7–A8');
  });

  it('classifies areas', () => {
    expect(byCode('L03')).toMatchObject({ kind: 'stall', name: 'Pick Miu Store' });
    expect(byCode('R4')).toMatchObject({ kind: 'pavilion', name: 'THIÊN LONG' });
    expect(map.stands.find((s) => s.kind === 'foodcourt')).toBeDefined();
    expect(map.stages).toHaveLength(1);
    expect(map.stages[0].facing).toBe('S');
    expect(map.billboards.map((b) => b.label)).toContain('ARTIST ALLEY MAP');
    expect(map.rooms.map((r) => r.label)).toEqual(expect.arrayContaining(['WC', 'VIP room', 'DEPOSITORY', 'ORGANIZER']));
    expect(map.columns.filter((c) => !c.decor)).toHaveLength(22);
    expect(map.grounds.filter((g) => g.kind === 'road')).toHaveLength(3);
  });

  it('attaches stamp rally groups', () => {
    expect(byCode('C13')!.groups.map((g) => g.name)).toEqual(
      expect.arrayContaining(['babyWANmoretime', 'Friendship Quest - My Little Pony']),
    );
  });

  it('places check-in desks and food court tables', () => {
    expect(map.props.filter((p) => p.kind === 'checkin-desk').length).toBeGreaterThan(0);
    expect(map.props.filter((p) => p.kind === 'table').length).toBeGreaterThan(4);
  });
});

describe('splitLabel', () => {
  it('splits code and name', () => {
    expect(splitLabel('R1:NGHỊCH THỦY HÀN')).toEqual({ code: 'R1', name: 'NGHỊCH THỦY HÀN' });
    expect(splitLabel('FB7')).toEqual({ code: 'FB7', name: '' });
    expect(splitLabel('COLOR KACHING')).toEqual({ code: '', name: 'COLOR KACHING' });
  });
});
