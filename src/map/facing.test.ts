import { describe, expect, it } from 'vitest';
import data from '../data/event-map.json';
import type { EventMapData } from '../data/types';
import { parseMap } from './parse';

const map = parseMap(data as EventMapData);
const facing = (code: string) => map.stands.find((s) => s.code === code || s.code.split('–').includes(code))!.facing;

describe('stand facing', () => {
  it.each([
    ['A1', 'N'],
    ['A23', 'S'],
    ['B1', 'N'],
    ['D20', 'S'],
    ['H18', 'N'],
    ['W8', 'E'],
    ['W13', 'E'],
    ['FB1', 'S'],
    ['FB7', 'N'],
    ['I1', 'S'],
    ['I12', 'N'],
    ['P1', 'E'],
    ['L03', 'N'],
    ['S1', 'N'],
    ['S11', 'S'],
    ['R5', 'S'],
    ['R8', 'N'],
  ])('%s faces %s', (code, dir) => {
    expect(facing(code)).toBe(dir);
  });

  it('wall billboards face into the hall', () => {
    const board = (label: string) => map.billboards.find((b) => b.label === label)!.facing;
    expect(board('MENU OC & PET')).toBe('S');
    expect(board('ARTIST ALLEY MAP')).toBe('N');
  });
});
