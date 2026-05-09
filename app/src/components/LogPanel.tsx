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
  const { notesForRegion, create, update } = useNotes();

  const region = useMemo(() => {
    if (!pin || !activeMap) return null;
    return (
      activeMap.regions.find((r) => r.tilesHash === pin.tilesHash) ?? null
    );
  }, [pin, activeMap]);

  const entries = useMemo(
    () => (pin ? notesForRegion(pin.tilesHash) : []),
    [pin, notesForRegion],
  );

  const [editingId, setEditingId] = useState<string | null>(null);

  if (!pin || !region) {
    return (
      <div className="space-y-3 text-sm text-zinc-500">
        <p>📌 Tap a pinned region on the Map to view its log thread.</p>
        <p className="text-xs">
          Per-room game logs (rolls, combat summaries, loot, events) attach
          to the region you select.
        </p>
      </div>
    );
  }

  const headerKind = region.kind === "room" ? "Room" : "Hall";
  const headerNumber = region.number ?? "?";
  const headerLabel = region.label ? ` — ${region.label}` : "";

  function addEntry(type: NoteEntryType) {
    if (!pin) return;
    const note = create({
      body: "",
      target: { kind: "room", id: pin.tilesHash },
      entryType: type,
      state: "pending",
    });
    setEditingId(note.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-2 flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {headerKind} {headerNumber}
          {headerLabel}
        </h2>
        <span className="font-mono text-xs text-zinc-400">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </header>

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
                onStartEdit={() => setEditingId(n.id)}
                onCommit={(body) => {
                  update(n.id, { body });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
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

function LogEntryRow({
  entry,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  entry: Note;
  editing: boolean;
  onStartEdit: () => void;
  onCommit: (body: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(entry.body);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // When entering edit mode, focus the textarea and seed the draft.
  useEffect(() => {
    if (editing) {
      setDraft(entry.body);
      inputRef.current?.focus();
    }
  }, [editing, entry.body]);

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
        <time className="ml-auto font-mono text-[10px] text-zinc-400">
          {entry.createdAt.slice(11, 16)}
        </time>
      </div>
      {editing ? (
        <div className="space-y-1">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="Describe this entry…"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onCommit(draft.trim())}
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
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="block w-full text-left text-zinc-800 dark:text-zinc-200"
        >
          {entry.body || (
            <span className="italic text-zinc-400">(empty — tap to edit)</span>
          )}
        </button>
      )}
    </li>
  );
}
