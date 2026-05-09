// Story 6.12 — RunRecord persistence on Character.runs. Replaces the
// 6.11 stub that wrote a parallel localStorage array.
//
// Caller responsibility: pass the live character + maps + notes from
// the React stores. archiveRun computes the summary stats (parallel to
// RunEndModal's display) and returns the new RunRecord. The caller is
// responsible for committing the updated character via
// useCharacters.update — keeping persistence concerns inside the React
// data layer instead of having this module reach into a hook from a
// pure function.

import type { Character, RunRecord, RunSummaryStats } from "@/types/character";
import type { MapDocV2 } from "@/types/mapv2";
import type { Note } from "@/types/notes";
import type { RunEndCause } from "@/components/RunEnd";

export function buildRunRecord(input: {
  character: Character;
  allMaps: MapDocV2[];
  allNotes: Note[];
  cause: RunEndCause;
}): RunRecord {
  const summaryStats = computeSummaryStats(
    input.character,
    input.allMaps,
    input.allNotes,
    input.cause,
  );
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}`,
    // The character's createdAt is the closest proxy for run-start
    // until Story 6.12 surfaces a per-run "startedAt" handshake (each
    // new run after revival could stamp this). For the MVP we use the
    // character's most-recent `updatedAt` so consecutive same-character
    // revivals don't all share the original creation time.
    startedAt: input.character.createdAt,
    endedAt: now,
    endReason: "death",
    summaryStats,
  };
}

/**
 * Append the record to character.runs (immutable). Returns the next
 * patch the caller should pass into useCharacters.update.
 */
export function appendRunToCharacter(
  character: Character,
  record: RunRecord,
): Partial<Character> {
  const runs = character.runs ?? [];
  return { runs: [...runs, record] };
}

// ---- Aggregation -----------------------------------------------------------

function computeSummaryStats(
  character: Character,
  allMaps: MapDocV2[],
  allNotes: Note[],
  cause: RunEndCause,
): RunSummaryStats {
  const charMaps = allMaps.filter(
    (m) => !m.characterId || m.characterId === character.id,
  );
  const levelsReached = charMaps.reduce((m, x) => Math.max(m, x.level), 1);
  const roomTilesHashes = new Set<string>();
  for (const m of charMaps) {
    for (const r of m.regions) if (r.kind) roomTilesHashes.add(r.tilesHash);
  }

  const killMap = new Map<string, number>();
  for (const n of allNotes) {
    if (n.entryType !== "Combat" || n.state !== "resolved") continue;
    if (n.target?.kind !== "room") continue;
    if (!roomTilesHashes.has(n.target.id)) continue;
    for (const k of extractKills(n.body)) {
      killMap.set(k.name, (killMap.get(k.name) ?? 0) + k.count);
    }
  }
  const killBreakdown = Array.from(killMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const killsTotal = killBreakdown.reduce((s, k) => s + k.count, 0);

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
    cause,
    levelsReached,
    roomsEntered: roomTilesHashes.size,
    killsTotal,
    killBreakdown,
    xp: character.xp,
    treasureCoins,
    mapIds: charMaps.map((m) => m.id),
  };
}

// Same patterns as RunEndModal — kept local so the lib stays
// dependency-free. If the heuristics need tightening they should be
// updated in lockstep.
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
