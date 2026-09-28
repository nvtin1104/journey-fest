import type { Rect } from './coords';

/** An axis-aligned wall line in map units. `axis: 'h'` runs along X at y = `at`. */
export interface WallSegment {
  axis: 'h' | 'v';
  at: number;
  from: number;
  to: number;
}

export interface Door extends WallSegment {
  gateId: string;
}

export interface GateRect extends Rect {
  id: string;
}

/** Max distance (map units) between a gate's centre line and a wall for the gate to cut it. */
const GATE_SNAP = 15;

function mergeIntervals(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtract(intervals: Array<[number, number]>, cut: [number, number]) {
  const out: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    if (cut[1] <= a || cut[0] >= b) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] > a) out.push([a, cut[0]]);
    if (cut[1] < b) out.push([cut[1], b]);
  }
  return out;
}

/**
 * Builds hall walls from hall outlines. Shared edges between neighbouring halls become one wall,
 * and every gate lying on a wall cuts a door opening into it.
 */
export function buildWalls(halls: Rect[], gates: GateRect[]): { walls: WallSegment[]; doors: Door[] } {
  const lines = new Map<string, { axis: 'h' | 'v'; at: number; spans: Array<[number, number]> }>();
  const add = (axis: 'h' | 'v', at: number, from: number, to: number) => {
    const key = `${axis}:${at}`;
    const line = lines.get(key) ?? { axis, at, spans: [] };
    line.spans.push([from, to]);
    lines.set(key, line);
  };
  for (const h of halls) {
    add('h', h.y, h.x, h.x + h.w);
    add('h', h.y + h.h, h.x, h.x + h.w);
    add('v', h.x, h.y, h.y + h.h);
    add('v', h.x + h.w, h.y, h.y + h.h);
  }

  const walls: WallSegment[] = [];
  const doors: Door[] = [];
  for (const line of lines.values()) {
    let spans = mergeIntervals(line.spans);
    for (const g of gates) {
      const horizontal = g.w >= g.h;
      if ((line.axis === 'h') !== horizontal) continue;
      const center = horizontal ? g.y + g.h / 2 : g.x + g.w / 2;
      if (Math.abs(center - line.at) > GATE_SNAP) continue;
      const cut: [number, number] = horizontal ? [g.x, g.x + g.w] : [g.y, g.y + g.h];
      if (!spans.some(([a, b]) => cut[0] < b && cut[1] > a)) continue;
      spans = subtract(spans, cut);
      doors.push({ gateId: g.id, axis: line.axis, at: line.at, from: cut[0], to: cut[1] });
    }
    for (const [from, to] of spans) {
      if (to - from > 0.5) walls.push({ axis: line.axis, at: line.at, from, to });
    }
  }
  return { walls, doors };
}

/** Footprint of a wall segment (map units) with the given thickness. */
export function wallRect(w: WallSegment, thickness: number): Rect {
  const t = thickness / 2;
  return w.axis === 'h'
    ? { x: w.from - t, y: w.at - t, w: w.to - w.from + thickness, h: thickness }
    : { x: w.at - t, y: w.from - t, w: thickness, h: w.to - w.from + thickness };
}
