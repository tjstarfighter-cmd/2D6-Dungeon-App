import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { MapDoc } from "@/types/map";

const MAPS_KEY = "2d6d.maps";
const ACTIVE_KEY = "2d6d.activeMap";

const DEFAULT_GRID_W = 40;
const DEFAULT_GRID_H = 30;

type MapsById = Record<string, MapDoc>;

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
  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createMapDoc(name = "New Map"): MapDoc {
  const now = new Date().toISOString();
  return {
    id: newId("map"),
    name,
    level: 1,
    ancestry: "Human",
    rooms: [],
    exits: [],
    notes: [],
    width: DEFAULT_GRID_W,
    height: DEFAULT_GRID_H,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Module-level stores --------------------------------------------------

let storeMaps: MapsById = readJson<MapsById>(MAPS_KEY, {});
let storeActive: string | null = readJson<string | null>(ACTIVE_KEY, null);

const mapsListeners = new Set<() => void>();
const activeListeners = new Set<() => void>();

function notifyMaps(): void {
  for (const fn of mapsListeners) fn();
}
function notifyActive(): void {
  for (const fn of activeListeners) fn();
}
function subscribeMaps(fn: () => void): () => void {
  mapsListeners.add(fn);
  return () => {
    mapsListeners.delete(fn);
  };
}
function subscribeActive(fn: () => void): () => void {
  activeListeners.add(fn);
  return () => {
    activeListeners.delete(fn);
  };
}
function getMapsSnapshot(): MapsById {
  return storeMaps;
}
function getActiveSnapshot(): string | null {
  return storeActive;
}
function setMaps(next: MapsById): void {
  storeMaps = next;
  writeJson(MAPS_KEY, next);
  notifyMaps();
}
function setActiveMap(next: string | null): void {
  storeActive = next;
  writeJson(ACTIVE_KEY, next);
  notifyActive();
}

// ---- Public hook ----------------------------------------------------------

export interface UseMapsResult {
  maps: MapDoc[];
  active: MapDoc | null;
  activeId: string | null;
  create: (name?: string) => MapDoc;
  update: (id: string, patch: Partial<MapDoc>) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  replaceAll: (next: MapDoc[], newActiveId?: string) => void;
}

export function useMaps(): UseMapsResult {
  const byId = useSyncExternalStore(subscribeMaps, getMapsSnapshot, getMapsSnapshot);
  const activeId = useSyncExternalStore(
    subscribeActive,
    getActiveSnapshot,
    getActiveSnapshot,
  );

  const maps = useMemo(
    () =>
      Object.values(byId).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [byId],
  );

  const active = activeId ? (byId[activeId] ?? null) : null;

  const create = useCallback((name?: string) => {
    const m = createMapDoc(name);
    setMaps({ ...storeMaps, [m.id]: m });
    setActiveMap(m.id);
    return m;
  }, []);

  const update = useCallback((id: string, patch: Partial<MapDoc>) => {
    const existing = storeMaps[id];
    if (!existing) return;
    setMaps({
      ...storeMaps,
      [id]: { ...existing, ...patch, updatedAt: new Date().toISOString() },
    });
  }, []);

  const remove = useCallback((id: string) => {
    if (!(id in storeMaps)) return;
    const next = { ...storeMaps };
    delete next[id];
    setMaps(next);
    if (storeActive === id) setActiveMap(null);
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveMap(id);
  }, []);

  const replaceAll = useCallback(
    (next: MapDoc[], newActiveId?: string) => {
      const map: MapsById = {};
      for (const m of next) map[m.id] = m;
      setMaps(map);
      setActiveMap(newActiveId ?? next[0]?.id ?? null);
    },
    [],
  );

  return { maps, active, activeId, create, update, remove, setActive, replaceAll };
}
