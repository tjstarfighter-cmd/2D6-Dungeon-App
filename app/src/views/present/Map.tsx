import { Link, useParams } from "react-router-dom";

import { useMaps } from "@/hooks/useMaps";
import type { ExitType, MapDoc, MapExit, Room } from "@/types/map";

const CELL = 24;

/**
 * Full-bleed presenter render of a saved Map. No editing chrome.
 * Auto-fits the map to the viewport via SVG viewBox + preserveAspectRatio.
 * Updates live as the editor changes the map (shared external store).
 */
export default function PresentMap() {
  const { id } = useParams();
  const { maps } = useMaps();
  const map = maps.find((m) => m.id === id);

  if (!map) {
    return (
      <NotFound title="Map not found">
        Maps are stored in this browser's localStorage. If you're opening
        this URL in OBS or a different browser session, the map id won't be
        recognised. Open the Map editor and create or import a map first.
      </NotFound>
    );
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-sm">
        <div>
          <span className="font-semibold">{map.name}</span>
          <span className="ml-3 text-zinc-500">
            Level {map.level} · {map.ancestry} · {map.rooms.length} rooms ·{" "}
            {map.exits.length} exits
          </span>
        </div>
        <Link to="/present" className="text-xs text-zinc-400 underline">
          ← index
        </Link>
      </header>
      <div className="grow p-4">
        <svg
          viewBox={`0 0 ${map.width * CELL} ${map.height * CELL}`}
          preserveAspectRatio="xMidYMid meet"
          className="size-full"
        >
          <MapSvgContents map={map} />
        </svg>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Read-only render of map contents. Kept inline (vs. shared component) so
// the editor and presenter can evolve their visuals independently.

function MapSvgContents({ map }: { map: MapDoc }) {
  return (
    <>
      <defs>
        <pattern
          id="present-grid"
          width={CELL}
          height={CELL}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
            fill="none"
            stroke="#3f3f46"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect
        width={map.width * CELL}
        height={map.height * CELL}
        fill="url(#present-grid)"
      />
      {map.rooms.map((r) => (
        <RoomShape key={r.id} room={r} />
      ))}
      {map.exits.map((x) => (
        <ExitShape key={x.id} exit={x} />
      ))}
    </>
  );
}

function RoomShape({ room }: { room: Room }) {
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
        // Bright fills against the dark background read well in video.
        fill={room.cleared ? "#3f3f46" : "#fbbf24"}
        fillOpacity={room.cleared ? 0.5 : 0.85}
        stroke={room.cleared ? "#71717a" : "#b45309"}
        strokeWidth={2}
      />
      {(room.label || room.type) && (
        <text
          x={x + w / 2}
          y={y + h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#18181b"
          fontWeight={700}
          fontSize={Math.min(CELL * 0.7, 14)}
          className="select-none"
        >
          {room.label ?? room.type}
        </text>
      )}
    </g>
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
    case "n": x1 = x + pad; y1 = y; x2 = x + CELL - pad; y2 = y; break;
    case "s": x1 = x + pad; y1 = y + CELL; x2 = x + CELL - pad; y2 = y + CELL; break;
    case "w": x1 = x; y1 = y + pad; x2 = x; y2 = y + CELL - pad; break;
    case "e": x1 = x + CELL; y1 = y + pad; x2 = x + CELL; y2 = y + CELL - pad; break;
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
      strokeWidth={6}
      strokeLinecap="square"
      strokeDasharray={dash}
    />
  );
}

function exitColour(type: ExitType): string {
  switch (type) {
    case "door": return "#fcd34d";       // amber-300, bright on dark
    case "open": return "#a1a1aa";
    case "stone": return "#d4d4d8";
    case "portcullis": return "#e4e4e7";
    case "magical": return "#c084fc";
    case "secret": return "#f87171";
    default: return "#fcd34d";
  }
}

// ---------------------------------------------------------------------------

export function NotFound({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 p-8 text-center text-zinc-100">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="max-w-prose text-sm text-zinc-400">{children}</p>
      <Link
        to="/present"
        className="mt-6 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
      >
        ← Presenter index
      </Link>
    </main>
  );
}
