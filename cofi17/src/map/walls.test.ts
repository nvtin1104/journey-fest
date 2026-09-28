import { describe, expect, it } from 'vitest';
import data from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import { parseMap } from './parse';
import { buildWalls } from './walls';

const map = parseMap(data as EventMapData);

describe('buildWalls', () => {
  it('cuts one opening per gate on the top wall of hall 1', () => {
    const top = map.walls.filter((w) => w.axis === 'h' && w.at === -410);
    expect(top).toHaveLength(4);
    expect(map.doors.filter((d) => d.at === -410)).toHaveLength(3);
  });

  it('builds a shared wall between adjacent halls only once', () => {
    const shared = map.walls.filter((w) => w.axis === 'h' && w.at === 1250);
    const covered = shared.reduce((sum, w) => sum + (w.to - w.from), 0);
    expect(covered).toBe(3360 - 100 - 120);
  });

  it('merges overlapping edges and ignores gates away from walls', () => {
    const { walls, doors } = buildWalls(
      [{ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 50, w: 100, h: 50 }],
      [{ id: 'g', x: 40, y: 40, w: 20, h: 20 }, { id: 'far', x: 40, y: 20, w: 20, h: 5 }],
    );
    expect(doors.map((d) => d.gateId)).toEqual(['g']);
    expect(walls.filter((w) => w.axis === 'h' && w.at === 50)).toHaveLength(2);
  });
});
