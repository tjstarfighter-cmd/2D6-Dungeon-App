// Story 6.11 — minimal run-archive shim. Story 6.12 ships the
// formalised RunRecord; this captures the same-shape snapshot today so
// the run-end actions don't lose data while the schema firms up.
//
// Stored in localStorage under `2d6d.runRecords` as an append-only
// array per device. The CharacterSwitcher's "Past runs" surface
// (Story 6.12) will read from here.

import type { Character } from "@/types/character";
import type { MapDocV2 } from "@/types/mapv2";
import type { Note } from "@/types/notes";
import type { RunEndCause } from "@/components/RunEnd";

const KEY = "2d6d.runRecords";

export interface RunRecord {
  id: string;
  characterId: string;
  characterSnapshot: Character;
  maps: MapDocV2[];
  notes: Note[];
  cause: RunEndCause;
  archivedAt: string;
}

function readAll(): RunRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: RunRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Storage may be full or disabled; the run-end action still proceeds.
  }
}

export function archiveRun(input: {
  character: Character;
  allMaps: MapDocV2[];
  allNotes: Note[];
  cause: RunEndCause;
}): RunRecord {
  // Notes scope: any note whose target.kind === "room" AND target.id is
  // in one of this character's pinned regions. Keeps the archive
  // self-contained without dragging in unrelated free-floating notes.
  const charMaps = input.allMaps.filter(
    (m) => !m.characterId || m.characterId === input.character.id,
  );
  const roomHashes = new Set<string>();
  for (const m of charMaps) {
    for (const r of m.regions) if (r.kind) roomHashes.add(r.tilesHash);
  }
  const charNotes = input.allNotes.filter(
    (n) => n.target?.kind === "room" && roomHashes.has(n.target.id),
  );

  const record: RunRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}`,
    characterId: input.character.id,
    characterSnapshot: input.character,
    maps: charMaps,
    notes: charNotes,
    cause: input.cause,
    archivedAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

export function readRunRecords(): RunRecord[] {
  return readAll();
}
