import { useEffect, useMemo, useRef, useState } from "react";

import { useActivePin } from "@/components/ActivePin";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import type { Note, NoteEntryType } from "@/types/notes";

// Story 4.2 — per-room game log surface. Lives in the right column's Log
// tab (and the phone Log inner tab). Reads the shell-level active pin
// (set by MapV2 when the user taps a pinned region's marker) and renders
// the matching room's chronological thread plus quick-add chips.
//
// Edit/delete is Story 4.3; the chip flow here ships create-only with
// an inline body editor on the freshly-created pending entry.

const QUICK_ADD: { type: NoteEntryType; label: string }[] = [
  { type: "Roll", label: "+ Roll" },
  { type: "Loot", label: "+ Loot" },
  { type: "Event", label: "+ Event" },
  { type: "Note", label: "+ Note" },
];

export function LogPanel() {
  const pin = useActivePin();
  const { active: activeMap } = useMapsV2();
  const { notes, notesForRegion, create, update, remove } = useNotes();

  const region = useMemo(() => {
    if (!pin || !activeMap) return null;
    return (
      activeMap.regions.find((r) => r.tilesHash === pin.tilesHash) ?? null
    );
  }, [pin, activeMap]);

  // Pin-active: that pin's thread. No pin: Unattributed bucket (notes
  // with no target, oldest first to match thread chronology).
  const entries = useMemo(() => {
    if (pin && region) return notesForRegion(pin.tilesHash);
    return notes
      .filter((n) => !n.target)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [pin, region, notesForRegion, notes]);

  // Pinned regions on the active map — fed into the editor's "Move to
  // room…" picker so an Unattributed entry can be reassigned.
  const pinnedOptions = useMemo(() => {
    if (!activeMap) return [] as { hash: string; label: string }[];
    return activeMap.regions
      .filter((r) => r.kind && typeof r.number === "number")
      .map((r) => ({
        hash: r.tilesHash,
        label: `${r.kind === "room" ? "Room" : "Hall"} ${r.number}${
          r.label ? ` — ${r.label}` : ""
        }`,
      }));
  }, [activeMap]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const isUnattributed = !pin || !region;
  const headerKind = region?.kind === "room" ? "Room" : "Hall";
  const headerNumber = region?.number ?? "?";
  const headerLabel = region?.label ? ` — ${region.label}` : "";

  function addEntry(type: NoteEntryType) {
    const note = create({
      body: "",
      target:
        pin && region ? { kind: "room", id: pin.tilesHash } : undefined,
      entryType: type,
      state: "pending",
    });
    setEditingId(note.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-2 flex items-baseline gap-2">
        {isUnattributed ? (
          <>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Unattributed
            </h2>
            <span className="font-mono text-xs text-zinc-400">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {headerKind} {headerNumber}
              {headerLabel}
            </h2>
            <span className="font-mono text-xs text-zinc-400">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </>
        )}
      </header>

      {isUnattributed && (
        <p className="mb-2 text-xs text-zinc-500">
          📌 Tap a pin on the Map to view its log thread.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="my-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            No entries yet. Use the chips below to add the first one.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((n) => (
              <LogEntryRow
                key={n.id}
                entry={n}
                editing={editingId === n.id}
                pinnedOptions={pinnedOptions}
                onStartEdit={() => setEditingId(n.id)}
                onCommit={(patch) => {
                  update(n.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                onDelete={() => {
                  remove(n.id);
                  setEditingId(null);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap gap-1">
        {QUICK_ADD.map((c) => (
          <button
            key={c.type}
            type="button"
            onClick={() => addEntry(c.type)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ENTRY_TYPES: NoteEntryType[] = ["Roll", "Loot", "Combat", "Event", "Note"];

function LogEntryRow({
  entry,
  editing,
  pinnedOptions,
  onStartEdit,
  onCommit,
  onCancel,
  onDelete,
}: {
  entry: Note;
  editing: boolean;
  pinnedOptions: { hash: string; label: string }[];
  onStartEdit: () => void;
  onCommit: (
    patch: Partial<Pick<Note, "body" | "entryType" | "state" | "target">>,
  ) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(entry.body);
  const [draftType, setDraftType] = useState<NoteEntryType>(entry.entryType);
  const [draftResolved, setDraftResolved] = useState(entry.state === "resolved");
  const [draftTargetHash, setDraftTargetHash] = useState<string>(
    entry.target?.kind === "room" ? entry.target.id : "",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // When entering edit mode, seed draft state from the entry and focus.
  useEffect(() => {
    if (editing) {
      setDraft(entry.body);
      setDraftType(entry.entryType);
      setDraftResolved(entry.state === "resolved");
      setDraftTargetHash(
        entry.target?.kind === "room" ? entry.target.id : "",
      );
      setConfirmDelete(false);
      inputRef.current?.focus();
    }
  }, [editing, entry.body, entry.entryType, entry.state, entry.target]);

  const dim = entry.state === "pending";
  return (
    <li
      className={`rounded-md border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {entry.entryType}
        </span>
        {entry.state === "pending" && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            pending
          </span>
        )}
        {entry.tableRef && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {entry.tableRef}
          </span>
        )}
        <time className="ml-auto font-mono text-[10px] text-zinc-400">
          {(entry.resolvedAt ?? entry.createdAt).slice(11, 16)}
        </time>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="Describe this entry…"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-zinc-500">Type</span>
              <select
                value={draftType}
                onChange={(e) =>
                  setDraftType(e.target.value as NoteEntryType)
                }
                className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={draftResolved}
                onChange={(e) => setDraftResolved(e.target.checked)}
              />
              <span>Resolved</span>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-zinc-500">Pin</span>
              <select
                value={draftTargetHash}
                onChange={(e) => setDraftTargetHash(e.target.value)}
                className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Unattributed</option>
                {pinnedOptions.map((p) => (
                  <option key={p.hash} value={p.hash}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() =>
                onCommit({
                  body: draft.trim(),
                  entryType: draftType,
                  state: draftResolved ? "resolved" : "pending",
                  target: draftTargetHash
                    ? { kind: "room", id: draftTargetHash }
                    : undefined,
                })
              }
              className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                Delete
              </button>
            ) : (
              <span className="ml-auto flex items-center gap-1 text-xs text-rose-800 dark:text-rose-200">
                <span>Sure?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded bg-rose-700 px-2 py-0.5 font-medium text-white hover:bg-rose-800 dark:bg-rose-800 dark:hover:bg-rose-700"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="block w-full space-y-0.5 text-left text-zinc-800 dark:text-zinc-200"
        >
          <div>
            {entry.body || (
              <span className="italic text-zinc-400">(empty — tap to edit)</span>
            )}
          </div>
          {entry.state === "resolved" && entry.resolvedValue && (
            <div className="font-mono text-xs text-emerald-700 dark:text-emerald-400">
              → {entry.resolvedValue}
            </div>
          )}
        </button>
      )}
    </li>
  );
}
