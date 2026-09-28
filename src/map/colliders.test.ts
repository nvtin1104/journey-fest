import { describe, expect, it } from 'vitest';
import data from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import { SPAWN } from '../config';
import { buildColliders, CollisionWorld } from './colliders';
import { toWorldX, toWorldZ } from './coords';
import { parseMap } from './parse';

describe('CollisionWorld', () => {
  const world = new CollisionWorld([{ minX: 0, minZ: 0, maxX: 2, maxZ: 2 }]);

  it('pushes a circle out of a box', () => {
    const p = world.resolve(2.1, 1, 0.35);
    expect(p.x).toBeCloseTo(2.35);
    expect(p.z).toBeCloseTo(1);
  });

  it('pushes a centre that is inside a box out of the nearest face', () => {
    const p = world.resolve(1.9, 1, 0.35);
    expect(p.x).toBeCloseTo(2.35);
  });

  it('leaves free positions alone', () => {
    expect(world.resolve(5, 5, 0.35)).toEqual({ x: 5, z: 5 });
  });
});

describe('event colliders', () => {
  const map = parseMap(data as EventMapData);
  const world = buildColliders(map);

  it('keeps the spawn point free', () => {
    expect(world.isFree(toWorldX(SPAWN.x), toWorldZ(SPAWN.y), 0.35)).toBe(true);
  });

  it('lets the visitor through the check-in door but not through the wall next to it', () => {
    const door = map.doors.find((d) => d.at === 2740 && d.from === 3120)!;
    const mid = (door.from + door.to) / 2;
    expect(world.isFree(toWorldX(mid), toWorldZ(2740), 0.35)).toBe(true);
    expect(world.isFree(toWorldX(door.from - 40), toWorldZ(2740), 0.35)).toBe(false);
  });

  it('blocks booths', () => {
    const a1 = map.stands.find((s) => s.code === 'A1')!;
    expect(world.isFree(toWorldX(a1.rect.x + 20), toWorldZ(a1.rect.y + 20), 0.35)).toBe(false);
  });
});
