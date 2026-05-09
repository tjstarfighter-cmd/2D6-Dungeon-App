import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import {
  downloadText,
  parseImport,
  pickJsonFile,
  serialiseBackup,
} from "@/lib/io";
import type { Character, RunRecord } from "@/types/character";
import type { MapDocV2 } from "@/types/mapv2";

// Story 8.2 — Backup & restore + Selective Delete. The Full Backup +
// Full Restore halves continue to do what Story 1.2 shipped; the new
// Selective Delete section adds three sub-tabs (by Run / by Map / by
// Character) with [Delete] + [Export PDF first] per row. The "PDF" is
// a JSON snapshot until Story 8.3 ships the actual PDF module — the
// "raw run data is never lost" rule (NFR12) is satisfied either way.

type DeleteTab = "run" | "map" | "character";

export function BackupRestoreModal({ onClose }: { onClose: () => void }) {
  const {
    characters: chars,
    active,
    update: updateChar,
    remove: removeChar,
    replaceAll: replaceChars,
  } = useCharacters();
  const { notes, replaceAll: replaceNotes } = useNotes();
  const {
    maps,
    remove: removeMap,
    replaceAll: replaceMaps,
  } = useMapsV2();

  const [tab, setTab] = useState<DeleteTab>("run");

  function handleExport() {
    const text = serialiseBackup(chars, notes, maps);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`2d6d-backup-${stamp}.json`, text);
  }

  async function handleImport() {
    const text = await pickJsonFile();
    if (text == null) return;
    const result = parseImport(text);
    if (result.errors.length > 0) {
      alert(`Import had problems:\n${result.errors.join("\n")}`);
      if (
        result.characters.length === 0 &&
        result.notes.length === 0 &&
        result.maps.length === 0
      ) {
        return;
      }
    }
    if (
      (chars.length > 0 || notes.length > 0 || maps.length > 0) &&
      !confirm(
        `Replace current data (${chars.length} characters, ${notes.length} notes, ${maps.length} maps) ` +
          `with imported data (${result.characters.length} characters, ${result.notes.length} notes, ${result.maps.length} maps)?`,
      )
    ) {
      return;
    }
    replaceChars(result.characters);
    replaceNotes(result.notes);
    replaceMaps(result.maps);
    onClose();
  }

  // Selective delete handlers ----------------------------------------------

  function deleteRun(character: Character, run: RunRecord, exportFirst: boolean) {
    if (exportFirst) {
      const ok = exportJson(
        `run-${safe(character.name)}-${run.endedAt.slice(0, 10)}.json`,
        { kind: "run", character, run },
      );
      if (!ok) {
        alert("Export failed — delete aborted.");
        return;
      }
    }
    if (
      !confirm(
        `Delete this run for ${character.name}? This cannot be undone.`,
      )
    )
      return;
    const nextRuns = (character.runs ?? []).filter((r) => r.id !== run.id);
    updateChar(character.id, { runs: nextRuns });
  }

  function deleteMap(map: MapDocV2, exportFirst: boolean) {
    if (exportFirst) {
      const ok = exportJson(`map-${safe(map.name)}-${dateStamp()}.json`, {
        kind: "map",
        map,
        notes: notes.filter(
          (n) =>
            n.target?.kind === "room" &&
            map.regions.some((r) => r.tilesHash === n.target?.id),
        ),
      });
      if (!ok) {
        alert("Export failed — delete aborted.");
        return;
      }
    }
    if (!confirm(`Delete map "${map.name}"? This cannot be undone.`)) return;
    removeMap(map.id);
  }

  function deleteCharacter(c: Character, exportFirst: boolean) {
    if (active?.id === c.id && c.state !== "dead") {
      alert(
        "Cannot delete the active alive character. Switch to a different character first.",
      );
      return;
    }
    if (exportFirst) {
      const ok = exportJson(`character-${safe(c.name)}-${dateStamp()}.json`, {
        kind: "character",
        character: c,
        runs: c.runs ?? [],
      });
      if (!ok) {
        alert("Export failed — delete aborted.");
        return;
      }
    }
    if (
      !confirm(
        `Delete character "${c.name}" and all archived runs? This cannot be undone.`,
      )
    )
      return;
    removeChar(c.id);
  }

  // Renderable run rows: every archived run across every character.
  const runRows = chars
    .flatMap((c) => (c.runs ?? []).map((r) => ({ character: c, run: r })))
    .sort((a, b) => b.run.endedAt.localeCompare(a.run.endedAt));

  return (
    <Modal title="Backup & restore" onClose={onClose}>
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Full Backup
        </h3>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <div className="font-medium">Export all data</div>
            <div className="text-xs text-zinc-500">
              {chars.length} characters · {maps.length} maps · {notes.length}{" "}
              notes
            </div>
          </div>
          <Button onClick={handleExport}>Export…</Button>
        </div>
      </section>

      <section className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Full Restore
        </h3>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <div className="font-medium">Restore from backup</div>
            <div className="text-xs text-zinc-500">
              Replaces all current data after a confirmation prompt.
            </div>
          </div>
          <Button onClick={handleImport}>Import…</Button>
        </div>
      </section>

      <section className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Selective Delete
        </h3>
        <div role="tablist" aria-label="Selective delete tabs" className="mb-2 flex gap-1">
          {(
            [
              { key: "run" as const, label: `Runs (${runRows.length})` },
              { key: "map" as const, label: `Maps (${maps.length})` },
              { key: "character" as const, label: `Characters (${chars.length})` },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                tab === t.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "run" && (
          runRows.length === 0 ? (
            <Empty>No archived runs yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {runRows.map(({ character, run }) => {
                const cause =
                  run.summaryStats.cause.kind === "combat" ? "Killed by" : "Fell to";
                return (
                  <DeleteRow
                    key={run.id}
                    title={`${character.name} · Lvl ${run.summaryStats.levelsReached}`}
                    subtitle={`${cause} ${run.summaryStats.cause.source} · ${new Date(run.endedAt).toLocaleDateString()} (${run.endReason})`}
                    onDelete={() => deleteRun(character, run, false)}
                    onExportThenDelete={() => deleteRun(character, run, true)}
                  />
                );
              })}
            </ul>
          )
        )}

        {tab === "map" && (
          maps.length === 0 ? (
            <Empty>No maps to delete.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {maps.map((m) => (
                <DeleteRow
                  key={m.id}
                  title={`${m.name} · Lvl ${m.level}`}
                  subtitle={`${m.gridW}×${m.gridH} · ${m.regions.length} pin notes · updated ${new Date(m.updatedAt).toLocaleDateString()}`}
                  onDelete={() => deleteMap(m, false)}
                  onExportThenDelete={() => deleteMap(m, true)}
                />
              ))}
            </ul>
          )
        )}

        {tab === "character" && (
          chars.length === 0 ? (
            <Empty>No characters to delete.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {chars.map((c) => {
                const isActiveAlive =
                  active?.id === c.id && c.state !== "dead";
                return (
                  <DeleteRow
                    key={c.id}
                    title={`${c.name} · Lvl ${c.level}`}
                    subtitle={`${c.state ?? "alive"} · ${(c.runs?.length ?? 0)} archived runs · last played ${new Date(c.updatedAt).toLocaleDateString()}`}
                    blockedReason={
                      isActiveAlive
                        ? "Switch to a different character first"
                        : undefined
                    }
                    onDelete={() => deleteCharacter(c, false)}
                    onExportThenDelete={() => deleteCharacter(c, true)}
                  />
                );
              })}
            </ul>
          )
        )}
      </section>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function DeleteRow({
  title,
  subtitle,
  blockedReason,
  onDelete,
  onExportThenDelete,
}: {
  title: string;
  subtitle: string;
  blockedReason?: string;
  onDelete: () => void;
  onExportThenDelete: () => void;
}) {
  const blocked = !!blockedReason;
  return (
    <li className="rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-zinc-500">{subtitle}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={onExportThenDelete}
            disabled={blocked}
            title={blockedReason}
          >
            Export PDF first
          </Button>
          <Button
            onClick={onDelete}
            variant="danger"
            disabled={blocked}
            title={blockedReason}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

// ---- Helpers --------------------------------------------------------------

function safe(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_") || "untitled";
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function exportJson(filename: string, payload: unknown): boolean {
  try {
    downloadText(
      filename,
      JSON.stringify(
        {
          notice:
            "PDF export ships in Story 8.3. JSON snapshot for now (raw data preserved per NFR12).",
          ...((payload as object) ?? {}),
        },
        null,
        2,
      ),
    );
    return true;
  } catch {
    return false;
  }
}
