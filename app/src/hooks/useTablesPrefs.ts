import { useCallback, useMemo, useSyncExternalStore } from "react";

// Story 3.1 — persistent Pinned + Recents for the Tables column.
// Pinned is a manual favorites set; Recent is auto-tracked MRU capped at 7.
// useSyncExternalStore so multiple consumers stay in sync without context.

const PINNED_KEY = "2d6d.tablesPinned";
const RECENT_KEY = "2d6d.tablesRecent";
const RECENT_CAP = 7;

interface TablesPrefs {
  pinned: string[];
  recent: string[];
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

let store: TablesPrefs = {
  pinned: readJson<string[]>(PINNED_KEY, []),
  recent: readJson<string[]>(RECENT_KEY, []),
};
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

function getSnapshot(): TablesPrefs {
  return store;
}

function commit(next: TablesPrefs) {
  store = next;
  writeJson(PINNED_KEY, next.pinned);
  writeJson(RECENT_KEY, next.recent);
  notify();
}

export interface UseTablesPrefsResult {
  pinned: ReadonlySet<string>;
  recent: readonly string[];
  togglePinned: (id: string) => void;
  pushRecent: (id: string) => void;
}

export function useTablesPrefs(): UseTablesPrefsResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const pinned = useMemo(() => new Set(state.pinned), [state.pinned]);

  const togglePinned = useCallback((id: string) => {
    const cur = store.pinned;
    const has = cur.includes(id);
    const next = has ? cur.filter((p) => p !== id) : [...cur, id];
    commit({ ...store, pinned: next });
  }, []);

  const pushRecent = useCallback((id: string) => {
    const without = store.recent.filter((r) => r !== id);
    const next = [id, ...without].slice(0, RECENT_CAP);
    // Bail if nothing changed (e.g. id is already at the front) so we
    // don't trigger a useSyncExternalStore re-render for a no-op.
    if (
      next.length === store.recent.length &&
      next.every((v, i) => v === store.recent[i])
    ) {
      return;
    }
    commit({ ...store, recent: next });
  }, []);

  return { pinned, recent: state.recent, togglePinned, pushRecent };
}
