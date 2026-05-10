import { useMemo, type ReactNode } from "react";

import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import { useRunEnd, type RunEndCause } from "@/components/RunEnd";
import { useShellNav } from "@/components/Shell";
import { useToast } from "@/components/Toast";
import { detectRegions, tilesHash } from "@/lib/mapv2";
import { tierFor } from "@/lib/level-up";
import { appendRunToCharacter, buildRunRecord } from "@/lib/run-archive";
import { exportRunAsPDF } from "@/lib/run-export";
import { wallSetFromList, type MapDocV2 } from "@/types/mapv2";
import type { Character } from "@/types/character";
import type { Note } from "@/types/notes";

// Story 6.10 — run-end modal. Centred overlay that aggregates run
// stats from the active character's maps + per-room logs and presents
// four next-step actions (Story 6.11 wires the action handlers; this
// story renders them as placeholders). Esc does NOT dismiss — the
// modal is a deliberate gate.
//
// Stats are computed once from the live stores; we don't persist the
// snapshot, so re-opening the modal after editing notes would reflect
// the latest state. Story 6.12's RunRecord will solidify the snapshot.

export function RunEndModal() {
  const { cause, clearRunEnd } = useRunEnd();
  const { active, update: updateChar } = useCharacters();
  const { maps } = useMapsV2();
  const { notes } = useNotes();
  const nav = useShellNav();
  const toast = useToast();

  const stats = useMemo(() => {
    if (!active) return null;
    return computeRunStats(active.id, active.xp, maps, notes);
  }, [active, maps, notes]);

  if (!cause || !active || !stats) return null;
  const tier = tierFor(active.level);

  function archive(extraPatch: Partial<Character> = {}): void {
    if (!active || !cause) return;
    const record = buildRunRecord({
      character: active,
      allMaps: maps,
      allNotes: notes,
      cause,
    });
    updateChar(active.id, {
      ...appendRunToCharacter(active, record),
      ...extraPatch,
    });
  }

  function handleViewSheet(): void {
    if (active) updateChar(active.id, { state: "dead" });
    clearRunEnd();
    nav.openSheet();
  }

  async function handleExportPdf(): Promise<void> {
    if (!active || !cause) return;
    // Synthesise a transient RunRecord for the in-progress run — this
    // is the same shape that handleSameCharacter / handleNewCharacter
    // archive, so the PDF reflects exactly what's about to land in
    // character.runs.
    const record = buildRunRecord({
      character: active,
      allMaps: maps,
      allNotes: notes,
      cause,
    });
    try {
      const result = await exportRunAsPDF({
        scope: "run",
        character: active,
        run: record,
        maps,
        notes,
      });
      toast.success({
        message:
          result.format === "pdf"
            ? `Run exported (${result.filename}).`
            : `PDF assembly hit a limit; exported as Markdown (${result.filename}).`,
      });
    } catch {
      toast.error({ message: "Export failed. Try again." });
    }
  }

  function handleSameCharacter(): void {
    if (!active) return;
    if (
      !window.confirm(
        `Reviving ${active.name} will archive this run and start fresh. Continue?`,
      )
    )
      return;
    // Reset run-scoped state. Keep equipment, level, manoeuvres, stats —
    // only HP / XP / status / pending choices reset, plus side quests
    // are marked abandoned (pre-existing completed ones stay completed).
    const sideQuests = active.sideQuests.map((q) =>
      q.status === "active" ? { ...q, status: "abandoned" as const } : q,
    );
    archive({
      hp: { ...active.hp, current: active.hp.baseline },
      xp: 0,
      status: { bloodied: 0, soaked: 0, fever: false, pneumonia: false },
      pendingLevelUps: [],
      sideQuests,
      // Story 6.13 — revival lifts read-only.
      state: "alive",
    });
    clearRunEnd();
    nav.openSheet();
  }

  function handleNewCharacter(): void {
    archive();
    clearRunEnd();
    nav.openWizard();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Run ended"
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-zinc-900/70" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/2 flex max-h-[90vh] w-[min(40rem,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <header className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {active.name}, Lvl {active.level} {tier.tier}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {causeText(cause)}
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Stat label="Levels reached" value={String(stats.levelsReached)} />
            <Stat label="Rooms entered" value={String(stats.roomsEntered)} />
            <Stat
              label="Kills total"
              value={String(stats.killsTotal)}
              detail={
                stats.killBreakdown.length > 0 ? (
                  <span>
                    {stats.killBreakdown
                      .map((k) => `${k.count}× ${k.name}`)
                      .join(" · ")}
                  </span>
                ) : null
              }
            />
            <Stat label="XP earned" value={String(stats.xp)} />
            <Stat label="Treasure" value={formatCoins(stats.treasureCoins)} />
          </dl>

          {stats.maps.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Maps explored
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.maps.map((m) => (
                  <MapThumbnail key={m.id} map={m} />
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:grid-cols-4">
          <button
            type="button"
            onClick={handleViewSheet}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            View final sheet
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Export run as PDF ↗
          </button>
          <button
            type="button"
            onClick={handleSameCharacter}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Start new run — same character
          </button>
          <button
            type="button"
            onClick={handleNewCharacter}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start new run — new character
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value}
        {detail && (
          <div className="mt-0.5 text-xs font-normal text-zinc-600 dark:text-zinc-400">
            {detail}
          </div>
        )}
      </dd>
    </div>
  );
}

function causeText(cause: RunEndCause): string {
  if (cause.kind === "combat") {
    return cause.roomLabel
      ? `Killed by ${cause.source} in ${cause.roomLabel}.`
      : `Killed by ${cause.source}.`;
  }
  return cause.roomLabel
    ? `Fell to ${cause.source} in ${cause.roomLabel}.`
    : `Fell to ${cause.source}.`;
}

// ---- Aggregation helpers --------------------------------------------------

interface RunStats {
  levelsReached: number;
  roomsEntered: number;
  killsTotal: number;
  killBreakdown: { name: string; count: number }[];
  xp: number;
  treasureCoins: { gc: number; sc: number; cc: number };
  maps: MapDocV2[];
}

function computeRunStats(
  characterId: string,
  characterXp: number,
  allMaps: MapDocV2[],
  allNotes: Note[],
): RunStats {
  const charMaps = allMaps.filter(
    (m) => !m.characterId || m.characterId === characterId,
  );
  const levelsReached = charMaps.reduce((m, x) => Math.max(m, x.level), 1);
  const roomTilesHashes = new Set<string>();
  for (const m of charMaps) {
    for (const r of m.regions) {
      if (r.kind) roomTilesHashes.add(r.tilesHash);
    }
  }
  const roomsEntered = roomTilesHashes.size;

  // Kills: resolved Combat notes whose target.id matches one of the
  // character's pinned rooms. Body lines are split on ", " — typical
  // close-summary form is "Fought 2× Goblin, Ogre — defeated."
  const killBreakdownMap = new Map<string, number>();
  for (const n of allNotes) {
    if (n.entryType !== "Combat" || n.state !== "resolved") continue;
    if (n.target?.kind !== "room") continue;
    if (!roomTilesHashes.has(n.target.id)) continue;
    for (const k of extractKills(n.body)) {
      killBreakdownMap.set(
        k.name,
        (killBreakdownMap.get(k.name) ?? 0) + k.count,
      );
    }
  }
  const killBreakdown = Array.from(killBreakdownMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const killsTotal = killBreakdown.reduce((s, k) => s + k.count, 0);

  // Treasure: scan resolved Loot entries for "Ngc / Nsc / Ncc".
  const treasureCoins = { gc: 0, sc: 0, cc: 0 };
  for (const n of allNotes) {
    if (n.entryType !== "Loot" || n.state !== "resolved") continue;
    if (n.target?.kind !== "room") continue;
    if (!roomTilesHashes.has(n.target.id)) continue;
    const c = parseCoins(n.body);
    treasureCoins.gc += c.gc;
    treasureCoins.sc += c.sc;
    treasureCoins.cc += c.cc;
  }

  return {
    levelsReached,
    roomsEntered,
    killsTotal,
    killBreakdown,
    xp: characterXp,
    treasureCoins,
    maps: charMaps,
  };
}

// "Fought 2× Goblin, Ogre — defeated." → [{name:"Goblin",count:2},{name:"Ogre",count:1}]
// Best-effort: parses "Nx Name" / "N× Name" / "Name (xN)".
const KILL_PATTERNS: ReadonlyArray<RegExp> = [
  /(\d+)\s*[×x]\s*([A-Za-z][\w '-]*)/g,
  /([A-Za-z][\w '-]+?)\s*\((\d+)\)/g,
];

function extractKills(body: string): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  for (const re of KILL_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      let count: number;
      let name: string;
      if (/^\d/.test(m[1])) {
        count = parseInt(m[1], 10);
        name = m[2];
      } else {
        name = m[1];
        count = parseInt(m[2], 10);
      }
      if (!Number.isFinite(count) || count <= 0) continue;
      out.push({ name: name.trim(), count });
    }
  }
  return out;
}

function parseCoins(body: string): { gc: number; sc: number; cc: number } {
  const out = { gc: 0, sc: 0, cc: 0 };
  const re = /(\d+)\s*(gc|sc|cc)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    out[m[2].toLowerCase() as "gc" | "sc" | "cc"] += n;
  }
  return out;
}

function formatCoins(c: { gc: number; sc: number; cc: number }): string {
  const parts: string[] = [];
  if (c.gc) parts.push(`${c.gc}gc`);
  if (c.sc) parts.push(`${c.sc}sc`);
  if (c.cc) parts.push(`${c.cc}cc`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

// ---- Map thumbnail --------------------------------------------------------

const THUMB_SIZE = 100;

function MapThumbnail({ map }: { map: MapDocV2 }) {
  const wallSet = useMemo(() => wallSetFromList(map.walls), [map.walls]);
  const detected = useMemo(
    () => detectRegions(wallSet, map.gridW, map.gridH),
    [wallSet, map.gridW, map.gridH],
  );
  const regionsByHash = useMemo(() => {
    const m = new Map<string, { tiles: [number, number][]; cleared: boolean }>();
    for (const tiles of detected.regions) {
      const hash = tilesHash(tiles);
      const meta = map.regions.find((r) => r.tilesHash === hash);
      m.set(hash, { tiles, cleared: !!meta?.cleared });
    }
    return m;
  }, [detected, map.regions]);

  const cellPx = THUMB_SIZE / Math.max(map.gridW, map.gridH);

  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <svg
        viewBox={`0 0 ${map.gridW * cellPx} ${map.gridH * cellPx}`}
        className="block w-full"
        aria-label={`Thumbnail of ${map.name}`}
      >
        {Array.from(regionsByHash.values()).flatMap((r) =>
          r.tiles.map(([cx, cy]) => (
            <rect
              key={`${r.cleared ? "c" : "o"}-${cx}-${cy}`}
              x={cx * cellPx}
              y={cy * cellPx}
              width={cellPx}
              height={cellPx}
              className={
                r.cleared
                  ? "fill-zinc-300 dark:fill-zinc-700"
                  : "fill-amber-100 dark:fill-amber-900/40"
              }
            />
          )),
        )}
        {map.walls.map((w, i) => (
          <line
            key={i}
            x1={w.ax * cellPx}
            y1={w.ay * cellPx}
            x2={w.bx * cellPx}
            y2={w.by * cellPx}
            stroke="currentColor"
            strokeWidth={1}
            className="text-zinc-700 dark:text-zinc-300"
          />
        ))}
      </svg>
      <div className="mt-1 truncate">{map.name}</div>
      <div className="text-zinc-500">Lvl {map.level}</div>
    </div>
  );
}
