// Phase 2 dot-grid map helpers. Pure functions only — no React, no DOM.
// Region detection lives here (not in the view) so future callers (Step 7
// pin centroids, Step 10 tile-count HUD) can reuse it.

import { wallKey, type WallKey } from "@/types/mapv2";

// ---- Tile-set identity --------------------------------------------------

/**
 * Stable id for a region's tile set. Sorted "x,y;x,y;..." — same tile set
 * always hashes the same way regardless of detection order. Verbose but
 * debuggable; if storage size ever matters, swap to a numeric hash.
 */
export function tilesHash(tiles: ReadonlyArray<readonly [number, number]>): string {
  const sorted = [...tiles].sort((a, b) =>
    a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0],
  );
  return sorted.map(([x, y]) => `${x},${y}`).join(";");
}

/**
 * Pin position for a region: tile in the set closest to the geometric
 * centroid. For convex/rectangular regions this is just the centroid; for
 * L-shaped or irregular regions it's the in-set tile nearest to it.
 */
export function regionCentroidTile(
  tiles: ReadonlyArray<readonly [number, number]>,
): [number, number] {
  if (tiles.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of tiles) {
    sx += x;
    sy += y;
  }
  const cx = sx / tiles.length;
  const cy = sy / tiles.length;
  let best: [number, number] = tiles[0] as [number, number];
  let bestDist = Infinity;
  for (const t of tiles) {
    const d = (t[0] - cx) ** 2 + (t[1] - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t as [number, number];
    }
  }
  return best;
}

// ---- 2d6 room generation classification --------------------------------

export type RoomKind = "corridor" | "small" | "large" | "regular";

export interface RoomRoll {
  primary: number;
  secondary: number;
  /** Tile budget = primary × secondary. Doubles re-roll is the user's call. */
  tiles: number;
  /** A 1 on either die (excluding double 1) means corridor. */
  corridor: boolean;
  /** Shorthand for the size bracket. */
  kind: RoomKind;
  /** Plain-language hint for doubles re-roll (excluding double 6). */
  double: boolean;
}

export function classifyRoomRoll(primary: number, secondary: number): RoomRoll {
  const tiles = primary * secondary;
  const isDouble = primary === secondary;
  // "Corridor on a 1" — but a double-1 is still treated as corridor per the
  // plan's interpretation (1×1 is a corridor segment, not a small room).
  const corridor = primary === 1 || secondary === 1;
  let kind: RoomKind;
  if (corridor) kind = "corridor";
  else if (tiles >= 32) kind = "large";
  else if (tiles <= 6) kind = "small";
  else kind = "regular";
  // Double 6 doesn't grant a re-roll per the rules; flag any other double.
  const double = isDouble && primary !== 6;
  return { primary, secondary, tiles, corridor, kind, double };
}

/**
 * Exit-count table from core rules: 1 = no exits, 2–3 = 1, 4–5 = 2, 6 = 3.
 * "Plus the entry exit, max 4 ways" is a placement rule — this is just the
 * count from the table.
 */
export function exitsFromD6(roll: number): number {
  if (roll <= 1) return 0;
  if (roll <= 3) return 1;
  if (roll <= 5) return 2;
  return 3;
}

export function rollD6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export interface DetectedRegions {
  regions: Array<Array<[number, number]>>;
  largest: number;
}

/**
 * Flood-fill from a virtual "outside" node. Cells that can't reach outside
 * through wall-free edges are enclosed; each connected enclosed component
 * is a region. Originally lifted from `/spike/draw`, parameterised over
 * grid dimensions.
 */
export function detectRegions(
  walls: Set<WallKey>,
  gridW: number,
  gridH: number,
): DetectedRegions {
  const blocked = (
    cx: number,
    cy: number,
    dx: number,
    dy: number,
  ): boolean => {
    let a: { x: number; y: number };
    let b: { x: number; y: number };
    if (dx === 1 && dy === 0) {
      a = { x: cx + 1, y: cy };
      b = { x: cx + 1, y: cy + 1 };
    } else if (dx === -1 && dy === 0) {
      a = { x: cx, y: cy };
      b = { x: cx, y: cy + 1 };
    } else if (dx === 0 && dy === 1) {
      a = { x: cx, y: cy + 1 };
      b = { x: cx + 1, y: cy + 1 };
    } else {
      a = { x: cx, y: cy };
      b = { x: cx + 1, y: cy };
    }
    return walls.has(wallKey({ ax: a.x, ay: a.y, bx: b.x, by: b.y }));
  };

  const inBounds = (cx: number, cy: number) =>
    cx >= 0 && cx < gridW && cy >= 0 && cy < gridH;

  const seedKey = (cx: number, cy: number) => `${cx},${cy}`;
  const outside = new Set<string>();
  const queue: Array<[number, number]> = [];

  // Seed from any boundary cell whose boundary edge has no wall.
  for (let cx = 0; cx < gridW; cx++) {
    if (!blocked(cx, 0, 0, -1)) {
      const k = seedKey(cx, 0);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([cx, 0]);
      }
    }
    if (!blocked(cx, gridH - 1, 0, 1)) {
      const k = seedKey(cx, gridH - 1);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([cx, gridH - 1]);
      }
    }
  }
  for (let cy = 0; cy < gridH; cy++) {
    if (!blocked(0, cy, -1, 0)) {
      const k = seedKey(0, cy);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([0, cy]);
      }
    }
    if (!blocked(gridW - 1, cy, 1, 0)) {
      const k = seedKey(gridW - 1, cy);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([gridW - 1, cy]);
      }
    }
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const neighbors: Array<[number, number]> = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!inBounds(nx, ny)) continue;
      const dx = nx - cx;
      const dy = ny - cy;
      if (blocked(cx, cy, dx, dy)) continue;
      const k = seedKey(nx, ny);
      if (outside.has(k)) continue;
      outside.add(k);
      queue.push([nx, ny]);
    }
  }

  const visited = new Set<string>(outside);
  const regions: Array<Array<[number, number]>> = [];
  for (let cy = 0; cy < gridH; cy++) {
    for (let cx = 0; cx < gridW; cx++) {
      const k = seedKey(cx, cy);
      if (visited.has(k)) continue;
      const region: Array<[number, number]> = [];
      const q: Array<[number, number]> = [[cx, cy]];
      visited.add(k);
      while (q.length > 0) {
        const [x, y] = q.shift()!;
        region.push([x, y]);
        const ns: Array<[number, number]> = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        for (const [nx, ny] of ns) {
          if (!inBounds(nx, ny)) continue;
          const nk = seedKey(nx, ny);
          if (visited.has(nk)) continue;
          if (blocked(x, y, nx - x, ny - y)) continue;
          visited.add(nk);
          q.push([nx, ny]);
        }
      }
      regions.push(region);
    }
  }

  const largest = regions.reduce((m, r) => Math.max(m, r.length), 0);
  return { regions, largest };
}
