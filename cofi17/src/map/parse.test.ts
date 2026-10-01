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

  it('seals halls that have no door', () => {
    const sealed = map.halls.filter((h) => h.sealed);
    expect(sealed.map((h) => h.id)).toEqual(['c0835c79-1e26-46fb-bf93-6e607177b92e']);
  });

  it('turns every small gate into a door', () => {
    expect(map.gates).toHaveLength(16);
    expect(map.doors).toHaveLength(16);
  });

  it('merges double booths that share a refId', () => {
    const a15 = byCode('A15')!;
    expect(a15.code).toBe('A15');
    expect(a15.nodeIds).toHaveLength(1);
    expect(a15.rect.w).toBe(40);
    expect(map.stands.filter((s) => s.code.includes('A16'))).toHaveLength(1);
    expect(byCode('A7')!.code).toBe('A7');
    expect(byCode('F4')!.code).toBe('F4–F5');
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
    expect(map.grounds.filter((g) => g.kind === 'road')).toHaveLength(4);
  });

  it('includes the four named halls and a parking ground instead of a booth', () => {
    expect(map.halls.filter((h) => !h.sealed).map((h) => h.label?.split(' · ')[0])).toEqual(['Hall A1', 'Hall A2', 'Hall A3', 'Hall A4']);
    expect(map.grounds.find((g) => g.kind === 'parking')?.rect.x).toBeGreaterThan(3700);
    expect(map.stands.some((s) => s.name === 'BÃI GIỮ XE')).toBe(false);
    expect(map.props.some((p) => p.kind === 'parked-car')).toBe(true);
  });

  it('loads booth names from the published hall lists', () => {
    expect(byCode('I10')?.name).toBe('After Midnight');
    expect(byCode('N30')?.name).toBe('Nguyễn Sỹ Hải Thanh');
    expect(byCode('S3')?.name).toBe('Kumodayne');
    expect(byCode('R3')?.name).toBe('PNC BOOKSTORE');
    expect(byCode('D38')?.name).toBe('Nghìn Năm Văn Vẻr');
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
