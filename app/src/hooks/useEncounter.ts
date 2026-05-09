import { useCallback, useSyncExternalStore } from "react";

import type { CombatLogEntry, EnemyState, Encounter } from "@/types/combat";

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
  /** Story 5.2 — pre-combat creature picker can populate the encounter
   *  with one or more enemies up front. When omitted, start() falls back
   *  to a single auto-generated blank for backwards compatibility. */
  initialEnemies?: Partial<EnemyState>[];
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
  setOutnumbered: (enabled: boolean) => void;
  /** Story 5.4 — append an auto-generated entry to the internal combat
   *  log (e.g. round transitions, damage applied). */
  appendLogEntry: (text: string) => void;
  /** Story 5.4 — append a manual player-authored note to the log. */
  addManualNote: (text: string) => void;
}

// Detect a round-1 kill in a multi-enemy fight and stamp r1Kill so that
// Fearful Momentum (+2 player Shift in round 2 only) can fire. Used by both
// damageEnemy and updateEnemy paths since the player can drop an enemy via
// Quick damage or by editing HP directly.
function withR1KillDetected(prev: Encounter, next: Encounter): Encounter {
  if (next.r1Kill || next.round !== 1) return next;
  const prevAlive = prev.enemies.filter((e) => e.hp.current > 0).length;
  const nextAlive = next.enemies.filter((e) => e.hp.current > 0).length;
  if (prevAlive > 1 && nextAlive < prevAlive) {
    return { ...next, r1Kill: true };
  }
  return next;
}

export function useEncounter(): UseEncounterResult {
  const encounter = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const start = useCallback(
    (characterId: string, opts?: StartEncounterOpts) => {
      const initial = opts?.initialEnemies;
      const enemies: EnemyState[] =
        initial && initial.length > 0
          ? initial.map((init) => {
              const base = makeEnemy(init.name, init.hp?.max);
              return {
                ...base,
                ...init,
                id: base.id,
                hp: {
                  max: init.hp?.max ?? base.hp.max,
                  current: init.hp?.current ?? init.hp?.max ?? base.hp.max,
                },
              };
            })
          : [makeEnemy()];
      const e: Encounter = {
        id: newId("enc"),
        characterId,
        enemies,
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
      const prev = store;
      const next: Encounter = {
        ...prev,
        enemies: prev.enemies.map((e) =>
          e.id === enemyId
            ? {
                ...e,
                ...patch,
                hp: patch.hp ? { ...e.hp, ...patch.hp } : e.hp,
              }
            : e,
        ),
      };
      setStore(withR1KillDetected(prev, next));
    },
    [],
  );

  // Story 5.4 — log helpers. Both kinds (auto/note) share one shape so
  // the renderer can stay simple.
  function appendEntry(prev: Encounter, kind: "auto" | "note", text: string): Encounter {
    const entry: CombatLogEntry = {
      id: newId("log"),
      ts: new Date().toISOString(),
      round: prev.round,
      kind,
      text,
    };
    return { ...prev, log: [...(prev.log ?? []), entry] };
  }

  const appendLogEntry = useCallback((text: string) => {
    if (!store) return;
    setStore(appendEntry(store, "auto", text));
  }, []);

  const addManualNote = useCallback((text: string) => {
    if (!store) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setStore(appendEntry(store, "note", trimmed));
  }, []);

  const damageEnemy = useCallback((enemyId: string, amount: number) => {
    if (!store) return;
    const prev = store;
    let logged = prev;
    const next: Encounter = {
      ...prev,
      enemies: prev.enemies.map((e) => {
        if (e.id !== enemyId) return e;
        const newHp = Math.max(0, e.hp.current - amount);
        const wasAlive = e.hp.current > 0;
        const isDead = newHp === 0;
        const name = e.name || "enemy";
        logged = appendEntry(
          logged,
          "auto",
          `Damage ${name} for ${amount} (HP ${newHp}/${e.hp.max})`,
        );
        if (wasAlive && isDead) {
          logged = appendEntry(logged, "auto", `${name} defeated`);
        }
        return { ...e, hp: { ...e.hp, current: newHp } };
      }),
    };
    setStore(withR1KillDetected(prev, { ...next, log: logged.log }));
  }, []);

  const nextRound = useCallback(() => {
    if (!store) return;
    const prev = store;
    const advanced = { ...prev, round: prev.round + 1 };
    setStore(appendEntry(advanced, "auto", `Round ${prev.round} → ${advanced.round}`));
  }, []);

  const setOutnumbered = useCallback((enabled: boolean) => {
    if (!store) return;
    setStore({ ...store, outnumberedEnabled: enabled });
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
    setOutnumbered,
    appendLogEntry,
    addManualNote,
  };
}
