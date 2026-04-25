import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useMaps } from "@/hooks/useMaps";
import { Button, Card, Field, NumberField, TextArea, TextField } from "@/components/ui";
import type {
  ExitSide,
  ExitType,
  MapDoc,
  MapExit,
  Room,
} from "@/types/map";

const CELL = 24; // pixels per grid cell at 100% zoom
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.15;

type Tool = "select" | "room" | "exit" | "erase";

// Drag-to-create a new room (used by + Room tool).
interface CreateDrag {
  kind: "create";
  startCx: number;
  startCy: number;
  endCx: number;
  endCy: number;
}

// Drag a selected room around (used by Select tool).
interface MoveDrag {
  kind: "move";
  roomId: string;
  startCx: number;
  startCy: number;
  origX: number;
  origY: number;
}

type Drag = CreateDrag | MoveDrag;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export default function MapView() {
  const { maps, active, create, update, remove, setActive } = useMaps();

  return (
    <section className="mx-auto max-w-7xl space-y-4">
      <Card>
        <MapSwitcher
          maps={maps}
          active={active}
          onSelect={setActive}
          onCreate={() => create()}
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
            No map yet. Click <strong>+ New map</strong> to start charting a
            dungeon level.
          </p>
        </Card>
      ) : (
        <MapEditor map={active} onUpdate={(patch) => update(active.id, patch)} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function MapSwitcher({
  maps,
  active,
  onSelect,
  onCreate,
  onDelete,
}: {
  maps: MapDoc[];
  active: MapDoc | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: () => void;
}) {
  const selectId = useId();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grow">
        <label
          htmlFor={selectId}
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Active Map
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
              {m.name} — Level {m.level} · {m.ancestry}
            </option>
          ))}
        </select>
      </div>
      <Button variant="primary" onClick={onCreate}>
        + New map
      </Button>
      <Button variant="danger" onClick={onDelete} disabled={!active}>
        Delete
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapEditor({
  map,
  onUpdate,
}: {
  map: MapDoc;
  onUpdate: (patch: Partial<MapDoc>) => void;
}) {
  const [tool, setTool] = useState<Tool>("room");
  const [exitType, setExitType] = useState<ExitType>("door");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ctrl/Cmd + wheel zooms anchored at the cursor; plain wheel scrolls the
  // container as normal. Registered via addEventListener so we can mark it
  // non-passive (React's onWheel is passive by default and preventDefault
  // would be a no-op).
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
    // zoomAtCursor closes over `scale` via the setter callback; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomAtCursor(cursorX: number, cursorY: number, factor: number) {
    const container = containerRef.current;
    if (!container) return;
    setScale((prev) => {
      const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
      if (next === prev) return prev;
      const ratio = next / prev;
      // Keep the world point under the cursor stationary.
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

  // Keep selection valid if the underlying room list changes.
  const selectedRoom = selectedRoomId
    ? map.rooms.find((r) => r.id === selectedRoomId) ?? null
    : null;

  function clientToLocal(e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function clientToCell(e: ReactPointerEvent<SVGSVGElement>): { cx: number; cy: number } | null {
    const local = clientToLocal(e);
    if (!local) return null;
    return { cx: Math.floor(local.x / CELL), cy: Math.floor(local.y / CELL) };
  }

  function closestEdge(localX: number, localY: number, cx: number, cy: number): ExitSide {
    const relX = localX - cx * CELL;
    const relY = localY - cy * CELL;
    const distN = relY;
    const distS = CELL - relY;
    const distW = relX;
    const distE = CELL - relX;
    const min = Math.min(distN, distS, distW, distE);
    if (min === distN) return "n";
    if (min === distS) return "s";
    if (min === distW) return "w";
    return "e";
  }

  function findRoomAt(cx: number, cy: number): Room | null {
    for (let i = map.rooms.length - 1; i >= 0; i--) {
      const r = map.rooms[i];
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) {
        return r;
      }
    }
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const local = clientToLocal(e);
    if (!local) return;
    const cell = { cx: Math.floor(local.x / CELL), cy: Math.floor(local.y / CELL) };
    if (!inBounds(cell.cx, cell.cy, map)) return;

    if (tool === "room") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: "create",
        startCx: cell.cx,
        startCy: cell.cy,
        endCx: cell.cx,
        endCy: cell.cy,
      });
      return;
    }

    if (tool === "select") {
      const room = findRoomAt(cell.cx, cell.cy);
      setSelectedRoomId(room?.id ?? null);
      if (room) {
        // Set up a potential move drag — actual movement only kicks in on
        // pointer-move past the first cell boundary.
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({
          kind: "move",
          roomId: room.id,
          startCx: cell.cx,
          startCy: cell.cy,
          origX: room.x,
          origY: room.y,
        });
      }
      return;
    }

    if (tool === "erase") {
      const room = findRoomAt(cell.cx, cell.cy);
      if (room) {
        onUpdate({ rooms: map.rooms.filter((r) => r.id !== room.id) });
        if (selectedRoomId === room.id) setSelectedRoomId(null);
      }
      // Also erase any exit on the clicked cell's nearest edge.
      const side = closestEdge(local.x, local.y, cell.cx, cell.cy);
      const exit = map.exits.find(
        (x) => x.x === cell.cx && x.y === cell.cy && x.side === side,
      );
      if (exit) onUpdate({ exits: map.exits.filter((x) => x.id !== exit.id) });
      return;
    }

    if (tool === "exit") {
      const side = closestEdge(local.x, local.y, cell.cx, cell.cy);
      // Toggle: if an exit already exists on this edge, remove it.
      const existing = map.exits.find(
        (x) => x.x === cell.cx && x.y === cell.cy && x.side === side,
      );
      if (existing) {
        onUpdate({ exits: map.exits.filter((x) => x.id !== existing.id) });
      } else {
        const exit: MapExit = {
          id: makeId("ex"),
          x: cell.cx,
          y: cell.cy,
          side,
          type: exitType,
        };
        onUpdate({ exits: [...map.exits, exit] });
      }
      return;
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const cell = clientToCell(e);
    if (!cell) return;

    if (drag.kind === "create") {
      if (!inBounds(cell.cx, cell.cy, map)) return;
      if (cell.cx === drag.endCx && cell.cy === drag.endCy) return;
      setDrag({ ...drag, endCx: cell.cx, endCy: cell.cy });
      return;
    }

    if (drag.kind === "move") {
      const room = map.rooms.find((r) => r.id === drag.roomId);
      if (!room) return;
      const dx = cell.cx - drag.startCx;
      const dy = cell.cy - drag.startCy;
      if (dx === 0 && dy === 0) return;
      const newX = clamp(drag.origX + dx, 0, map.width - room.w);
      const newY = clamp(drag.origY + dy, 0, map.height - room.h);
      if (newX === room.x && newY === room.y) return;
      onUpdate({
        rooms: map.rooms.map((r) =>
          r.id === drag.roomId ? { ...r, x: newX, y: newY } : r,
        ),
      });
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.kind === "create") {
      const x = Math.min(drag.startCx, drag.endCx);
      const y = Math.min(drag.startCy, drag.endCy);
      const w = Math.abs(drag.endCx - drag.startCx) + 1;
      const h = Math.abs(drag.endCy - drag.startCy) + 1;
      const room: Room = { id: makeId("rm"), x, y, w, h };
      onUpdate({ rooms: [...map.rooms, room] });
      setSelectedRoomId(room.id);
    }
    setDrag(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Card>
        <header className="mb-3 grid gap-2 sm:grid-cols-[1fr_6rem_8rem]">
          <Field label="Name">
            <TextField value={map.name} onChange={(e) => onUpdate({ name: e.target.value })} />
          </Field>
          <Field label="Level">
            <NumberField
              min={1}
              max={10}
              value={map.level}
              onChange={(e) => onUpdate({ level: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label="Ancestry">
            <TextField
              value={map.ancestry}
              onChange={(e) => onUpdate({ ancestry: e.target.value })}
            />
          </Field>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <ToolPalette tool={tool} onTool={setTool} exitType={exitType} onExitType={setExitType} />
          <div className="ml-auto flex items-center gap-1">
            <Button onClick={() => zoomBy(1 / ZOOM_STEP)} title="Zoom out">−</Button>
            <button
              type="button"
              onClick={zoomReset}
              title="Reset zoom"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-800"
            >
              {Math.round(scale * 100)}%
            </button>
            <Button onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">+</Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="mt-3 max-h-[70vh] overflow-auto rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <svg
            ref={svgRef}
            width={map.width * CELL}
            height={map.height * CELL}
            viewBox={`0 0 ${map.width * CELL} ${map.height * CELL}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={`block ${cursorFor(tool)} touch-none`}
            style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}
          >
            <defs>
              <pattern id="grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-zinc-300 dark:text-zinc-700"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Rooms */}
            {map.rooms.map((r) => (
              <RoomShape
                key={r.id}
                room={r}
                selected={r.id === selectedRoomId}
              />
            ))}

            {/* Drag preview while creating a room */}
            {drag?.kind === "create" && <DragPreview drag={drag} />}

            {/* Exits — drawn after rooms so they overlay the room border */}
            {map.exits.map((x) => (
              <ExitShape key={x.id} exit={x} />
            ))}
          </svg>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {map.rooms.length} room{map.rooms.length === 1 ? "" : "s"} · {map.exits.length} exit
          {map.exits.length === 1 ? "" : "s"} · grid {map.width}×{map.height} · zoom{" "}
          {Math.round(scale * 100)}% · <kbd className="font-mono">Ctrl/⌘ + wheel</kbd> to zoom
        </p>
      </Card>

      <RoomDetailPanel
        room={selectedRoom}
        gridWidth={map.width}
        gridHeight={map.height}
        onPatch={(patch) => {
          if (!selectedRoom) return;
          onUpdate({
            rooms: map.rooms.map((r) =>
              r.id === selectedRoom.id ? { ...r, ...patch } : r,
            ),
          });
        }}
        onDeselect={() => setSelectedRoomId(null)}
      />
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
    { id: "select", label: "Select", hint: "Click a room to edit it." },
    { id: "room", label: "+ Room", hint: "Click-drag to draw a rectangular room." },
    { id: "exit", label: "+ Exit", hint: "Click a cell edge to add (or toggle off) a door." },
    { id: "erase", label: "Erase", hint: "Click a room or exit to remove it." },
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
        <span className="ml-2 inline-flex items-center gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Type</span>
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
      <span className="ml-auto text-xs text-zinc-500">
        {tools.find((t) => t.id === tool)?.hint}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoomShape({ room, selected }: { room: Room; selected: boolean }) {
  const x = room.x * CELL;
  const y = room.y * CELL;
  const w = room.w * CELL;
  const h = room.h * CELL;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        className={
          selected
            ? "fill-emerald-200/70 stroke-emerald-700 dark:fill-emerald-900/40 dark:stroke-emerald-400"
            : room.cleared
              ? "fill-zinc-300/60 stroke-zinc-500 dark:fill-zinc-700/50 dark:stroke-zinc-400"
              : "fill-amber-100/80 stroke-amber-700 dark:fill-amber-900/30 dark:stroke-amber-500"
        }
        strokeWidth={selected ? 3 : 2}
      />
      {(room.label || room.type) && (
        <text
          x={x + w / 2}
          y={y + h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none fill-zinc-900 text-xs font-semibold dark:fill-zinc-100"
        >
          {room.label ?? room.type}
        </text>
      )}
    </g>
  );
}

function DragPreview({ drag }: { drag: CreateDrag }) {
  const x = Math.min(drag.startCx, drag.endCx) * CELL;
  const y = Math.min(drag.startCy, drag.endCy) * CELL;
  const w = (Math.abs(drag.endCx - drag.startCx) + 1) * CELL;
  const h = (Math.abs(drag.endCy - drag.startCy) + 1) * CELL;
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      className="fill-emerald-300/40 stroke-emerald-600 dark:fill-emerald-700/30 dark:stroke-emerald-400"
      strokeWidth={2}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}

function ExitShape({ exit }: { exit: MapExit }) {
  const x = exit.x * CELL;
  const y = exit.y * CELL;
  const pad = CELL * 0.25;
  let x1 = x;
  let y1 = y;
  let x2 = x;
  let y2 = y;
  switch (exit.side) {
    case "n":
      x1 = x + pad; y1 = y; x2 = x + CELL - pad; y2 = y;
      break;
    case "s":
      x1 = x + pad; y1 = y + CELL; x2 = x + CELL - pad; y2 = y + CELL;
      break;
    case "w":
      x1 = x; y1 = y + pad; x2 = x; y2 = y + CELL - pad;
      break;
    case "e":
      x1 = x + CELL; y1 = y + pad; x2 = x + CELL; y2 = y + CELL - pad;
      break;
  }
  const stroke = exitColour(exit.type);
  const dash = exit.type === "secret" ? "2 2" : exit.type === "portcullis" ? "4 2" : undefined;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={5}
      strokeLinecap="square"
      strokeDasharray={dash}
    />
  );
}

function exitColour(type: ExitType): string {
  switch (type) {
    case "door":
      return "#92400e"; // amber-800
    case "open":
      return "#52525b"; // zinc-600
    case "stone":
      return "#3f3f46"; // zinc-700
    case "portcullis":
      return "#1f2937"; // gray-800
    case "magical":
      return "#a855f7"; // purple-500
    case "secret":
      return "#dc2626"; // red-600
    default:
      return "#92400e";
  }
}

function cursorFor(tool: Tool): string {
  switch (tool) {
    case "select": return "cursor-pointer";
    case "room": return "cursor-crosshair";
    case "exit": return "cursor-cell";
    case "erase": return "cursor-not-allowed";
  }
}

// ---------------------------------------------------------------------------

function RoomDetailPanel({
  room,
  gridWidth,
  gridHeight,
  onPatch,
  onDeselect,
}: {
  room: Room | null;
  gridWidth: number;
  gridHeight: number;
  onPatch: (patch: Partial<Room>) => void;
  onDeselect: () => void;
}) {
  if (!room) {
    return (
      <Card title="Room">
        <p className="text-sm text-zinc-500">
          Select a room to edit its label, type, encounter and treasure. In{" "}
          <strong>Select</strong> mode you can also <em>drag a room</em> to
          move it. Use <strong>+ Room</strong> to draw new ones.
        </p>
      </Card>
    );
  }
  // Patches that respect grid bounds — keeps the room rectangle inside the
  // map. W/H clamp so the right/bottom edge doesn't fall off; X/Y clamp so
  // the top-left doesn't either.
  function patchPosition(field: "x" | "y", value: number) {
    if (field === "x") onPatch({ x: clamp(value, 0, gridWidth - room!.w) });
    else onPatch({ y: clamp(value, 0, gridHeight - room!.h) });
  }
  function patchSize(field: "w" | "h", value: number) {
    if (field === "w") onPatch({ w: clamp(value, 1, gridWidth - room!.x) });
    else onPatch({ h: clamp(value, 1, gridHeight - room!.y) });
  }
  return (
    <Card
      title={`Room ${room.x},${room.y} (${room.w}×${room.h})`}
      action={<Button onClick={onDeselect}>✕</Button>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <Field label="X">
            <NumberField
              min={0}
              max={gridWidth - room.w}
              value={room.x}
              onChange={(e) => patchPosition("x", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Y">
            <NumberField
              min={0}
              max={gridHeight - room.h}
              value={room.y}
              onChange={(e) => patchPosition("y", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="W">
            <NumberField
              min={1}
              max={gridWidth - room.x}
              value={room.w}
              onChange={(e) => patchSize("w", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="H">
            <NumberField
              min={1}
              max={gridHeight - room.y}
              value={room.h}
              onChange={(e) => patchSize("h", Number(e.target.value) || 1)}
            />
          </Field>
        </div>
        <Field label="Label (shown in the room)">
          <TextField
            value={room.label ?? ""}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. Library"
          />
        </Field>
        <Field label="Type">
          <TextField
            value={room.type ?? ""}
            onChange={(e) => onPatch({ type: e.target.value })}
            placeholder="e.g. from a Rooms table roll"
          />
        </Field>
        <Field label="Description">
          <TextArea
            rows={2}
            value={room.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </Field>
        <Field label="Encounter">
          <TextArea
            rows={2}
            value={room.encounter ?? ""}
            onChange={(e) => onPatch({ encounter: e.target.value })}
          />
        </Field>
        <Field label="Treasure">
          <TextArea
            rows={2}
            value={room.treasure ?? ""}
            onChange={(e) => onPatch({ treasure: e.target.value })}
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!room.cleared}
            onChange={(e) => onPatch({ cleared: e.target.checked })}
            className="size-4"
          />
          Cleared (greys out the room)
        </label>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function inBounds(cx: number, cy: number, map: MapDoc): boolean {
  return cx >= 0 && cy >= 0 && cx < map.width && cy < map.height;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

