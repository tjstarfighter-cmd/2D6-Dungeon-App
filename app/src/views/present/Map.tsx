import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { useMapsV2 } from "@/hooks/useMapsV2";
import {
  detectRegions,
  regionCentroidTile,
  tilesHash,
} from "@/lib/mapv2";
import { wallSetFromList, type MapDocV2 } from "@/types/mapv2";
import type { ExitType } from "@/types/map";

const CELL = 24;

/**
 * Full-bleed presenter render of a saved Map (v2 dot-grid model).
 * No editing chrome. Auto-fits via SVG viewBox + preserveAspectRatio.
 * Updates live as the editor changes the map (shared external store).
 */
export default function PresentMap() {
  const { id } = useParams();
  const { maps } = useMapsV2();
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

  const exitCount = map.walls.reduce((n, w) => (w.exit ? n + 1 : n), 0);

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-sm">
        <div>
          <span className="font-semibold">{map.name}</span>
          <span className="ml-3 text-zinc-500">
            Level {map.level} · {map.ancestry} · {map.gridW}×{map.gridH} ·{" "}
            {map.regions.length} room note{map.regions.length === 1 ? "" : "s"}{" "}
            · {exitCount} exit{exitCount === 1 ? "" : "s"}
          </span>
        </div>
        <Link to="/present" className="text-xs text-zinc-400 underline">
          ← index
        </Link>
      </header>
      <div className="grow p-4">
        <svg
          viewBox={`-${CELL / 2} -${CELL / 2} ${(map.gridW + 1) * CELL} ${
            (map.gridH + 1) * CELL
          }`}
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
// Read-only render of v2 map contents. Kept inline (vs. shared component) so
// the editor and presenter can evolve their visuals independently.

function MapSvgContents({ map }: { map: MapDocV2 }) {
  const wallSet = useMemo(() => wallSetFromList(map.walls), [map.walls]);
  const regions = useMemo(
    () => detectRegions(wallSet, map.gridW, map.gridH),
    [wallSet, map.gridW, map.gridH],
  );
  const metaByHash = useMemo(() => {
    const m = new Map<string, (typeof map.regions)[number]>();
    for (const r of map.regions) m.set(r.tilesHash, r);
    return m;
  }, [map.regions]);

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
        x={-CELL / 2}
        y={-CELL / 2}
        width={(map.gridW + 1) * CELL}
        height={(map.gridH + 1) * CELL}
        fill="url(#present-grid)"
      />

      {/* Region tints — amber for active rooms, grey for cleared. */}
      {regions.regions.map((tiles, i) => {
        const hash = tilesHash(tiles);
        const meta = metaByHash.get(hash);
        const cleared = !!meta?.cleared;
        return (
          <g key={`r${i}`}>
            {tiles.map(([cx, cy]) => (
              <rect
                key={`${cx},${cy}`}
                x={cx * CELL}
                y={cy * CELL}
                width={CELL}
                height={CELL}
                fill={cleared ? "#52525b" : "#fbbf24"}
                fillOpacity={cleared ? 0.35 : 0.65}
              />
            ))}
          </g>
        );
      })}

      {/* Walls. */}
      {map.walls.map((w, i) => (
        <line
          key={`w${i}`}
          x1={w.ax * CELL}
          y1={w.ay * CELL}
          x2={w.bx * CELL}
          y2={w.by * CELL}
          stroke="#fcd34d"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}

      {/* Exits — colored glyph at wall midpoint. */}
      {map.walls.map((w, i) => {
        if (!w.exit) return null;
        const mx = ((w.ax + w.bx) / 2) * CELL;
        const my = ((w.ay + w.by) / 2) * CELL;
        const horizontal = w.ay === w.by;
        const stroke = exitColour(w.exit.type);
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
          <g key={`e${i}`}>
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
            <circle cx={mx} cy={my} r={3} fill={stroke} />
          </g>
        );
      })}

      {/* Region labels — at the centroid tile, big enough to read in a video. */}
      {regions.regions.map((tiles, i) => {
        const hash = tilesHash(tiles);
        const meta = metaByHash.get(hash);
        const label = meta?.label || meta?.type;
        if (!label) return null;
        const [cx, cy] = regionCentroidTile(tiles);
        const x = (cx + 0.5) * CELL;
        const y = (cy + 0.5) * CELL;
        return (
          <g key={`l${i}`} pointerEvents="none">
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#18181b"
              stroke="#fde68a"
              strokeWidth={3}
              paintOrder="stroke"
              fontWeight={700}
              fontSize={Math.min(CELL * 0.7, 16)}
            >
              {label}
            </text>
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#18181b"
              fontWeight={700}
              fontSize={Math.min(CELL * 0.7, 16)}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

function exitColour(type: ExitType): string {
  switch (type) {
    case "door":
      return "#fcd34d"; // amber-300, bright on dark
    case "open":
      return "#a1a1aa";
    case "stone":
      return "#d4d4d8";
    case "portcullis":
      return "#e4e4e7";
    case "magical":
      return "#c084fc";
    case "secret":
      return "#f87171";
    default:
      return "#fcd34d";
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
