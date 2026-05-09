import { useCallback, useMemo, useSyncExternalStore } from "react";

import type {
  Note,
  NoteEntryType,
  NoteState,
  NoteTarget,
} from "@/types/notes";

const NOTES_KEY = "2d6d.notes";
const NOTES_SCHEMA = 2;

type NotesById = Record<string, Note>;

interface NotesEnvelopeV2 {
  schema: 2;
  notes: NotesById;
}

function readEnvelope(): NotesById {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    // v2 envelope: { schema: 2, notes: {...} }
    if ((parsed as { schema?: number }).schema === NOTES_SCHEMA) {
      const env = parsed as NotesEnvelopeV2;
      return migrateEntries(env.notes ?? {});
    }
    // v1 (legacy): bare {id: Note} map. Wrap in v2 envelope on the way
    // through and inject defaults for the new fields per Story 4.1 AC5.
    return migrateEntries(parsed as NotesById);
  } catch {
    return {};
  }
}

function migrateEntries(input: NotesById): NotesById {
  const out: NotesById = {};
  for (const [id, n] of Object.entries(input)) {
    if (!n || typeof n !== "object") continue;
    out[id] = {
      ...(n as Note),
      entryType: ((n as Partial<Note>).entryType ?? "Note") as NoteEntryType,
      state: ((n as Partial<Note>).state ?? "resolved") as NoteState,
    };
  }
  return out;
}

function writeEnvelope(notes: NotesById): void {
  if (typeof window === "undefined") return;
  const env: NotesEnvelopeV2 = { schema: NOTES_SCHEMA, notes };
  window.localStorage.setItem(NOTES_KEY, JSON.stringify(env));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function targetEquals(
  a: NoteTarget | undefined,
  b: NoteTarget | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id;
}

// ---- Module-level store ---------------------------------------------------
// Single source of truth shared by every useNotes() consumer. We use
// useSyncExternalStore so multiple components stay in sync on every change
// without needing a Context provider.
let store: NotesById = readEnvelope();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): NotesById {
  return store;
}

function setStore(next: NotesById): void {
  store = next;
  writeEnvelope(next);
  notify();
}

// ---- Public hook ----------------------------------------------------------

export interface CreateNoteInput {
  body: string;
  target?: NoteTarget;
  entryType?: NoteEntryType;
  state?: NoteState;
}

export interface UseNotesResult {
  notes: Note[];
  notesFor: (target?: NoteTarget) => Note[];
  /** Returns the chronological log thread for a region (room / hallway).
   *  Story 4.1 — used by Epic 4 surfaces to render per-pin threads. */
  notesForRegion: (regionHash: string) => Note[];
  create: (input: CreateNoteInput) => Note;
  update: (
    id: string,
    patch: Partial<Pick<Note, "body" | "target" | "entryType" | "state">>,
  ) => void;
  remove: (id: string) => void;
  replaceAll: (next: Note[]) => void;
}

export function useNotes(): UseNotesResult {
  const byId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const notes = useMemo(
    () =>
      Object.values(byId).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [byId],
  );

  const notesFor = useCallback(
    (target?: NoteTarget) => notes.filter((n) => targetEquals(n.target, target)),
    [notes],
  );

  // Story 4.1: chronological per-region thread (oldest first). Filters
  // notes whose target points at the room with the given tilesHash.
  const notesForRegion = useCallback(
    (regionHash: string) =>
      notes
        .filter(
          (n) => n.target?.kind === "room" && n.target.id === regionHash,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [notes],
  );

  const create = useCallback((input: CreateNoteInput) => {
    const now = new Date().toISOString();
    const n: Note = {
      id: newId(),
      body: input.body,
      createdAt: now,
      updatedAt: now,
      target: input.target,
      entryType: input.entryType ?? "Note",
      state: input.state ?? "resolved",
    };
    setStore({ ...store, [n.id]: n });
    return n;
  }, []);

  const update = useCallback(
    (
      id: string,
      patch: Partial<Pick<Note, "body" | "target" | "entryType" | "state">>,
    ) => {
      const existing = store[id];
      if (!existing) return;
      setStore({
        ...store,
        [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    if (!(id in store)) return;
    const next = { ...store };
    delete next[id];
    setStore(next);
  }, []);

  const replaceAll = useCallback((next: Note[]) => {
    const map: NotesById = {};
    for (const n of next) map[n.id] = n;
    setStore(map);
  }, []);

  return {
    notes,
    notesFor,
    notesForRegion,
    create,
    update,
    remove,
    replaceAll,
  };
}
