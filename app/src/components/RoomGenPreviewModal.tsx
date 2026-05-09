import { useState } from "react";

import { Modal } from "@/components/Modal";
import { useNotes } from "@/hooks/useNotes";
import { useRoomGen } from "@/components/RoomGen";
import {
  summarizeParseResult,
  type ParsedEntry,
} from "@/lib/contents-parser";
import type { NoteEntryType } from "@/types/notes";

// Story 6.5 — preview-confirm dialog for the room-gen flow's parsed
// contents-roll. Mounted in Shell; driven by the RoomGen context.
//
// Behaviour: each parsed entry has an "include" checkbox (default on)
// and an Edit toggle that reveals body + entry-type editors. Confirm
// commits every checked-and-included entry as a *pending* Note in the
// active room's pin thread (Loot/Roll entries also carry their
// tableRef so Story 4.6's auto-resolve fires when the player rolls on
// the referenced table later).

const ENTRY_TYPES: NoteEntryType[] = [
  "Combat",
  "Loot",
  "Roll",
  "Event",
  "Note",
];

interface DraftEntry extends ParsedEntry {
  include: boolean;
}

export function RoomGenPreviewModal() {
  const { preview, closePreview } = useRoomGen();
  const { create } = useNotes();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[]>(() =>
    preview?.parse.entries.map((e) => ({ ...e, include: true })) ?? [],
  );

  if (!preview) return null;

  function handleSkip() {
    closePreview();
  }

  function handleConfirm() {
    if (!preview) return;
    for (const d of drafts) {
      if (!d.include) continue;
      create({
        body: d.body,
        target: { kind: "room", id: preview.regionHash },
        entryType: d.type,
        state: "pending",
        tableRef: d.tableRef,
      });
    }
    closePreview();
  }

  function patchDraft(id: string, patch: Partial<DraftEntry>) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }

  const summary = summarizeParseResult({
    entries: drafts.filter((d) => d.include),
    rawText: preview.parse.rawText,
  });

  return (
    <Modal
      title="Room contents — preview"
      onClose={handleSkip}
      footer={
        <>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => setEditing((s) => !s)}
            aria-pressed={editing}
            className={`rounded-md px-3 py-1.5 text-sm ${
              editing
                ? "border border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            }`}
          >
            {editing ? "Done editing" : "Edit"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={drafts.every((d) => !d.include)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:dark:bg-zinc-700 disabled:dark:text-zinc-500"
          >
            Confirm
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-zinc-800 dark:text-zinc-200">{summary}</p>
        <p className="text-xs text-zinc-500">
          From <span className="font-mono">{preview.fromTableId}</span>
          {preview.rolledValue && (
            <>
              {" · rolled "}
              <span className="font-mono">{preview.rolledValue}</span>
            </>
          )}
        </p>
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li
              key={d.id}
              className={`rounded-md border p-2 ${
                d.include
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={d.include}
                  onChange={(e) => patchDraft(d.id, { include: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                  aria-label={`Include ${d.body}`}
                />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-1.5">
                      <select
                        value={d.type}
                        onChange={(e) =>
                          patchDraft(d.id, { type: e.target.value as NoteEntryType })
                        }
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {ENTRY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={d.body}
                        onChange={(e) => patchDraft(d.id, { body: e.target.value })}
                        rows={2}
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </div>
                  ) : (
                    <div className="text-sm">
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {d.type}
                      </span>{" "}
                      <span>{d.body}</span>
                      {d.tableRef && (
                        <span className="ml-1 font-mono text-xs text-zinc-500">
                          → {d.tableRef}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
