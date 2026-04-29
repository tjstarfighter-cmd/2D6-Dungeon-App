import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { MapDocV2 } from "@/types/mapv2";

const MAPS_KEY = "2d6d.mapsV2";
const ACTIVE_KEY = "2d6d.activeMapV2";

const DEFAULT_GRID_W = 25;
const DEFAULT_GRID_H = 25;

type MapsById = Record<string, MapDocV2>;

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

export interface CreateMapV2Options {
  name?: string;
  gridW?: number;
  gridH?: number;
}

export function createMapDocV2(opts: CreateMapV2Options = {}): MapDocV2 {
  const now = new Date().toISOString();
  return {
    id: newId("mapv2"),
    name: opts.name ?? "New Map",
    level: 1,
    ancestry: "Human",
    gridW: opts.gridW ?? DEFAULT_GRID_W,
    gridH: opts.gridH ?? DEFAULT_GRID_H,
    walls: [],
    regions: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
    schema: 2,
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

export interface UseMapsV2Result {
  maps: MapDocV2[];
  active: MapDocV2 | null;
  activeId: string | null;
  create: (opts?: CreateMapV2Options) => MapDocV2;
  update: (id: string, patch: Partial<MapDocV2>) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  replaceAll: (next: MapDocV2[], newActiveId?: string) => void;
}

export function useMapsV2(): UseMapsV2Result {
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

  const create = useCallback((opts?: CreateMapV2Options) => {
    const m = createMapDocV2(opts);
    setMaps({ ...storeMaps, [m.id]: m });
    setActiveMap(m.id);
    return m;
  }, []);

  const update = useCallback((id: string, patch: Partial<MapDocV2>) => {
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
    (next: MapDocV2[], newActiveId?: string) => {
      const map: MapsById = {};
      for (const m of next) map[m.id] = m;
      setMaps(map);
      setActiveMap(newActiveId ?? next[0]?.id ?? null);
    },
    [],
  );

  return { maps, active, activeId, create, update, remove, setActive, replaceAll };
}
