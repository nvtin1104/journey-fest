import { describe, expect, it } from 'vitest';
import snapshot from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import { buildColliders } from './colliders';
import { parseMap } from './parse';
import { Pathfinder } from './pathfinding';
import { toWorldX, toWorldZ } from './coords';
import { SPAWN } from '../config';
import { standFront } from '../scene/booths';

describe('Pathfinder', () => {
  const map = parseMap(snapshot as EventMapData);
  const world = buildColliders(map);
  const pathfinder = new Pathfinder(world, map.bounds);

  it('constructs a valid grid', () => {
    expect(pathfinder.width).toBeGreaterThan(100);
    expect(pathfinder.height).toBeGreaterThan(100);
    expect(pathfinder.grid.length).toBe(pathfinder.width * pathfinder.height);
  });

  it('finds path from spawn to D5', () => {
    const spawnX = toWorldX(SPAWN.x);
    const spawnZ = toWorldZ(SPAWN.y);

    const d5 = map.stands.find((s) => s.code.includes('D5') || s.code.includes('D05'));
    expect(d5).toBeDefined();

    const p = standFront(d5!);
    const path = pathfinder.findPath(spawnX, spawnZ, p.x, p.z);
    expect(path.length).toBeGreaterThan(5);
    expect(path[0].x).toBeCloseTo(spawnX, 0);
    expect(path[0].z).toBeCloseTo(spawnZ, 0);
    expect(path[path.length - 1].x).toBeCloseTo(p.x, 0);
    expect(path[path.length - 1].z).toBeCloseTo(p.z, 0);
  });
});
