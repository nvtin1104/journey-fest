import type { CollisionWorld } from './colliders';
import { toWorldX, toWorldZ, type Rect } from './coords';

export interface Point2D {
  x: number;
  z: number;
}

export class Pathfinder {
  readonly cellSize = 0.5;
  readonly minX: number;
  readonly minZ: number;
  readonly width: number;
  readonly height: number;
  readonly grid: Uint8Array;

  constructor(world: CollisionWorld, bounds: Rect) {
    const padMargin = 4;
    this.minX = toWorldX(bounds.x) - padMargin;
    this.minZ = toWorldZ(bounds.y) - padMargin;
    const maxX = toWorldX(bounds.x + bounds.w) + padMargin;
    const maxZ = toWorldZ(bounds.y + bounds.h) + padMargin;

    this.width = Math.ceil((maxX - this.minX) / this.cellSize);
    this.height = Math.ceil((maxZ - this.minZ) / this.cellSize);
    this.grid = new Uint8Array(this.width * this.height);

    // Clearance around obstacles for avatar walking.
    // 0.22m gives good clearance while ensuring doors and tight aisles remain open.
    const clearance = 0.35;
    for (const b of world.boxes) {
      const gx0 = Math.max(0, Math.floor((b.minX - clearance - this.minX) / this.cellSize));
      const gx1 = Math.min(this.width - 1, Math.floor((b.maxX + clearance - this.minX) / this.cellSize));
      const gz0 = Math.max(0, Math.floor((b.minZ - clearance - this.minZ) / this.cellSize));
      const gz1 = Math.min(this.height - 1, Math.floor((b.maxZ + clearance - this.minZ) / this.cellSize));
      for (let gz = gz0; gz <= gz1; gz++) {
        const row = gz * this.width;
        for (let gx = gx0; gx <= gx1; gx++) {
          this.grid[row + gx] = 1;
        }
      }
    }
  }

  isWalkable(gx: number, gz: number): boolean {
    if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.height) return false;
    return this.grid[gz * this.width + gx] === 0;
  }

  toGrid(wx: number, wz: number): { gx: number; gz: number } {
    return {
      gx: Math.floor((wx - this.minX) / this.cellSize),
      gz: Math.floor((wz - this.minZ) / this.cellSize),
    };
  }

  toWorld(gx: number, gz: number): Point2D {
    return {
      x: this.minX + (gx + 0.5) * this.cellSize,
      z: this.minZ + (gz + 0.5) * this.cellSize,
    };
  }

  /** Finds nearest walkable cell within maxRadius cells */
  nearestWalkable(gx: number, gz: number, maxRadius = 15): { gx: number; gz: number } | null {
    if (this.isWalkable(gx, gz)) return { gx, gz };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dz of [-r, r]) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (this.isWalkable(nx, nz)) return { gx: nx, gz: nz };
        }
      }
      for (let dz = -r + 1; dz <= r - 1; dz++) {
        for (const dx of [-r, r]) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (this.isWalkable(nx, nz)) return { gx: nx, gz: nz };
        }
      }
    }
    return null;
  }

  /** Raycast check on grid using Bresenham with diagonal corner checks */
  isLineClear(x0: number, z0: number, x1: number, z1: number): boolean {
    let dx = Math.abs(x1 - x0);
    let dz = Math.abs(z1 - z0);
    let x = x0;
    let z = z0;
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      if (!this.isWalkable(x, z)) return false;
      if (x === x1 && z === z1) break;
      const e2 = 2 * err;
      let nx = x;
      let nz = z;
      if (e2 > -dz) {
        err -= dz;
        nx += sx;
      }
      if (e2 < dx) {
        err += dx;
        nz += sz;
      }
      if (nx !== x && nz !== z) {
        if (!this.isWalkable(nx, z) || !this.isWalkable(x, nz)) {
          return false;
        }
      }
      x = nx;
      z = nz;
    }
    return true;
  }

  /**
   * Computes smooth path from world (startX, startZ) to (endX, endZ).
   * Returns list of world waypoints including start and end points.
   */
  findPath(startX: number, startZ: number, endX: number, endZ: number, allowDirectFallback = false): Point2D[] {
    const sGrid = this.toGrid(startX, startZ);
    const eGrid = this.toGrid(endX, endZ);

    const start = this.nearestWalkable(sGrid.gx, sGrid.gz);
    const goal = this.nearestWalkable(eGrid.gx, eGrid.gz);

    if (!start || !goal) {
      if (!allowDirectFallback) return [];
      console.log('Pathfinder failed: !start or !goal', { start, goal, sGrid, eGrid });
      // Fallback: direct line if no valid grid points found
      return [
        { x: startX, z: startZ },
        { x: endX, z: endZ },
      ];
    }

    if (start.gx === goal.gx && start.gz === goal.gz) {
      return [
        { x: startX, z: startZ },
        { x: endX, z: endZ },
      ];
    }

    // Direct line check first
    if (this.isLineClear(start.gx, start.gz, goal.gx, goal.gz)) {
      console.log('Pathfinder isLineClear direct line!');
      return [
        { x: startX, z: startZ },
        { x: endX, z: endZ },
      ];
    }

    // A* Search with 8-direction movement
    const totalCells = this.width * this.height;
    const gScore = new Float32Array(totalCells).fill(Infinity);
    const fScore = new Float32Array(totalCells).fill(Infinity);
    const cameFrom = new Int32Array(totalCells).fill(-1);
    const closed = new Uint8Array(totalCells);

    const startIndex = start.gz * this.width + start.gx;
    const goalIndex = goal.gz * this.width + goal.gx;

    const heuristic = (gx: number, gz: number) => {
      const dx = Math.abs(gx - goal.gx);
      const dz = Math.abs(gz - goal.gz);
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * 1.05;
    };

    gScore[startIndex] = 0;
    fScore[startIndex] = heuristic(start.gx, start.gz);

    const heap: number[] = [startIndex];

    const pushHeap = (idx: number) => {
      heap.push(idx);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (fScore[heap[i]] < fScore[heap[parent]]) {
          const tmp = heap[i];
          heap[i] = heap[parent];
          heap[parent] = tmp;
          i = parent;
        } else {
          break;
        }
      }
    };

    const popHeap = (): number => {
      const top = heap[0];
      const bottom = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = bottom;
        let i = 0;
        const len = heap.length;
        while (true) {
          let left = 2 * i + 1;
          let right = 2 * i + 2;
          let best = i;
          if (left < len && fScore[heap[left]] < fScore[heap[best]]) best = left;
          if (right < len && fScore[heap[right]] < fScore[heap[best]]) best = right;
          if (best !== i) {
            const tmp = heap[i];
            heap[i] = heap[best];
            heap[best] = tmp;
            i = best;
          } else {
            break;
          }
        }
      }
      return top;
    };

    // 8 directions: orthogonal cost 1, diagonal cost Math.SQRT2
    const dirs = [
      { dx: 1, dz: 0, cost: 1 },
      { dx: -1, dz: 0, cost: 1 },
      { dx: 0, dz: 1, cost: 1 },
      { dx: 0, dz: -1, cost: 1 },
      { dx: 1, dz: 1, cost: Math.SQRT2 },
      { dx: -1, dz: 1, cost: Math.SQRT2 },
      { dx: 1, dz: -1, cost: Math.SQRT2 },
      { dx: -1, dz: -1, cost: Math.SQRT2 },
    ];

    let found = false;
    let iterations = 0;
    const maxIterations = 120000;

    while (heap.length > 0 && iterations < maxIterations) {
      const curr = popHeap();
      if (closed[curr]) continue;
      iterations++;
      closed[curr] = 1;

      if (curr === goalIndex) {
        found = true;
        break;
      }

      const cx = curr % this.width;
      const cz = Math.floor(curr / this.width);
      const currG = gScore[curr];

      for (const d of dirs) {
        const nx = cx + d.dx;
        const nz = cz + d.dz;
        const nextIdx = nz * this.width + nx;
        if (closed[nextIdx] || !this.isWalkable(nx, nz)) continue;

        // Diagonal corner check: don't cut corners through obstacles
        if (d.dx !== 0 && d.dz !== 0) {
          if (!this.isWalkable(cx + d.dx, cz) || !this.isWalkable(cx, cz + d.dz)) {
            continue;
          }
        }

        const tentG = currG + d.cost;

        if (tentG < gScore[nextIdx]) {
          gScore[nextIdx] = tentG;
          fScore[nextIdx] = tentG + heuristic(nx, nz);
          cameFrom[nextIdx] = curr;
          pushHeap(nextIdx);
        }
      }
    }

    if (!found) {
      console.warn('Pathfinder: no path found between points', { start, goal, iterations, heapLen: heap.length });
      if (!allowDirectFallback) return [];
      return [
        { x: startX, z: startZ },
        { x: endX, z: endZ },
      ];
    }

    // Reconstruct raw grid path (reverse order)
    const rawPath: Array<{ gx: number; gz: number }> = [];
    let curr: number = goalIndex;
    while (curr !== -1) {
      rawPath.push({ gx: curr % this.width, gz: Math.floor(curr / this.width) });
      curr = cameFrom[curr];
    }
    rawPath.reverse();

    // String pulling / line-of-sight smoothing
    const smoothed: Array<{ gx: number; gz: number }> = [rawPath[0]];
    let currentIdx = 0;
    while (currentIdx < rawPath.length - 1) {
      let furthest = currentIdx + 1;
      for (let j = rawPath.length - 1; j > currentIdx + 1; j--) {
        if (this.isLineClear(rawPath[currentIdx].gx, rawPath[currentIdx].gz, rawPath[j].gx, rawPath[j].gz)) {
          furthest = j;
          break;
        }
      }
      smoothed.push(rawPath[furthest]);
      currentIdx = furthest;
    }

    // Convert to world coordinates
    const worldWaypoints: Point2D[] = [
      { x: startX, z: startZ },
      ...smoothed.slice(1, -1).map((p) => this.toWorld(p.gx, p.gz)),
      { x: endX, z: endZ },
    ];

    return worldWaypoints;
  }
}
