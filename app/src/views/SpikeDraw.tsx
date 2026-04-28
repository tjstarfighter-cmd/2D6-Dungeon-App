import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";

const GRID_W = 20;
const GRID_H = 20;
const CELL = 24;
const SNAP_RADIUS = 0.45;
const ERASE_RADIUS = 0.55; // grid units; tap-near-a-wall counts as erase

type Dot = { x: number; y: number };
type WallKey = string;
type Mode = "draw" | "erase";

function wallKey(a: Dot, b: Dot): WallKey {
  const [p, q] =
    a.y < b.y || (a.y === b.y && a.x <= b.x) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}

function parseWall(key: WallKey): [Dot, Dot] {
  const [p, q] = key.split("-");
  const [px, py] = p.split(",").map(Number);
  const [qx, qy] = q.split(",").map(Number);
  return [{ x: px, y: py }, { x: qx, y: qy }];
}

type UndoOp = { key: WallKey; op: "add" | "remove" };

export default function SpikeDraw() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [walls, setWalls] = useState<Set<WallKey>>(() => new Set());
  const [mode, setMode] = useState<Mode>("draw");
  const undoStack = useRef<UndoOp[]>([]);
  const stroke = useRef<{
    lastDot: Dot | null;
    active: boolean;
  } | null>(null);

  const dots = useMemo(() => {
    const out: Dot[] = [];
    for (let y = 0; y <= GRID_H; y++) {
      for (let x = 0; x <= GRID_W; x++) out.push({ x, y });
    }
    return out;
  }, []);

  const regions = useMemo(() => detectRegions(walls), [walls]);

  function clientToWorld(e: ReactPointerEvent<SVGSVGElement>): { gx: number; gy: number } | null {
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

  function snapToDot(gx: number, gy: number): Dot | null {
    const sx = Math.round(gx);
    const sy = Math.round(gy);
    if (sx < 0 || sx > GRID_W || sy < 0 || sy > GRID_H) return null;
    if (Math.hypot(gx - sx, gy - sy) > SNAP_RADIUS) return null;
    return { x: sx, y: sy };
  }

  function addWall(key: WallKey) {
    setWalls((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    undoStack.current.push({ key, op: "add" });
  }

  function removeWall(key: WallKey) {
    setWalls((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    undoStack.current.push({ key, op: "remove" });
  }

  function commitDrawSegment(a: Dot, b: Dot) {
    if (a.x === b.x && a.y === b.y) return;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return;
    const key = wallKey(a, b);
    if (!walls.has(key)) addWall(key);
  }

  function walkDrawSegments(from: Dot, to: Dot) {
    let cur = { ...from };
    const stepX = Math.sign(to.x - cur.x);
    while (cur.x !== to.x) {
      const next = { x: cur.x + stepX, y: cur.y };
      commitDrawSegment(cur, next);
      cur = next;
    }
    const stepY = Math.sign(to.y - cur.y);
    while (cur.y !== to.y) {
      const next = { x: cur.x, y: cur.y + stepY };
      commitDrawSegment(cur, next);
      cur = next;
    }
  }

  function eraseAt(gx: number, gy: number) {
    // Find any wall whose midpoint is within ERASE_RADIUS and remove it.
    let bestKey: WallKey | null = null;
    let bestDist = ERASE_RADIUS;
    for (const k of walls) {
      const [a, b] = parseWall(k);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.hypot(gx - mx, gy - my);
      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }
    if (bestKey) removeWall(bestKey);
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const world = clientToWorld(e);
    if (!world) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === "draw") {
      stroke.current = { lastDot: snapToDot(world.gx, world.gy), active: true };
    } else {
      stroke.current = { lastDot: null, active: true };
      eraseAt(world.gx, world.gy);
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const s = stroke.current;
    if (!s || !s.active) return;
    const world = clientToWorld(e);
    if (!world) return;
    if (mode === "draw") {
      const dot = snapToDot(world.gx, world.gy);
      if (!dot) return;
      if (s.lastDot) walkDrawSegments(s.lastDot, dot);
      s.lastDot = dot;
    } else {
      eraseAt(world.gx, world.gy);
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    stroke.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function undo() {
    const last = undoStack.current.pop();
    if (!last) return;
    setWalls((prev) => {
      const next = new Set(prev);
      if (last.op === "add") next.delete(last.key);
      else next.add(last.key);
      return next;
    });
  }

  function clearAll() {
    setWalls(new Set());
    undoStack.current = [];
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-3 py-2 text-xs">
        <span className="font-semibold">/spike/draw</span>
        <span className="text-zinc-500">
          {GRID_W}×{GRID_H} · regions: {regions.regions.length} · largest:{" "}
          {regions.largest} tiles · walls: {walls.size}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("draw")}
            className={`rounded px-2 py-1 ${
              mode === "draw"
                ? "bg-amber-400 text-zinc-900"
                : "border border-zinc-700 text-zinc-300"
            }`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setMode("erase")}
            className={`rounded px-2 py-1 ${
              mode === "erase"
                ? "bg-amber-400 text-zinc-900"
                : "border border-zinc-700 text-zinc-300"
            }`}
          >
            Erase
          </button>
          <button
            type="button"
            onClick={undo}
            className="rounded border border-zinc-700 px-2 py-1 text-zinc-300"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded border border-zinc-700 px-2 py-1 text-zinc-300"
          >
            Clear
          </button>
          <Link to="/" className="text-zinc-400 underline">
            ← app
          </Link>
        </div>
      </header>
      <div className="grow touch-none p-2">
        <svg
          ref={svgRef}
          viewBox={`-${CELL / 2} -${CELL / 2} ${(GRID_W + 1) * CELL} ${(GRID_H + 1) * CELL}`}
          preserveAspectRatio="xMidYMid meet"
          className="size-full select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {regions.regions.map((cells, i) => (
            <g key={i}>
              {cells.map(([cx, cy]) => (
                <rect
                  key={`${cx},${cy}`}
                  x={cx * CELL}
                  y={cy * CELL}
                  width={CELL}
                  height={CELL}
                  fill={`hsl(${(i * 67) % 360} 70% 55% / 0.35)`}
                />
              ))}
            </g>
          ))}
          {dots.map((d) => (
            <circle
              key={`${d.x},${d.y}`}
              cx={d.x * CELL}
              cy={d.y * CELL}
              r={2}
              fill="#52525b"
            />
          ))}
          {[...walls].map((k) => {
            const [a, b] = parseWall(k);
            return (
              <line
                key={k}
                x1={a.x * CELL}
                y1={a.y * CELL}
                x2={b.x * CELL}
                y2={b.y * CELL}
                stroke="#fbbf24"
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
    </main>
  );
}

// Flood-fill from a virtual "outside" node. Cells unreachable from outside are
// enclosed, and each connected enclosed component is a region.
function detectRegions(walls: Set<WallKey>): {
  regions: Array<Array<[number, number]>>;
  largest: number;
} {
  const blocked = (cx: number, cy: number, dx: number, dy: number): boolean => {
    // east edge of (cx,cy) = wall (cx+1,cy)-(cx+1,cy+1)
    // south edge of (cx,cy) = wall (cx,cy+1)-(cx+1,cy+1)
    let a: Dot;
    let b: Dot;
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
    return walls.has(wallKey(a, b));
  };

  const inBounds = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H;

  // BFS from outside: start with any out-of-bounds cell adjacent to an in-bounds
  // cell whose connecting boundary wall is missing.
  const outside = new Set<string>();
  const queue: Array<[number, number]> = [];
  const seedKey = (cx: number, cy: number) => `${cx},${cy}`;

  // Seed by walking the perimeter — for each boundary cell, if no boundary wall,
  // it's reachable from outside.
  for (let cx = 0; cx < GRID_W; cx++) {
    if (!blocked(cx, 0, 0, -1)) {
      const k = seedKey(cx, 0);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([cx, 0]);
      }
    }
    if (!blocked(cx, GRID_H - 1, 0, 1)) {
      const k = seedKey(cx, GRID_H - 1);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([cx, GRID_H - 1]);
      }
    }
  }
  for (let cy = 0; cy < GRID_H; cy++) {
    if (!blocked(0, cy, -1, 0)) {
      const k = seedKey(0, cy);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([0, cy]);
      }
    }
    if (!blocked(GRID_W - 1, cy, 1, 0)) {
      const k = seedKey(GRID_W - 1, cy);
      if (!outside.has(k)) {
        outside.add(k);
        queue.push([GRID_W - 1, cy]);
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

  // Remaining in-bounds cells are enclosed; group them into connected components.
  const visited = new Set<string>(outside);
  const regions: Array<Array<[number, number]>> = [];
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
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
