import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Note, NoteTarget } from "@/types/notes";

const NOTES_KEY = "2d6d.notes";

type NotesById = Record<string, Note>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
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
let store: NotesById = readJson<NotesById>(NOTES_KEY, {});
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
  writeJson(NOTES_KEY, next);
  notify();
}

// ---- Public hook ----------------------------------------------------------

export interface UseNotesResult {
  notes: Note[];
  notesFor: (target?: NoteTarget) => Note[];
  create: (body: string, target?: NoteTarget) => Note;
  update: (id: string, patch: Partial<Pick<Note, "body" | "target">>) => void;
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

  const create = useCallback((body: string, target?: NoteTarget) => {
    const now = new Date().toISOString();
    const n: Note = {
      id: newId(),
      body,
      createdAt: now,
      updatedAt: now,
      target,
    };
    setStore({ ...store, [n.id]: n });
    return n;
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Pick<Note, "body" | "target">>) => {
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

  return { notes, notesFor, create, update, remove, replaceAll };
}
