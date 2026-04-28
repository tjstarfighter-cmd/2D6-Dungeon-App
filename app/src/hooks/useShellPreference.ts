import { useCallback, useSyncExternalStore } from "react";

// Transitional app-wide preference for which shell to render.
// `classic` keeps the original Layout (sidebar nav over six co-equal views).
// `new`     swaps in ShellLayout (sheet sidebar + bottom action bar + overlays).
//
// Default `classic` while the new shell stabilizes. Drop the toggle and flip
// the default in Phase 5 cleanup.
export type ShellChoice = "classic" | "new";

const KEY = "2d6d.shellChoice";
const DEFAULT: ShellChoice = "classic";

function readPref(): ShellChoice {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "new" || raw === "classic" ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let store: ShellChoice = readPref();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): ShellChoice {
  return store;
}

function setStore(next: ShellChoice): void {
  store = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, next);
  }
  for (const fn of listeners) fn();
}

export function useShellPreference(): [ShellChoice, (next: ShellChoice) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((next: ShellChoice) => setStore(next), []);
  return [value, set];
}
