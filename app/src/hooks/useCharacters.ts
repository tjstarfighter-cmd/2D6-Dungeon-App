import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Character } from "@/types/character";
import { createCharacter } from "@/lib/character";

const CHARS_KEY = "2d6d.characters";
const ACTIVE_KEY = "2d6d.activeCharacter";

type CharactersById = Record<string, Character>;

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

// ---- Module-level stores --------------------------------------------------
// Two stores (characters map + active id) sharing the same hook surface.
// useSyncExternalStore keeps every consumer in sync without a Provider.

let storeChars: CharactersById = readJson<CharactersById>(CHARS_KEY, {});
let storeActive: string | null = readJson<string | null>(ACTIVE_KEY, null);

const charsListeners = new Set<() => void>();
const activeListeners = new Set<() => void>();

function notifyChars(): void {
  for (const fn of charsListeners) fn();
}
function notifyActive(): void {
  for (const fn of activeListeners) fn();
}
function subscribeChars(fn: () => void): () => void {
  charsListeners.add(fn);
  return () => {
    charsListeners.delete(fn);
  };
}
function subscribeActive(fn: () => void): () => void {
  activeListeners.add(fn);
  return () => {
    activeListeners.delete(fn);
  };
}
function getCharsSnapshot(): CharactersById {
  return storeChars;
}
function getActiveSnapshot(): string | null {
  return storeActive;
}
function setChars(next: CharactersById): void {
  storeChars = next;
  writeJson(CHARS_KEY, next);
  notifyChars();
}
function setActiveStore(next: string | null): void {
  storeActive = next;
  writeJson(ACTIVE_KEY, next);
  notifyActive();
}

// ---- Public hook ----------------------------------------------------------

export interface UseCharactersResult {
  characters: Character[];
  active: Character | null;
  activeId: string | null;
  create: (name?: string) => Character;
  update: (id: string, patch: Partial<Character>) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  /** Replace the entire store (used by JSON import). */
  replaceAll: (next: Character[], newActiveId?: string) => void;
}

export function useCharacters(): UseCharactersResult {
  const chars = useSyncExternalStore(subscribeChars, getCharsSnapshot, getCharsSnapshot);
  const activeId = useSyncExternalStore(
    subscribeActive,
    getActiveSnapshot,
    getActiveSnapshot,
  );

  const characters = useMemo(
    () =>
      Object.values(chars).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [chars],
  );

  const active = activeId ? (chars[activeId] ?? null) : null;

  const create = useCallback((name?: string) => {
    const c = createCharacter(name);
    setChars({ ...storeChars, [c.id]: c });
    setActiveStore(c.id);
    return c;
  }, []);

  const update = useCallback((id: string, patch: Partial<Character>) => {
    const existing = storeChars[id];
    if (!existing) return;
    setChars({
      ...storeChars,
      [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
    });
  }, []);

  const remove = useCallback((id: string) => {
    if (!(id in storeChars)) return;
    const next = { ...storeChars };
    delete next[id];
    setChars(next);
    if (storeActive === id) setActiveStore(null);
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveStore(id);
  }, []);

  const replaceAll = useCallback(
    (next: Character[], newActiveId?: string) => {
      const map: CharactersById = {};
      for (const c of next) map[c.id] = c;
      setChars(map);
      setActiveStore(newActiveId ?? next[0]?.id ?? null);
    },
    [],
  );

  return { characters, active, activeId, create, update, remove, setActive, replaceAll };
}
