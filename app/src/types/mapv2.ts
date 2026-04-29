// Phase 2 dot-grid + wall-line map model. Lives alongside types/map.ts
// (rectangle model) until Phase 3 migration. See docs/rewrite-plan.md.
//
// A MapDocV2 is a dungeon level drawn as walls between adjacent grid dots.
// Tiles are implied by the enclosed regions that walls form, not painted
// directly. Regions are derived (flood-fill from "outside") and live in
// transient memory; only walls + region metadata are persisted.

import type { ExitType, MapNote } from "@/types/map";

// A wall segment between two adjacent dots. Always stored canonically:
// (ax, ay) precedes (bx, by) in row-major dot order, so two physically
// identical walls always produce the same WallKey. Diagonal segments are
// not allowed — adjacent dots only.
export interface Wall {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  exit?: { type: ExitType; locked?: boolean };
}

// Canonical string form of a wall — used as a Set key for fast lookup,
// React key for rendering, and undo-stack identifier.
export type WallKey = string;

// Region metadata, keyed by a stable hash of the region's tile set. The
// region itself (which tiles it contains) is derived from walls; only the
// human-edited fields persist. If the user reshapes a region such that
// its tile-set hash changes, that metadata becomes orphaned — Step 7's
// pin/side-panel work will reconcile this.
export interface RegionMeta {
  tilesHash: string;
  label?: string;
  type?: string;
  description?: string;
  encounter?: string;
  treasure?: string;
  cleared?: boolean;
}

export interface MapDocV2 {
  id: string;
  name: string;
  level: number;
  ancestry: string;
  characterId?: string;
  /** Standard sizes per the plan: 25×25 / 25×30 / 30×30, hard cap 40×40. */
  gridW: number;
  gridH: number;
  walls: Wall[];
  regions: RegionMeta[];
  notes: MapNote[];
  createdAt: string;
  updatedAt: string;
  /** Schema version for future migrations. */
  schema: 2;
}

// ---- Wall key helpers -----------------------------------------------------

export function wallKey(w: {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}): WallKey {
  // Canonical: smaller (y, x) first. Matches the spike's ordering so the
  // flood-fill and renderer agree on which wall is which.
  const aFirst =
    w.ay < w.by || (w.ay === w.by && w.ax <= w.bx);
  const a = aFirst ? { x: w.ax, y: w.ay } : { x: w.bx, y: w.by };
  const b = aFirst ? { x: w.bx, y: w.by } : { x: w.ax, y: w.ay };
  return `${a.x},${a.y}-${b.x},${b.y}`;
}

export function parseWallKey(key: WallKey): {
  ax: number;
  ay: number;
  bx: number;
  by: number;
} {
  const [p, q] = key.split("-");
  const [ax, ay] = p.split(",").map(Number);
  const [bx, by] = q.split(",").map(Number);
  return { ax, ay, bx, by };
}

export function wallSetFromList(walls: Wall[]): Set<WallKey> {
  const set = new Set<WallKey>();
  for (const w of walls) set.add(wallKey(w));
  return set;
}
