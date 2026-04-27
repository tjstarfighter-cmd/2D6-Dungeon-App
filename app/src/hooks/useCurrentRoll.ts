import { useCallback, useSyncExternalStore } from "react";

import type {
  CurrentRoll,
  CurrentRollResult,
  CurrentRollSource,
} from "@/types/currentRoll";

const KEY = "2d6d.currentRoll";

function readSlot(): CurrentRoll | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CurrentRoll;
  } catch {
    return null;
  }
}

function writeSlot(value: CurrentRoll | null): void {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(KEY);
    return;
  }
  window.localStorage.setItem(KEY, JSON.stringify(value));
}

// Module-level store. Same-window React reactivity flows through the
// in-memory listener set; cross-window/tab updates (e.g. OBS Browser
// Source opened against the same origin) flow through a `storage` event
// listener installed once per module load.

let store: CurrentRoll | null = readSlot();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    if (e.newValue === null) {
      store = null;
    } else {
      try {
        store = JSON.parse(e.newValue) as CurrentRoll;
      } catch {
        store = null;
      }
    }
    notify();
  });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): CurrentRoll | null {
  return store;
}

function setStore(next: CurrentRoll | null): void {
  store = next;
  writeSlot(next);
  notify();
}

export interface PublishPendingArgs {
  source: CurrentRollSource;
  label: string;
  dice: string;
}

export interface PublishResolvedArgs extends PublishPendingArgs {
  value: string;
  result?: CurrentRollResult;
}

export interface UseCurrentRollResult {
  current: CurrentRoll | null;
  publishPending: (args: PublishPendingArgs) => void;
  publishResolved: (args: PublishResolvedArgs) => void;
  clear: () => void;
}

export function useCurrentRoll(): UseCurrentRollResult {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const publishPending = useCallback((args: PublishPendingArgs) => {
    setStore({
      ...args,
      status: "pending",
      updatedAt: Date.now(),
    });
  }, []);

  const publishResolved = useCallback((args: PublishResolvedArgs) => {
    setStore({
      ...args,
      status: "resolved",
      updatedAt: Date.now(),
    });
  }, []);

  const clear = useCallback(() => {
    setStore(null);
  }, []);

  return { current, publishPending, publishResolved, clear };
}
