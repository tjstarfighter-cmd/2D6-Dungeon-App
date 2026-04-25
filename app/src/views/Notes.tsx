import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { Note, NoteTargetKind } from "@/types/notes";
import { useNotes } from "@/hooks/useNotes";
import { useCharacters } from "@/hooks/useCharacters";
import { Button, Card, TextArea } from "@/components/ui";
import { cards, tables } from "@/data";

const KIND_LABEL: Record<NoteTargetKind | "session", string> = {
  table: "Tables",
  card: "Cards",
  creature: "Creatures",
  character: "Characters",
  session: "Session",
  map: "Maps",
  room: "Rooms",
};

const FILTERS: Array<{ key: "all" | NoteTargetKind | "session"; label: string }> = [
  { key: "all", label: "All" },
  { key: "session", label: "Session" },
  { key: "character", label: "Characters" },
  { key: "table", label: "Tables" },
  { key: "card", label: "Cards" },
  { key: "creature", label: "Creatures" },
];

export function NotesView() {
  const { notes, create, update, remove } = useNotes();
  const { characters } = useCharacters();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [drafting, setDrafting] = useState(false);
  const [draftBody, setDraftBody] = useState("");

  const charById = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.id, c])),
    [characters],
  );
  const cardById = useMemo(
    () => Object.fromEntries(cards.cards.map((c) => [c.filename, c])),
    [],
  );

  const visible = useMemo(() => {
    if (filter === "all") return notes;
    if (filter === "session") return notes.filter((n) => !n.target);
    return notes.filter((n) => n.target?.kind === filter);
  }, [notes, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notes.length, session: 0 };
    for (const n of notes) {
      if (!n.target) {
        c.session = (c.session ?? 0) + 1;
      } else {
        c[n.target.kind] = (c[n.target.kind] ?? 0) + 1;
      }
    }
    return c;
  }, [notes]);

  function commitDraft() {
    const body = draftBody.trim();
    if (body) create(body);
    setDraftBody("");
    setDrafting(false);
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <Card title={`Notes (${notes.length})`}>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const n = counts[f.key] ?? 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {f.label}{" "}
                <span className={active ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-400"}>
                  {n}
                </span>
              </button>
            );
          })}
          <span className="ml-auto">
            {drafting ? null : (
              <Button variant="primary" onClick={() => setDrafting(true)}>
                + New session note
              </Button>
            )}
          </span>
        </div>

        {drafting && (
          <div className="mt-3 space-y-2">
            <TextArea
              autoFocus
              rows={3}
              value={draftBody}
              placeholder="A free-floating note for the current session…"
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
            </div>
          </div>
        )}
      </Card>

      {visible.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            {notes.length === 0
              ? "No notes yet. Add notes inline from the Tables, Cards, or Sheet views, or create a session note above."
              : "No notes match this filter."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              characterName={n.target?.kind === "character" ? charById[n.target.id]?.name : undefined}
              tableTitle={n.target?.kind === "table" ? tables[n.target.id]?.title : undefined}
              cardName={
                n.target?.kind === "card" || n.target?.kind === "creature"
                  ? cardById[n.target.id]?.name
                  : undefined
              }
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

function NoteCard({
  note,
  characterName,
  tableTitle,
  cardName,
  onSave,
  onDelete,
}: {
  note: Note;
  characterName?: string;
  tableTitle?: string;
  cardName?: string;
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

  const target = note.target;
  let badge: React.ReactNode = (
    <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Session
    </span>
  );
  if (target?.kind === "table") {
    badge = (
      <Link
        to={`/tables/${target.id}`}
        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
      >
        <span>Table</span>
        <span className="font-mono">{target.id}</span>
        <span>{tableTitle ?? ""}</span>
      </Link>
    );
  } else if (target?.kind === "character") {
    badge = (
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
      >
        <span>Character</span>
        <span>{characterName ?? "(unknown)"}</span>
      </Link>
    );
  } else if (target?.kind === "card" || target?.kind === "creature") {
    badge = (
      <Link
        to="/cards"
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        <span>{KIND_LABEL[target.kind].slice(0, -1)}</span>
        <span>{cardName ?? target.id}</span>
      </Link>
    );
  } else if (target) {
    badge = (
      <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {KIND_LABEL[target.kind] ?? target.kind} · {target.id}
      </span>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {badge}
        <span className="text-xs text-zinc-500" title={note.updatedAt}>
          {new Date(note.updatedAt).toLocaleString()}
        </span>
      </header>
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
          <p className="whitespace-pre-wrap text-sm">{note.body}</p>
          <footer className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </footer>
        </>
      )}
    </li>
  );
}
