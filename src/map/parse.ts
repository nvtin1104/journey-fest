import { SCALE, WALL } from '../config';
import type { EventMapData, MapGroup, MapNode } from '../data/types';
import { containsRect, overlapArea, unionRect, type Facing, type Rect } from './coords';
import { computeFacing, facingTowards } from './facing';
import { buildWalls, wallRect, type Door, type GateRect, type WallSegment } from './walls';

/** Built from the API `areaTypeId` values used by the Color Fiesta map editor. */
export const AREA = {
  HALL: 2,
  FACILITY: 3,
  STAFF: 4,
  VIP: 5,
  COLUMN: 8,
  GATE: 10,
  SIDEWALK: 14,
  ROAD: 15,
  SIGN: 16,
  ZONE: 17,
  HIGHLIGHT: 18,
} as const;

export type StandKind = 'booth' | 'stall' | 'pavilion' | 'foodcourt';

export interface Stand {
  id: string;
  nodeIds: string[];
  kind: StandKind;
  /** Short code shown in bold on the sign, e.g. "A15–A16" or "L03". Empty when the label has no code. */
  code: string;
  name: string;
  rect: Rect;
  color: string;
  facing: Facing;
  groups: MapGroup[];
}

export interface Room { id: string; label: string; rect: Rect; color: string; showLabel: boolean; facing: Facing }
export interface Billboard { id: string; label: string; rect: Rect; color: string; facing: Facing }
export interface Column { id: string; rect: Rect; decor: boolean }
export interface Ground { id: string; kind: 'sidewalk' | 'road'; rect: Rect; color: string }
export interface Zone { id: string; label: string; rect: Rect; color: string }
export interface Stage { id: string; rect: Rect; facing: Facing }
export interface Highlight { id: string; rect: Rect; color: string }
export interface Prop { kind: 'table' | 'checkin-desk'; rect: Rect; facing: Facing }

export interface ParsedMap {
  halls: Array<Rect & { id: string }>;
  gates: GateRect[];
  walls: WallSegment[];
  doors: Door[];
  stands: Stand[];
  rooms: Room[];
  billboards: Billboard[];
  columns: Column[];
  grounds: Ground[];
  zones: Zone[];
  stages: Stage[];
  highlights: Highlight[];
  signParts: Rect[];
  props: Prop[];
  groups: MapGroup[];
  bounds: Rect;
}

/** Wall thickness in map units. */
export const WALL_T = WALL.thickness / SCALE;

const rectOf = (n: MapNode): Rect => ({ x: n.x, y: n.y, w: n.width, h: n.height });

/** "L03: Pick Miu Store" → { code: "L03", name: "Pick Miu Store" }. */
export function splitLabel(label: string): { code: string; name: string } {
  const m = /^\s*([A-Z]{1,3}\d{1,3})\s*:\s*(.*)$/i.exec(label);
  if (m) return { code: m[1].toUpperCase(), name: m[2].trim() };
  if (/^[A-Z]{1,3}\d{1,3}$/i.test(label.trim())) return { code: label.trim(), name: '' };
  return { code: '', name: label.replace(/\s+/g, ' ').trim() };
}

/** Drops exact duplicates and near-duplicates (> 80% overlap) of hall outlines. */
export function dedupeHalls(halls: Array<Rect & { id: string }>) {
  const kept: Array<Rect & { id: string }> = [];
  for (const h of halls) {
    const dup = kept.some((k) => overlapArea(k, h) > 0.8 * Math.min(k.w * k.h, h.w * h.h));
    if (!dup) kept.push(h);
  }
  return kept;
}

function classifyArea(n: MapNode): StandKind | 'room' | 'billboard' {
  const r = rectOf(n);
  if (n.areaTypeId === AREA.STAFF) return 'room';
  if ((n.areaTypeId === AREA.FACILITY || n.areaTypeId === AREA.VIP) && /^(WC|VIP)/i.test(n.label.trim())) return 'room';
  if (Math.min(r.w, r.h) <= 20) return 'billboard';
  if (/food\s*court/i.test(n.label)) return 'foodcourt';
  if (r.w >= 100 && r.h >= 100) return 'pavilion';
  return 'stall';
}

function foodCourtTables(r: Rect): Prop[] {
  const out: Prop[] = [];
  const size = 24;
  const cols = Math.max(1, Math.floor(r.w / 70));
  const rows = Math.max(1, Math.floor(r.h / 55));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = r.x + ((i + 0.5) * r.w) / cols;
      const cy = r.y + ((j + 0.5) * r.h) / rows;
      out.push({ kind: 'table', rect: { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, facing: 'S' });
    }
  }
  return out;
}

/** Check-in desks on both sides of the straight path between the check-in hall's two gates. */
function checkinDesks(zone: Rect, gates: GateRect[]): Prop[] {
  const inside = gates.filter((g) => g.x >= zone.x && g.x + g.w <= zone.x + zone.w);
  if (inside.length === 0) return [];
  const lane = unionRect(inside);
  const y = zone.y + zone.h * 0.55;
  const desks: Prop[] = [];
  const margin = 50;
  const left: Rect = { x: zone.x + 80, y, w: lane.x - margin - (zone.x + 80), h: 24 };
  const right: Rect = { x: lane.x + lane.w + margin, y, w: zone.x + zone.w - 60 - (lane.x + lane.w + margin), h: 24 };
  for (const r of [left, right]) if (r.w > 40) desks.push({ kind: 'checkin-desk', rect: r, facing: 'S' });
  return desks;
}

export function parseMap(data: EventMapData): ParsedMap {
  const groupById = new Map(data.groups.map((g) => [g.id, g]));
  const groupsByNode = new Map<string, Set<string>>();
  for (const e of data.edges) {
    if (!e.groupId || !groupById.has(e.groupId)) continue;
    for (const id of new Set([e.source, e.target])) {
      const set = groupsByNode.get(id) ?? new Set<string>();
      set.add(e.groupId);
      groupsByNode.set(id, set);
    }
  }

  const hallsRaw: Array<Rect & { id: string }> = [];
  const gates: GateRect[] = [];
  const roomsRaw: Array<Omit<Room, 'facing'>> = [];
  const billboardsRaw: Array<Omit<Billboard, 'facing'>> = [];
  const columns: Column[] = [];
  const grounds: Ground[] = [];
  const zones: Zone[] = [];
  const highlights: Highlight[] = [];
  const signParts: Rect[] = [];
  const roadsRaw: MapNode[] = [];
  const standsRaw: Array<Omit<Stand, 'facing' | 'groups'>> = [];
  const boothsByRef = new Map<string, MapNode[]>();

  for (const n of data.nodes) {
    const r = rectOf(n);
    if (n.type === 'BOOTH') {
      const key = n.refId ?? n.id;
      boothsByRef.set(key, [...(boothsByRef.get(key) ?? []), n]);
      continue;
    }
    switch (n.areaTypeId) {
      case AREA.HALL: hallsRaw.push({ id: n.id, ...r }); break;
      case AREA.GATE: gates.push({ id: n.id, ...r }); break;
      case AREA.SIDEWALK: grounds.push({ id: n.id, kind: 'sidewalk', rect: r, color: n.color }); break;
      case AREA.ROAD: roadsRaw.push(n); break;
      case AREA.SIGN: signParts.push(r); break;
      case AREA.ZONE: zones.push({ id: n.id, label: n.label, rect: r, color: n.color }); break;
      case AREA.HIGHLIGHT: highlights.push({ id: n.id, rect: r, color: n.color }); break;
      case AREA.COLUMN: columns.push({ id: n.id, rect: r, decor: !(r.w === 10 && r.h === 10) }); break;
      default: {
        const kind = classifyArea(n);
        if (kind === 'room') roomsRaw.push({ id: n.id, label: n.label, rect: r, color: n.color, showLabel: !n.hideLabel });
        else if (kind === 'billboard') billboardsRaw.push({ id: n.id, label: n.label, rect: r, color: n.color });
        else standsRaw.push({ id: n.id, nodeIds: [n.id], kind, ...splitLabel(n.label), rect: r, color: n.color });
      }
    }
  }

  for (const [key, nodes] of boothsByRef) {
    nodes.sort((a, b) => (a.boothSlot ?? 1) - (b.boothSlot ?? 1) || a.x - b.x || a.y - b.y);
    const labels = nodes.map((n) => n.label);
    standsRaw.push({
      id: key,
      nodeIds: nodes.map((n) => n.id),
      kind: 'booth',
      code: labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]}` : labels[0],
      name: (nodes[0].description ?? '').trim(),
      rect: unionRect(nodes.map(rectOf)),
      color: nodes[0].color,
    });
  }

  const halls = dedupeHalls(hallsRaw);
  const stages: Stage[] = [];
  for (const n of roadsRaw) {
    const r = rectOf(n);
    if (halls.some((h) => containsRect(h, r))) {
      const zone = zones.find((z) => containsRect(z.rect, r));
      const target = zone ? zone.rect : r;
      stages.push({ id: n.id, rect: r, facing: facingTowards(r, target.x + target.w / 2, target.y + target.h / 2) });
    } else {
      grounds.push({ id: n.id, kind: 'road', rect: r, color: n.color });
    }
  }

  const { walls, doors } = buildWalls(halls, gates);

  const props: Prop[] = [];
  for (const s of standsRaw) if (s.kind === 'foodcourt') props.push(...foodCourtTables(s.rect));
  for (const z of zones) if (/check\s*-?\s*in/i.test(z.label)) props.push(...checkinDesks(z.rect, gates));

  const standRects = standsRaw.map((s) => s.rect);
  const obstacles: Rect[] = [
    ...standRects,
    ...roomsRaw.map((r) => r.rect),
    ...billboardsRaw.map((b) => b.rect),
    ...columns.filter((c) => !c.decor).map((c) => c.rect),
    ...stages.map((s) => s.rect),
    ...grounds.filter((g) => g.kind === 'road').map((g) => g.rect),
    ...walls.map((w) => wallRect(w, WALL_T)),
  ];

  const stands: Stand[] = standsRaw.map((s) => {
    const groupIds = new Set<string>();
    for (const id of s.nodeIds) for (const g of groupsByNode.get(id) ?? []) groupIds.add(g);
    const groups = [...groupIds].map((id) => groupById.get(id)!).sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...s, groups, facing: computeFacing(s.rect, obstacles, standRects) };
  });

  const rooms: Room[] = roomsRaw.map((r) => ({ ...r, facing: computeFacing(r.rect, obstacles, []) }));

  const billboards: Billboard[] = billboardsRaw.map((b) => {
    const facing = computeFacing(b.rect, obstacles, []);
    // Thin boards can only face across their thin axis.
    const horizontal = b.rect.w >= b.rect.h;
    const fixed: Facing = horizontal ? (facing === 'N' || facing === 'S' ? facing : 'S') : facing === 'E' || facing === 'W' ? facing : 'E';
    return { ...b, facing: fixed };
  });

  const all = data.nodes.map(rectOf);
  const bounds = unionRect(all);

  return {
    halls, gates, walls, doors, stands, rooms, billboards, columns, grounds, zones, stages, highlights, signParts, props,
    groups: [...data.groups].sort((a, b) => a.sortOrder - b.sortOrder),
    bounds,
  };
}
