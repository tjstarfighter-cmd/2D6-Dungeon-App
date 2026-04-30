import { useCallback, useSyncExternalStore } from "react";

import type { EnemyState, Encounter } from "@/types/combat";

const KEY = "2d6d.encounter";

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

let store: Encounter | null = readJson<Encounter | null>(KEY, null);
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
function getSnapshot(): Encounter | null {
  return store;
}
function setStore(next: Encounter | null): void {
  store = next;
  writeJson(KEY, next);
  notify();
}

function makeEnemy(name = "Enemy", maxHp = 10): EnemyState {
  return {
    id: newId("e"),
    name,
    hp: { current: maxHp, max: maxHp },
    shift: 0,
    manoeuvres: "",
    interrupt: "",
    notes: "",
  };
}

export interface StartEncounterOpts {
  /** v2 map region tilesHash. Stored on the encounter so the End-combat
   *  dialog can offer "mark cleared?" for the room the fight happened in. */
  roomId?: string;
  /** Snapshot of the region's label at start time. */
  roomLabel?: string;
}

export interface UseEncounterResult {
  encounter: Encounter | null;
  start: (characterId: string, opts?: StartEncounterOpts) => void;
  end: () => void;
  addEnemy: (init?: Partial<EnemyState>) => void;
  removeEnemy: (enemyId: string) => void;
  updateEnemy: (enemyId: string, patch: Partial<EnemyState>) => void;
  damageEnemy: (enemyId: string, amount: number) => void;
  nextRound: () => void;
}

export function useEncounter(): UseEncounterResult {
  const encounter = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const start = useCallback(
    (characterId: string, opts?: StartEncounterOpts) => {
      const e: Encounter = {
        id: newId("enc"),
        characterId,
        enemies: [makeEnemy()],
        round: 1,
        active: true,
        startedAt: new Date().toISOString(),
        roomId: opts?.roomId,
        roomLabel: opts?.roomLabel,
      };
      setStore(e);
    },
    [],
  );

  const end = useCallback(() => {
    setStore(null);
  }, []);

  const addEnemy = useCallback((init?: Partial<EnemyState>) => {
    if (!store) return;
    const base = makeEnemy(init?.name, init?.hp?.max);
    const enemy: EnemyState = {
      ...base,
      ...init,
      // Always preserve a freshly-generated id so re-adds don't collide.
      id: base.id,
      // hp must be a full {current, max} pair; use the override's max when given.
      hp: {
        max: init?.hp?.max ?? base.hp.max,
        current: init?.hp?.current ?? init?.hp?.max ?? base.hp.current,
      },
    };
    setStore({ ...store, enemies: [...store.enemies, enemy] });
  }, []);

  const removeEnemy = useCallback((enemyId: string) => {
    if (!store) return;
    setStore({
      ...store,
      enemies: store.enemies.filter((e) => e.id !== enemyId),
    });
  }, []);

  const updateEnemy = useCallback(
    (enemyId: string, patch: Partial<EnemyState>) => {
      if (!store) return;
      setStore({
        ...store,
        enemies: store.enemies.map((e) =>
          e.id === enemyId
            ? {
                ...e,
                ...patch,
                hp: patch.hp ? { ...e.hp, ...patch.hp } : e.hp,
              }
            : e,
        ),
      });
    },
    [],
  );

  const damageEnemy = useCallback((enemyId: string, amount: number) => {
    if (!store) return;
    setStore({
      ...store,
      enemies: store.enemies.map((e) =>
        e.id === enemyId
          ? {
              ...e,
              hp: { ...e.hp, current: Math.max(0, e.hp.current - amount) },
            }
          : e,
      ),
    });
  }, []);

  const nextRound = useCallback(() => {
    if (!store) return;
    setStore({ ...store, round: store.round + 1 });
  }, []);

  return {
    encounter,
    start,
    end,
    addEnemy,
    removeEnemy,
    updateEnemy,
    damageEnemy,
    nextRound,
  };
}
