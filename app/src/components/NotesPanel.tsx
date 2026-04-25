import { useState } from "react";

import type { Note, NoteTarget } from "@/types/notes";
import { useNotes } from "@/hooks/useNotes";
import { Button, TextArea } from "@/components/ui";

interface Props {
  target?: NoteTarget;
  /** Heading shown in the panel; defaults to "Notes". */
  title?: string;
  /** Compact rendering: smaller header, no border (for inline embedding). */
  compact?: boolean;
}

/**
 * Inline notes panel — shows all notes for a target and lets the user add,
 * edit, and remove them. Omit `target` for free-floating "session" notes.
 */
export function NotesPanel({ target, title = "Notes", compact = false }: Props) {
  const { notesFor, create, update, remove } = useNotes();
  const items = notesFor(target);
  const [drafting, setDrafting] = useState(false);
  const [draftBody, setDraftBody] = useState("");

  function commitDraft() {
    const body = draftBody.trim();
    if (body) create(body, target);
    setDraftBody("");
    setDrafting(false);
  }

  const wrapperCls = compact
    ? ""
    : "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <section className={wrapperCls}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title} <span className="font-normal text-zinc-400">({items.length})</span>
        </h3>
        {!drafting && (
          <Button onClick={() => setDrafting(true)}>+ Add note</Button>
        )}
      </header>

      {drafting && (
        <div className="mb-3 space-y-2">
          <TextArea
            autoFocus
            rows={3}
            placeholder="Write a note (dictation works in any text field — use AquaVoice / keyboard mic)…"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitDraft();
              if (e.key === "Escape") {
                setDraftBody("");
                setDrafting(false);
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={commitDraft}>
              Save
            </Button>
            <Button
              onClick={() => {
                setDraftBody("");
                setDrafting(false);
              }}
            >
              Cancel
            </Button>
            <span className="ml-auto self-center text-xs text-zinc-400">
              ⌘/Ctrl + Enter to save
            </span>
          </div>
        </div>
      )}

      {items.length === 0 && !drafting ? (
        <p className="text-sm text-zinc-500">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              onSave={(body) => update(n.id, { body })}
              onDelete={() => {
                if (confirm("Delete this note?")) remove(n.id);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteItem({
  note,
  onSave,
  onDelete,
}: {
  note: Note;
  onSave: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  function commit() {
    const body = draft.trim();
    if (!body) return;
    onSave(body);
    setEditing(false);
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      {editing ? (
        <div className="space-y-2">
          <TextArea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(note.body);
                setEditing(false);
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={commit}>
              Save
            </Button>
            <Button
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap">{note.body}</p>
          <footer className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span title={note.updatedAt}>
              Updated {formatRelative(note.updatedAt)}
            </span>
            <span className="flex gap-2">
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="danger" onClick={onDelete}>
                Delete
              </Button>
            </span>
          </footer>
        </>
      )}
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
