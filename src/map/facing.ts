import { FACING_MIN_CLEARANCE } from '../config';
import type { Facing, Rect } from './coords';

/** Search distance (map units) for free space in front of a stand. */
const LIMIT = 400;
/** Two stands closer than this (map units) sit in the same row/column. */
const ROW_GAP = 45;
/** Clearances closer than this count as a tie. */
const TIE = 5;
const ORDER: Facing[] = ['S', 'N', 'E', 'W'];
const OPPOSITE: Record<Facing, Facing> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export type Clearance = Record<Facing, number>;

/**
 * Free space from each side of `r` to the nearest obstacle whose span overlaps that side.
 * The side an obstacle lies on is decided by its centre, so a wall touching the rect gives 0.
 */
export function clearance(r: Rect, obstacles: Rect[]): Clearance {
  const out: Clearance = { N: LIMIT, S: LIMIT, E: LIMIT, W: LIMIT };
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  for (const o of obstacles) {
    if (o === r) continue;
    const ocx = o.x + o.w / 2;
    const ocy = o.y + o.h / 2;
    const spanX = o.x < r.x + r.w && o.x + o.w > r.x;
    const spanY = o.y < r.y + r.h && o.y + o.h > r.y;
    if (spanX) {
      if (ocy < cy) out.N = Math.min(out.N, Math.max(0, r.y - (o.y + o.h)));
      else if (ocy > cy) out.S = Math.min(out.S, Math.max(0, o.y - (r.y + r.h)));
    }
    if (spanY) {
      if (ocx < cx) out.W = Math.min(out.W, Math.max(0, r.x - (o.x + o.w)));
      else if (ocx > cx) out.E = Math.min(out.E, Math.max(0, o.x - (r.x + r.w)));
    }
  }
  return out;
}

/**
 * Picks the side a stand's counter faces.
 * - Stands in a horizontal row (or wide stands) face N/S; stands in a vertical column (or tall stands) face E/W.
 * - Sides with less than FACING_MIN_CLEARANCE of free space are blocked (a back-to-back partner or a wall).
 * - With exactly one blocked side, the stand faces away from it; otherwise the most open side wins.
 */
export function computeFacing(r: Rect, obstacles: Rect[], stands: Rect[]): Facing {
  const clear = clearance(r, obstacles);
  const near = clearance(r, stands);
  const horizRow = Math.min(near.E, near.W) < ROW_GAP;
  const vertCol = Math.min(near.N, near.S) < ROW_GAP;
  const wide = r.w >= 2 * r.h;
  const tall = r.h >= 2 * r.w;

  let allowed: Facing[];
  if (wide || (horizRow && !tall)) allowed = ['S', 'N'];
  else if (tall || vertCol) allowed = ['E', 'W'];
  else allowed = ORDER;

  const isOpen = (d: Facing) => clear[d] >= FACING_MIN_CLEARANCE;
  let open = allowed.filter(isOpen);
  if (open.length === 0) open = ORDER.filter(isOpen);
  if (open.length === 0) open = ORDER;

  const blocked = ORDER.filter((d) => !isOpen(d));
  if (blocked.length === 1 && open.includes(OPPOSITE[blocked[0]])) return OPPOSITE[blocked[0]];

  let best = open[0];
  for (const d of open) {
    if (clear[d] > clear[best] + TIE) best = d;
  }
  return best;
}

/** Facing towards a point (e.g. a stage towards the centre of its audience area). */
export function facingTowards(r: Rect, px: number, py: number): Facing {
  const dx = px - (r.x + r.w / 2);
  const dy = py - (r.y + r.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}
