import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useCharacters } from "@/hooks/useCharacters";
import { useEncounter } from "@/hooks/useEncounter";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useOverlayApi } from "@/components/OverlayContext";
import {
  Button,
  Card,
  Field,
  NumberField,
  TextArea,
  TextField,
} from "@/components/ui";
import {
  classifyRoomRoll,
  detectRegions,
  exitsFromD6,
  regionCentroidTile,
  rollD6,
  tilesHash,
  type RoomRoll,
} from "@/lib/mapv2";
import {
  parseWallKey,
  wallKey,
  wallSetFromList,
  type MapDocV2,
  type RegionMeta,
  type Wall,
  type WallKey,
} from "@/types/mapv2";
import type { ExitType } from "@/types/map";

const CELL = 24; // pixels per grid cell at 100% zoom
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const ZOOM_STEP = 1.15;
const SNAP_RADIUS = 0.45; // grid units (touch / mouse)
const SNAP_RADIUS_PEN = 0.3; // tighter snap for stylus precision
const ERASE_RADIUS = 0.55; // grid units

type Tool = "draw" | "erase" | "exit" | "clearbox";

// Snapshot-based: each wall-modifying action pushes the pre-state walls.
// In-memory only, so the size cost is acceptable (~80B per wall × ~200 walls
// × ~100 entries ≈ 1.6 MB upper bound). Survives wall/exit/clear-box
// uniformly and preserves exit metadata through undo cycles.
interface UndoEntry {
  walls: Wall[];
}

function exitColor(type: ExitType): string {
  switch (type) {
    case "door":
      return "#92400e";
    case "open":
      return "#52525b";
    case "stone":
      return "#3f3f46";
    case "portcullis":
      return "#1f2937";
    case "magical":
      return "#a855f7";
    case "secret":
      return "#dc2626";
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export default function MapV2View() {
  const { maps, active, create, update, remove, setActive } = useMapsV2();

  return (
    <section className="mx-auto max-w-7xl space-y-4">
      <Card>
        <MapV2Switcher
          maps={maps}
          active={active}
          onSelect={setActive}
          onCreate={(opts) => create(opts)}
          onDelete={() => {
            if (!active) return;
            if (
              confirm(
                `Delete map "${active.name}"? This cannot be undone.`,
              )
            ) {
              remove(active.id);
            }
          }}
        />
      </Card>

      {!active ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No map yet. Click <strong>+ New map</strong> to start a dot-grid
            dungeon.
          </p>
        </Card>
      ) : (
        <MapV2Editor
          map={active}
          onUpdate={(patch) => update(active.id, patch)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function MapV2Switcher({
  maps,
  active,
  onSelect,
  onCreate,
  onDelete,
}: {
  maps: MapDocV2[];
  active: MapDocV2 | null;
  onSelect: (id: string) => void;
  onCreate: (opts: { name?: string; gridW?: number; gridH?: number }) => void;
  onDelete: () => void;
}) {
  const selectId = useId();
  const [picking, setPicking] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grow">
          <label
            htmlFor={selectId}
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Active Map (v2)
          </label>
          <select
            id={selectId}
            value={active?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            disabled={maps.length === 0}
            className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {maps.length === 0 && <option value="">(no maps yet)</option>}
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — Level {m.level} · {m.gridW}×{m.gridH}
              </option>
            ))}
          </select>
        </div>
        <Button variant="primary" onClick={() => setPicking((v) => !v)}>
          {picking ? "Cancel" : "+ New map"}
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={!active}>
          Delete
        </Button>
      </div>
      {picking && (
        <NewMapPicker
          onCreate={(opts) => {
            onCreate(opts);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

const SIZE_PRESETS: Array<{ w: number; h: number; label: string }> = [
  { w: 25, h: 25, label: "25 × 25" },
  { w: 25, h: 30, label: "25 × 30" },
  { w: 30, h: 30, label: "30 × 30" },
];

const MAX_GRID = 40;

function NewMapPicker({
  onCreate,
}: {
  onCreate: (opts: { name?: string; gridW?: number; gridH?: number }) => void;
}) {
  const [name, setName] = useState("New Map");
  // String state so the user can clear the field while typing without it
  // snapping back to 1. Parsed and clamped at commit time.
  const [wStr, setWStr] = useState("25");
  const [hStr, setHStr] = useState("25");

  function parseDim(s: string): number {
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1) return 25;
    return n;
  }

  // Live cap warning — the picker unmounts as soon as we call onCreate, so a
  // notice driven by commit-time state would render to a dead component.
  // Computing it from current input means the user sees the warning *before*
  // they click Create.
  const wantW = parseDim(wStr);
  const wantH = parseDim(hStr);
  const overCap = wantW > MAX_GRID || wantH > MAX_GRID;

  function commit(opts: { gridW: number; gridH: number }) {
    onCreate({
      name: name.trim() || "New Map",
      gridW: clamp(Math.round(opts.gridW), 1, MAX_GRID),
      gridH: clamp(Math.round(opts.gridH), 1, MAX_GRID),
    });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name" className="grow min-w-[10rem]">
          <TextField value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Width">
          <NumberField
            min={1}
            max={MAX_GRID}
            value={wStr}
            onChange={(e) => setWStr(e.target.value)}
            className="w-20"
          />
        </Field>
        <Field label="Height">
          <NumberField
            min={1}
            max={MAX_GRID}
            value={hStr}
            onChange={(e) => setHStr(e.target.value)}
            className="w-20"
          />
        </Field>
        <Button
          variant="primary"
          onClick={() =>
            commit({ gridW: parseDim(wStr), gridH: parseDim(hStr) })
          }
        >
          Create
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Presets
        </span>
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => commit({ gridW: p.w, gridH: p.h })}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-zinc-500">Cap {MAX_GRID} × {MAX_GRID}.</span>
      </div>
      {overCap && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Will be capped at {MAX_GRID} × {MAX_GRID} — you asked for {wantW} ×{" "}
          {wantH}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapV2Editor({
  map,
  onUpdate,
}: {
  map: MapDocV2;
  onUpdate: (patch: Partial<MapDocV2>) => void;
}) {
  const { active: activeCharacter } = useCharacters();
  const { encounter, start: startEncounter } = useEncounter();
  const { openCombat } = useOverlayApi();

  const [tool, setTool] = useState<Tool>("draw");
  const [exitType, setExitType] = useState<ExitType>("door");
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // In-progress stroke (drives the preview overlay). On pointerup we commit
  // its delta to the map and push one undo entry — that's per-stroke undo.
  const [strokeAdds, setStrokeAdds] = useState<Set<WallKey>>(() => new Set());
  const [strokeRemoves, setStrokeRemoves] = useState<Set<WallKey>>(
    () => new Set(),
  );
  const strokeRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastDot: { x: number; y: number } | null;
    adds: Set<WallKey>;
    removes: Set<WallKey>;
  } | null>(null);

  const undoStackRef = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  // Drag-rectangle clear (Step 12). Coords in grid units (not snapped).
  const [rectDrag, setRectDrag] = useState<{
    startGX: number;
    startGY: number;
    endGX: number;
    endGY: number;
  } | null>(null);

  // Selected region (by tilesHash) for the side-panel metadata editor.
  // Cleared when the underlying region disappears (orphaned metadata still
  // lives in map.regions until the user resurrects the same tile set).
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  // Latest 2d6 room roll + the user-pinned exit-count D6 (Step 9).
  // Ephemeral — not persisted. `targetTiles` drives the HUD (Step 10).
  const [lastRoll, setLastRoll] = useState<RoomRoll | null>(null);
  const [exitRoll, setExitRoll] = useState<number | null>(null);
  const [targetTiles, setTargetTiles] = useState<number | null>(null);

  // Stylus palm rejection: any active pen pointer suppresses touch input
  // for the duration. Active stylus reports pointerType="pen", passive
  // capacitive stylus reports "touch" (no benefit there, but no harm).
  const penPointersRef = useRef<Set<number>>(new Set());

  // Multi-touch pinch (lifted from Map.tsx). A 2nd touch enters pinch mode
  // and cancels any in-progress drawing stroke; tool actions stay suppressed
  // for the rest of the touch session after a pinch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    distance: number;
    midpoint: { x: number; y: number };
    scale: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const inPinchSessionRef = useRef(false);

  const wallSet = useMemo(() => wallSetFromList(map.walls), [map.walls]);
  // Live wall set: persisted ∪ in-progress adds \ in-progress removes.
  // Drives both region tinting AND the tile-count HUD so the user sees
  // regions form/break as they draw — same behavior as the spike.
  const liveWallSet = useMemo(() => {
    if (strokeAdds.size === 0 && strokeRemoves.size === 0) return wallSet;
    const set = new Set(wallSet);
    for (const k of strokeAdds) set.add(k);
    for (const k of strokeRemoves) set.delete(k);
    return set;
  }, [wallSet, strokeAdds, strokeRemoves]);
  const regions = useMemo(
    () => detectRegions(liveWallSet, map.gridW, map.gridH),
    [liveWallSet, map.gridW, map.gridH],
  );

  // Region info: hash, centroid, attached metadata (if any). Recomputes on
  // every regions change — flood-fill is sub-millisecond at our grid sizes.
  const regionInfos = useMemo(() => {
    const metaByHash = new Map<string, RegionMeta>();
    for (const m of map.regions) metaByHash.set(m.tilesHash, m);
    return regions.regions.map((tiles) => {
      const hash = tilesHash(tiles);
      const [cx, cy] = regionCentroidTile(tiles);
      return {
        hash,
        tiles,
        cx,
        cy,
        meta: metaByHash.get(hash) ?? null,
      };
    });
  }, [regions, map.regions]);

  const selectedInfo = selectedHash
    ? regionInfos.find((r) => r.hash === selectedHash) ?? null
    : null;
  const orphanedMeta = useMemo(() => {
    const detected = new Set(regionInfos.map((r) => r.hash));
    return map.regions.filter((m) => !detected.has(m.tilesHash));
  }, [map.regions, regionInfos]);

  function patchRegion(
    hash: string,
    patch: Partial<Omit<RegionMeta, "tilesHash">>,
  ) {
    const idx = map.regions.findIndex((r) => r.tilesHash === hash);
    let next: RegionMeta[];
    if (idx >= 0) {
      next = map.regions.slice();
      next[idx] = { ...next[idx], ...patch };
    } else {
      next = [...map.regions, { tilesHash: hash, ...patch }];
    }
    onUpdate({ regions: next });
  }

  function pruneOrphans() {
    const detected = new Set(regionInfos.map((r) => r.hash));
    const next = map.regions.filter((m) => detected.has(m.tilesHash));
    onUpdate({ regions: next });
  }

  const dots = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y <= map.gridH; y++) {
      for (let x = 0; x <= map.gridW; x++) out.push({ x, y });
    }
    return out;
  }, [map.gridW, map.gridH]);

  // Ctrl/Cmd + wheel zoom anchored at the cursor. Lifted from Map.tsx.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const rect = container!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      zoomAtCursor(cx, cy, factor);
    }
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  function zoomAtCursor(cursorX: number, cursorY: number, factor: number) {
    const container = containerRef.current;
    if (!container) return;
    setScale((prev) => {
      const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
      if (next === prev) return prev;
      const ratio = next / prev;
      const newScrollLeft = (cursorX + container.scrollLeft) * ratio - cursorX;
      const newScrollTop = (cursorY + container.scrollTop) * ratio - cursorY;
      requestAnimationFrame(() => {
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;
      });
      return next;
    });
  }

  function zoomBy(factor: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAtCursor(rect.width / 2, rect.height / 2, factor);
  }

  function zoomReset() {
    setScale(1);
  }

  // ---- Coordinate helpers -------------------------------------------------

  function clientToGrid(
    e: ReactPointerEvent<SVGSVGElement>,
  ): { gx: number; gy: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { gx: local.x / CELL, gy: local.y / CELL };
  }

  function snapToDot(
    gx: number,
    gy: number,
    radius: number = SNAP_RADIUS,
  ): { x: number; y: number } | null {
    const sx = Math.round(gx);
    const sy = Math.round(gy);
    if (sx < 0 || sx > map.gridW || sy < 0 || sy > map.gridH) return null;
    if (Math.hypot(gx - sx, gy - sy) > radius) return null;
    return { x: sx, y: sy };
  }

  // ---- Stroke commit / preview -------------------------------------------

  function beginStroke(pointerId: number, dot: { x: number; y: number } | null) {
    strokeRef.current = {
      active: true,
      pointerId,
      lastDot: dot,
      adds: new Set(),
      removes: new Set(),
    };
    setStrokeAdds(new Set());
    setStrokeRemoves(new Set());
  }

  function tryCommitDrawSegment(a: { x: number; y: number }, b: { x: number; y: number }) {
    if (a.x === b.x && a.y === b.y) return;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return;
    const key = wallKey({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    const s = strokeRef.current;
    if (!s) return;
    // Already on the map? Skip (treat as already-drawn).
    if (wallSet.has(key) && !s.removes.has(key)) return;
    if (s.adds.has(key)) return;
    s.adds.add(key);
    setStrokeAdds(new Set(s.adds));
  }

  function walkDrawSegments(from: { x: number; y: number }, to: { x: number; y: number }) {
    let cur = { ...from };
    const stepX = Math.sign(to.x - cur.x);
    while (cur.x !== to.x) {
      const next = { x: cur.x + stepX, y: cur.y };
      tryCommitDrawSegment(cur, next);
      cur = next;
    }
    const stepY = Math.sign(to.y - cur.y);
    while (cur.y !== to.y) {
      const next = { x: cur.x, y: cur.y + stepY };
      tryCommitDrawSegment(cur, next);
      cur = next;
    }
  }

  function tryEraseAt(gx: number, gy: number) {
    const s = strokeRef.current;
    if (!s) return;
    let bestKey: WallKey | null = null;
    let bestDist = ERASE_RADIUS;
    for (const w of map.walls) {
      const key = wallKey(w);
      if (s.removes.has(key)) continue; // already queued for removal
      const mx = (w.ax + w.bx) / 2;
      const my = (w.ay + w.by) / 2;
      const d = Math.hypot(gx - mx, gy - my);
      if (d < bestDist) {
        bestDist = d;
        bestKey = key;
      }
    }
    // Also consider walls added earlier in this same stroke so the user can
    // erase mistakes mid-stroke. (Symmetric for completeness.)
    if (s.adds.size > 0) {
      for (const k of s.adds) {
        const w = parseWallKey(k);
        const mx = (w.ax + w.bx) / 2;
        const my = (w.ay + w.by) / 2;
        const d = Math.hypot(gx - mx, gy - my);
        if (d < bestDist) {
          bestDist = d;
          bestKey = k;
        }
      }
    }
    if (!bestKey) return;
    if (s.adds.has(bestKey)) {
      s.adds.delete(bestKey);
      setStrokeAdds(new Set(s.adds));
    } else {
      s.removes.add(bestKey);
      setStrokeRemoves(new Set(s.removes));
    }
  }

  function pushUndo() {
    undoStackRef.current.push({ walls: map.walls });
    setUndoCount(undoStackRef.current.length);
  }

  function findWallIndexNear(gx: number, gy: number): number {
    let bestIdx = -1;
    let bestDist = ERASE_RADIUS;
    for (let i = 0; i < map.walls.length; i++) {
      const w = map.walls[i];
      const mx = (w.ax + w.bx) / 2;
      const my = (w.ay + w.by) / 2;
      const d = Math.hypot(gx - mx, gy - my);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function toggleExitOnWall(idx: number) {
    const w = map.walls[idx];
    pushUndo();
    let nextWall: Wall;
    if (w.exit && w.exit.type === exitType) {
      nextWall = { ax: w.ax, ay: w.ay, bx: w.bx, by: w.by };
    } else {
      nextWall = { ...w, exit: { type: exitType } };
    }
    const nextWalls = map.walls.slice();
    nextWalls[idx] = nextWall;
    onUpdate({ walls: nextWalls });
  }

  function endStroke() {
    const s = strokeRef.current;
    strokeRef.current = null;
    if (!s) return;
    setStrokeAdds(new Set());
    setStrokeRemoves(new Set());
    if (s.adds.size === 0 && s.removes.size === 0) return;

    // Apply delta. Removed walls preserve their exit data via map.walls
    // identity (we filter by key); added walls are plain.
    const removeKeys = s.removes;
    const next: Wall[] = map.walls.filter((w) => !removeKeys.has(wallKey(w)));
    for (const k of s.adds) {
      const { ax, ay, bx, by } = parseWallKey(k);
      next.push({ ax, ay, bx, by });
    }
    pushUndo();
    onUpdate({ walls: next });
  }

  function undo() {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    setUndoCount(undoStackRef.current.length);
    onUpdate({ walls: entry.walls });
  }

  // ---- Pointer plumbing ---------------------------------------------------

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    // Stylus tracking + palm rejection.
    if (e.pointerType === "pen") {
      penPointersRef.current.add(e.pointerId);
    } else if (
      e.pointerType === "touch" &&
      penPointersRef.current.size > 0
    ) {
      // Pen is active — treat this touch as a palm and ignore.
      return;
    }

    // Multi-touch pinch detection takes priority.
    if (e.pointerType === "touch") {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        // Cancel any in-progress stroke and switch to pinch mode.
        strokeRef.current = null;
        setStrokeAdds(new Set());
        setStrokeRemoves(new Set());
        inPinchSessionRef.current = true;
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          pinchRef.current = {
            distance: dist,
            midpoint: {
              x: (pts[0].x + pts[1].x) / 2 - rect.left,
              y: (pts[0].y + pts[1].y) / 2 - rect.top,
            },
            scale,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop,
          };
        }
        return;
      }
      if (inPinchSessionRef.current) return;
    }

    if (e.pointerType === "mouse" && e.button !== 0) return;
    const grid = clientToGrid(e);
    if (!grid) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "exit") {
      const idx = findWallIndexNear(grid.gx, grid.gy);
      if (idx >= 0) toggleExitOnWall(idx);
      return;
    }

    if (tool === "clearbox") {
      setRectDrag({
        startGX: grid.gx,
        startGY: grid.gy,
        endGX: grid.gx,
        endGY: grid.gy,
      });
      return;
    }

    const snapR = e.pointerType === "pen" ? SNAP_RADIUS_PEN : SNAP_RADIUS;
    if (tool === "draw") {
      beginStroke(e.pointerId, snapToDot(grid.gx, grid.gy, snapR));
    } else {
      beginStroke(e.pointerId, null);
      tryEraseAt(grid.gx, grid.gy);
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    // Pinch-zoom path takes precedence.
    if (e.pointerType === "touch" && pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const currentMid = {
          x: (pts[0].x + pts[1].x) / 2 - rect.left,
          y: (pts[0].y + pts[1].y) / 2 - rect.top,
        };
        const baseline = pinchRef.current;
        const targetScale = clamp(
          baseline.scale * (currentDist / baseline.distance),
          MIN_SCALE,
          MAX_SCALE,
        );
        const worldX = (baseline.midpoint.x + baseline.scrollLeft) / baseline.scale;
        const worldY = (baseline.midpoint.y + baseline.scrollTop) / baseline.scale;
        const newScrollLeft = worldX * targetScale - currentMid.x;
        const newScrollTop = worldY * targetScale - currentMid.y;
        setScale(targetScale);
        requestAnimationFrame(() => {
          container.scrollLeft = newScrollLeft;
          container.scrollTop = newScrollTop;
        });
        return;
      }
    }

    if (rectDrag && tool === "clearbox") {
      const grid = clientToGrid(e);
      if (!grid) return;
      setRectDrag({ ...rectDrag, endGX: grid.gx, endGY: grid.gy });
      return;
    }

    const s = strokeRef.current;
    if (!s || !s.active) return;
    const grid = clientToGrid(e);
    if (!grid) return;
    if (tool === "draw") {
      const snapR =
        e.pointerType === "pen" ? SNAP_RADIUS_PEN : SNAP_RADIUS;
      const dot = snapToDot(grid.gx, grid.gy, snapR);
      if (!dot) return;
      if (s.lastDot) walkDrawSegments(s.lastDot, dot);
      s.lastDot = dot;
    } else if (tool === "erase") {
      tryEraseAt(grid.gx, grid.gy);
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === "pen") {
      penPointersRef.current.delete(e.pointerId);
    }

    // Pinch teardown.
    if (e.pointerType === "touch") {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) inPinchSessionRef.current = false;
      if (inPinchSessionRef.current) return;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may not have been captured (e.g. cancelled by pinch) — fine.
    }
    if (rectDrag && tool === "clearbox") {
      commitRectClear(rectDrag);
      setRectDrag(null);
      return;
    }
    endStroke();
  }

  function commitRectClear(r: {
    startGX: number;
    startGY: number;
    endGX: number;
    endGY: number;
  }) {
    const lo = { x: Math.min(r.startGX, r.endGX), y: Math.min(r.startGY, r.endGY) };
    const hi = { x: Math.max(r.startGX, r.endGX), y: Math.max(r.startGY, r.endGY) };
    // Treat tiny boxes as a no-op so a stray tap doesn't wipe walls.
    if (hi.x - lo.x < 0.25 && hi.y - lo.y < 0.25) return;
    const survivors = map.walls.filter((w) => {
      const mx = (w.ax + w.bx) / 2;
      const my = (w.ay + w.by) / 2;
      return !(mx >= lo.x && mx <= hi.x && my >= lo.y && my <= hi.y);
    });
    if (survivors.length === map.walls.length) return;
    pushUndo();
    onUpdate({ walls: survivors });
  }

  // ---- Render -------------------------------------------------------------

  // Reference to persisted-wall set — used to skip preview rendering of
  // already-on-the-map walls.
  const persistedWallKeys = wallSet;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
      <Card>
        <header className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Name" className="grow min-w-[10rem]">
            <TextField
              value={map.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </Field>
          <Field label="Level">
            <NumberField
              min={1}
              max={10}
              value={map.level}
              onChange={(e) =>
                onUpdate({ level: Number(e.target.value) || 1 })
              }
              className="w-20"
            />
          </Field>
          <Field label="Ancestry">
            <TextField
              value={map.ancestry}
              onChange={(e) => onUpdate({ ancestry: e.target.value })}
              className="w-32"
            />
          </Field>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <ToolPalette
            tool={tool}
            onTool={setTool}
            exitType={exitType}
            onExitType={setExitType}
          />
          <Button onClick={undo} disabled={undoCount === 0} title="Undo last stroke">
            ↶ Undo
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button onClick={() => zoomBy(1 / ZOOM_STEP)} title="Zoom out">
              −
            </Button>
            <button
              type="button"
              onClick={zoomReset}
              title="Reset zoom"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800"
            >
              {Math.round(scale * 100)}%
            </button>
            <Button onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">
              +
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <svg
            ref={svgRef}
            width={(map.gridW + 1) * CELL}
            height={(map.gridH + 1) * CELL}
            viewBox={`-${CELL / 2} -${CELL / 2} ${(map.gridW + 1) * CELL} ${
              (map.gridH + 1) * CELL
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="block touch-none select-none"
            style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}
          >
            {/* Region tinting (persisted state only) */}
            {regions.regions.map((cells, i) => (
              <g key={`r${i}`}>
                {cells.map(([cx, cy]) => (
                  <rect
                    key={`${cx},${cy}`}
                    x={cx * CELL}
                    y={cy * CELL}
                    width={CELL}
                    height={CELL}
                    fill={`hsl(${(i * 67) % 360} 70% 55% / 0.28)`}
                  />
                ))}
              </g>
            ))}

            {/* Dots */}
            {dots.map((d) => (
              <circle
                key={`${d.x},${d.y}`}
                cx={d.x * CELL}
                cy={d.y * CELL}
                r={2}
                className="fill-zinc-400 dark:fill-zinc-600"
              />
            ))}

            {/* Persisted walls (faded if pending removal in current stroke) */}
            {map.walls.map((w) => {
              const key = wallKey(w);
              const pendingRemove = strokeRemoves.has(key);
              return (
                <line
                  key={key}
                  x1={w.ax * CELL}
                  y1={w.ay * CELL}
                  x2={w.bx * CELL}
                  y2={w.by * CELL}
                  className="stroke-amber-500 dark:stroke-amber-400"
                  strokeOpacity={pendingRemove ? 0.25 : 1}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}

            {/* In-progress stroke adds (preview) */}
            {[...strokeAdds].map((k) => {
              if (persistedWallKeys.has(k)) return null;
              const w = parseWallKey(k);
              return (
                <line
                  key={`add-${k}`}
                  x1={w.ax * CELL}
                  y1={w.ay * CELL}
                  x2={w.bx * CELL}
                  y2={w.by * CELL}
                  className="stroke-emerald-500 dark:stroke-emerald-400"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="3 2"
                />
              );
            })}

            {/* Exit glyphs (small badge at wall midpoint) */}
            {map.walls.map((w) => {
              if (!w.exit) return null;
              const mx = ((w.ax + w.bx) / 2) * CELL;
              const my = ((w.ay + w.by) / 2) * CELL;
              const horizontal = w.ay === w.by;
              const stroke = exitColor(w.exit.type);
              const dash =
                w.exit.type === "secret"
                  ? "2 2"
                  : w.exit.type === "portcullis"
                    ? "4 2"
                    : undefined;
              const halfLen = CELL * 0.32;
              const x1 = horizontal ? mx - halfLen : mx;
              const x2 = horizontal ? mx + halfLen : mx;
              const y1 = horizontal ? my : my - halfLen;
              const y2 = horizontal ? my : my + halfLen;
              return (
                <g key={`exit-${wallKey(w)}`} pointerEvents="none">
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={stroke}
                    strokeWidth={6}
                    strokeLinecap="square"
                    strokeDasharray={dash}
                  />
                  <circle
                    cx={mx}
                    cy={my}
                    r={3}
                    fill={stroke}
                  />
                </g>
              );
            })}

            {/* Drag-rectangle clear preview */}
            {rectDrag && tool === "clearbox" && (
              <rect
                x={Math.min(rectDrag.startGX, rectDrag.endGX) * CELL}
                y={Math.min(rectDrag.startGY, rectDrag.endGY) * CELL}
                width={Math.abs(rectDrag.endGX - rectDrag.startGX) * CELL}
                height={Math.abs(rectDrag.endGY - rectDrag.startGY) * CELL}
                fill="rgba(244, 63, 94, 0.15)"
                stroke="rgb(244, 63, 94)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}

            {/* Region pins + always-on labels */}
            {regionInfos.map((r) => {
              const cx = (r.cx + 0.5) * CELL;
              const cy = (r.cy + 0.5) * CELL;
              const selected = r.hash === selectedHash;
              const label = r.meta?.label || r.meta?.type || "";
              const cleared = !!r.meta?.cleared;
              return (
                <g key={`pin-${r.hash}`} style={{ pointerEvents: "auto" }}>
                  {/* Generous transparent hit target — easier than the dot. */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={CELL * 0.55}
                    fill="transparent"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHash(r.hash);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={selected ? CELL * 0.32 : CELL * 0.22}
                    className={
                      cleared
                        ? "fill-zinc-400 stroke-zinc-700 dark:fill-zinc-500 dark:stroke-zinc-200"
                        : selected
                          ? "fill-emerald-300 stroke-emerald-700 dark:fill-emerald-500 dark:stroke-emerald-200"
                          : "fill-amber-200 stroke-amber-700 dark:fill-amber-400 dark:stroke-amber-100"
                    }
                    strokeWidth={selected ? 2 : 1.5}
                    pointerEvents="none"
                  />
                  {label && (
                    // Single text + canvas-matched halo so labels feel etched
                    // into the map rather than stamped on top. Earlier version
                    // stacked white-fill + dark-stroke under a zinc-900 fill,
                    // producing a three-tone "sticker" against region tints.
                    <text
                      x={cx}
                      y={cy - CELL * 0.65}
                      textAnchor="middle"
                      fontSize={CELL * 0.55}
                      fontWeight={600}
                      paintOrder="stroke"
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      className="fill-zinc-900 stroke-zinc-100 dark:fill-zinc-100 dark:stroke-zinc-950"
                      style={{ letterSpacing: "0.02em" }}
                      pointerEvents="none"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {targetTiles !== null && (
            <span
              className={`mr-3 rounded px-1.5 py-0.5 font-mono font-semibold ${
                regions.largest === targetTiles
                  ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                  : regions.largest > targetTiles
                    ? "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100"
                    : "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
              }`}
              title="Largest enclosed region (live) vs target tile budget"
            >
              {regions.largest} / {targetTiles} tiles
            </span>
          )}
          {map.walls.length} wall{map.walls.length === 1 ? "" : "s"} ·{" "}
          {regions.regions.length} region
          {regions.regions.length === 1 ? "" : "s"} · largest{" "}
          {regions.largest} tile{regions.largest === 1 ? "" : "s"} · grid{" "}
          {map.gridW}×{map.gridH} · zoom {Math.round(scale * 100)}% ·{" "}
          <kbd className="font-mono">Ctrl/⌘ + wheel</kbd> / two-finger pinch
          to zoom
        </p>
      </Card>

      <div className="space-y-4">
        <RollPanel
          lastRoll={lastRoll}
          exitRoll={exitRoll}
          targetTiles={targetTiles}
          onRoom={(primary, secondary) =>
            setLastRoll(classifyRoomRoll(primary, secondary))
          }
          onExits={(roll) => setExitRoll(roll)}
          onUseAsTarget={() => {
            if (lastRoll) setTargetTiles(lastRoll.tiles);
          }}
          onClearTarget={() => setTargetTiles(null)}
        />
        {selectedInfo ? (
          <RegionDetailPanel
            info={selectedInfo}
            onPatch={(patch) => patchRegion(selectedInfo.hash, patch)}
            onDeselect={() => setSelectedHash(null)}
            combatLabel={
              encounter
                ? `Resume combat · Round ${encounter.round}`
                : "Start combat here"
            }
            combatDisabled={!activeCharacter}
            onStartCombat={() => {
              if (!activeCharacter) return;
              if (!encounter) {
                startEncounter(activeCharacter.id, {
                  roomId: selectedInfo.hash,
                  roomLabel:
                    selectedInfo.meta?.label ||
                    selectedInfo.meta?.type ||
                    undefined,
                });
              }
              openCombat();
            }}
          />
        ) : (
          <Card title="Region">
            <p className="text-sm text-zinc-500">
              Tap a pin in an enclosed region to edit its label, type,
              encounter and treasure.{" "}
              {regionInfos.length === 0
                ? "No regions yet — draw walls to enclose one."
                : `${regionInfos.length} detected.`}
            </p>
          </Card>
        )}
        {orphanedMeta.length > 0 && (
          <Card title="Orphaned region notes">
            <p className="text-xs text-zinc-500">
              {orphanedMeta.length} region note
              {orphanedMeta.length === 1 ? "" : "s"} no longer match any
              enclosed area on the map. They're kept in storage in case the
              same shape comes back; otherwise you can clear them.
            </p>
            <div className="mt-2">
              <Button onClick={pruneOrphans}>Prune {orphanedMeta.length}</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ToolPalette({
  tool,
  onTool,
  exitType,
  onExitType,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  exitType: ExitType;
  onExitType: (t: ExitType) => void;
}) {
  const tools: { id: Tool; label: string; hint: string }[] = [
    { id: "draw", label: "Draw", hint: "Drag along dots to lay walls." },
    { id: "erase", label: "Erase", hint: "Tap or drag near a wall to remove it." },
    { id: "exit", label: "Exit", hint: "Tap a wall to attach (or remove) an exit of the selected type." },
    { id: "clearbox", label: "Clear box", hint: "Drag a rectangle to remove every wall inside it." },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTool(t.id)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            tool === t.id
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
          title={t.hint}
        >
          {t.label}
        </button>
      ))}
      {tool === "exit" && (
        <span className="ml-1 inline-flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Type
          </span>
          <select
            value={exitType}
            onChange={(e) => onExitType(e.target.value as ExitType)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="door">Door</option>
            <option value="open">Open</option>
            <option value="stone">Stone slab</option>
            <option value="portcullis">Portcullis</option>
            <option value="magical">Magical barrier</option>
            <option value="secret">Secret</option>
          </select>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RegionInfo {
  hash: string;
  tiles: Array<[number, number]>;
  cx: number;
  cy: number;
  meta: RegionMeta | null;
}

function RegionDetailPanel({
  info,
  onPatch,
  onDeselect,
  combatLabel,
  combatDisabled,
  onStartCombat,
}: {
  info: RegionInfo;
  onPatch: (patch: Partial<Omit<RegionMeta, "tilesHash">>) => void;
  onDeselect: () => void;
  combatLabel: string;
  combatDisabled: boolean;
  onStartCombat: () => void;
}) {
  const m = info.meta;
  return (
    <Card
      title={`Region @ ${info.cx},${info.cy} (${info.tiles.length} tile${
        info.tiles.length === 1 ? "" : "s"
      })`}
      action={<Button onClick={onDeselect}>✕</Button>}
    >
      <div className="space-y-3">
        <Button
          variant="primary"
          onClick={onStartCombat}
          disabled={combatDisabled}
          title={
            combatDisabled
              ? "Pick or create a character on the Sheet first."
              : undefined
          }
        >
          ⚔ {combatLabel}
        </Button>
        <Field label="Label (shown above the pin)">
          <TextField
            value={m?.label ?? ""}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. Library"
          />
        </Field>
        <Field label="Type">
          <TextField
            value={m?.type ?? ""}
            onChange={(e) => onPatch({ type: e.target.value })}
            placeholder="e.g. from a Rooms table roll"
          />
        </Field>
        <Field label="Description">
          <TextArea
            rows={2}
            value={m?.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </Field>
        <Field label="Encounter">
          <TextArea
            rows={2}
            value={m?.encounter ?? ""}
            onChange={(e) => onPatch({ encounter: e.target.value })}
          />
        </Field>
        <Field label="Treasure">
          <TextArea
            rows={2}
            value={m?.treasure ?? ""}
            onChange={(e) => onPatch({ treasure: e.target.value })}
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!m?.cleared}
            onChange={(e) => onPatch({ cleared: e.target.checked })}
            className="size-4"
          />
          Cleared (greys out the pin)
        </label>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function RollPanel({
  lastRoll,
  exitRoll,
  targetTiles,
  onRoom,
  onExits,
  onUseAsTarget,
  onClearTarget,
}: {
  lastRoll: RoomRoll | null;
  exitRoll: number | null;
  targetTiles: number | null;
  onRoom: (primary: number, secondary: number) => void;
  onExits: (roll: number) => void;
  onUseAsTarget: () => void;
  onClearTarget: () => void;
}) {
  const [primary, setPrimary] = useState(3);
  const [secondary, setSecondary] = useState(4);
  const exits = exitRoll === null ? null : exitsFromD6(exitRoll);
  return (
    <Card title="Room roll (D66 + exits)">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Primary (X)">
            <NumberField
              min={1}
              max={6}
              value={primary}
              onChange={(e) =>
                setPrimary(clamp(Number(e.target.value) || 1, 1, 6))
              }
              className="w-16"
            />
          </Field>
          <Field label="Secondary (Y)">
            <NumberField
              min={1}
              max={6}
              value={secondary}
              onChange={(e) =>
                setSecondary(clamp(Number(e.target.value) || 1, 1, 6))
              }
              className="w-16"
            />
          </Field>
          <Button
            onClick={() => {
              const p = rollD6();
              const s = rollD6();
              setPrimary(p);
              setSecondary(s);
              onRoom(p, s);
            }}
            title="Roll both digital dice"
          >
            🎲 Roll
          </Button>
          <Button variant="primary" onClick={() => onRoom(primary, secondary)}>
            Apply
          </Button>
        </div>

        {lastRoll && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-base font-semibold">
                {lastRoll.primary} × {lastRoll.secondary} = {lastRoll.tiles}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${kindClass(lastRoll.kind)}`}
              >
                {lastRoll.kind}
              </span>
              {lastRoll.double && (
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                  double — re-roll &amp; add
                </span>
              )}
            </div>
            <p className="mt-1 text-zinc-500">
              {lastRoll.kind === "corridor" &&
                "Corridor: archway exits, no encounter roll, not a small room."}
              {lastRoll.kind === "small" &&
                "Small room (≤6): all exits archways. Roll on the level’s SR table."}
              {lastRoll.kind === "large" &&
                "Large room (≥32): roll on the level’s LR table."}
              {lastRoll.kind === "regular" &&
                "Regular room: roll on the level’s rooms table."}
            </p>
            <div className="mt-2 flex gap-2">
              <Button onClick={onUseAsTarget} disabled={targetTiles === lastRoll.tiles}>
                {targetTiles === lastRoll.tiles
                  ? "✓ HUD target"
                  : "Use as HUD target"}
              </Button>
              {targetTiles !== null && (
                <Button onClick={onClearTarget}>Clear target</Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Exits (D6)
          </span>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onExits(n)}
              className={`size-7 rounded-md border text-sm font-mono ${
                exitRoll === n
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {n}
            </button>
          ))}
          <Button onClick={() => onExits(rollD6())}>🎲</Button>
          {exits !== null && (
            <span className="text-xs">
              → <strong>{exits}</strong> exit{exits === 1 ? "" : "s"} (max 3 plus
              entry)
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function kindClass(kind: RoomRoll["kind"]): string {
  switch (kind) {
    case "corridor":
      return "bg-sky-200 text-sky-900 dark:bg-sky-800 dark:text-sky-100";
    case "small":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    case "large":
      return "bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100";
    case "regular":
      return "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100";
  }
}
