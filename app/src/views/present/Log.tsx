import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import { NotFound } from "@/views/present/Map";

// Story 7.5 — chrome-less per-pin log presenter. Reads the same notes
// store the in-app Log surface uses; auto-scrolls to the newest entry
// whenever the storage event fires.

const SENTINELS = new Set(["", "unattributed", "none"]);

export default function PresentLog() {
  const { mapId, pinId } = useParams();
  const { maps } = useMapsV2();
  const { notesForRegion } = useNotes();

  // Idle: no pin yet (or sentinel like "unattributed"). UX-DR41 +
  // NFR11 — non-blank instructional text.
  if (!pinId || SENTINELS.has(pinId.toLowerCase())) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="text-xl font-semibold text-zinc-300">
            Pin a room to start logging
          </div>
          <Link
            to="/present"
            className="mt-3 inline-block text-xs text-zinc-500 underline"
          >
            ← presenter index
          </Link>
        </div>
      </main>
    );
  }

  const map = maps.find((m) => m.id === mapId);
  const region = map?.regions.find((r) => r.tilesHash === pinId);

  if (!map || !region || !region.kind || typeof region.number !== "number") {
    return (
      <NotFound title="Pin not found">
        Maps and pins live in this browser's localStorage. The combination
        of map id + pin id wasn't recognised — verify the URL or open the
        Map editor in the main app.
      </NotFound>
    );
  }

  const kindWord = region.kind === "room" ? "Room" : "Hall";
  const entries = notesForRegion(pinId);
  const headerLabel = region.label ? ` — ${region.label}` : "";

  return (
    <main className="fixed inset-0 flex flex-col gap-3 bg-zinc-950 p-6 text-zinc-100">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-2">
        <div>
          <h1 className="text-2xl font-bold">
            {kindWord} {region.number}
            {headerLabel}
          </h1>
          <div className="text-xs text-zinc-500">
            {map.name} · Lvl {map.level} · {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
          </div>
        </div>
        <Link to="/present" className="text-xs text-zinc-500 underline">
          ← index
        </Link>
      </header>
      <ScrollList entries={entries} />
    </main>
  );
}

function ScrollList({
  entries,
}: {
  entries: ReturnType<ReturnType<typeof useNotes>["notesForRegion"]>;
}) {
  // Auto-scroll to the newest entry whenever the list grows. The ref
  // sits on a sentinel below the entries so smooth scroll lands on the
  // bottom even when the list is already filling the viewport.
  const tailRef = useRef<HTMLDivElement | null>(null);
  // Watch the latest entry's id (rather than the array reference) so a
  // re-fetch that returns a same-length list with new tail data still
  // triggers the auto-scroll. Extract to a local so the dep is a
  // simple identifier per react-hooks/exhaustive-deps.
  const lastId = entries[entries.length - 1]?.id ?? "";
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, lastId]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No log entries yet for this pin.
      </p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <ul className="space-y-2">
        {entries.map((n) => {
          const pending = n.state === "pending";
          return (
            <li
              key={n.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                pending
                  ? "border-zinc-800 bg-zinc-900/60 text-zinc-400 opacity-60"
                  : "border-zinc-700 bg-zinc-900 text-zinc-100"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-zinc-300">
                  {n.entryType}
                </span>
                {pending && (
                  <span className="rounded bg-amber-900 px-1.5 py-0.5 font-medium text-amber-200">
                    pending
                  </span>
                )}
                {n.tableRef && (
                  <span className="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-emerald-200">
                    {n.tableRef}
                  </span>
                )}
                <time className="ml-auto font-mono text-[10px] text-zinc-500">
                  {new Date(n.createdAt).toLocaleTimeString()}
                </time>
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
              {n.state === "resolved" && n.resolvedValue && (
                <div className="mt-1 text-xs text-zinc-500">
                  → {n.resolvedValue}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={tailRef} />
    </div>
  );
}
