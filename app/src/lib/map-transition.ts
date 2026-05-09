// Story 6.6 — per-map transition flags. Tracks which one-time flows
// have already fired for each map id (rest/ration prompt + entrance
// banner) so revisits don't re-fire them. Stored in localStorage so
// the flags survive reloads but are scoped per-browser, matching the
// rest of the app's state model.

const KEY = "2d6d.mapTransitionFlags";

export interface MapTransitionFlags {
  restPromptResolved?: boolean;
  entranceBannerDismissed?: boolean;
}

type Store = Record<string, MapTransitionFlags>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(next: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignored — the worst case is the prompts re-fire on reload.
  }
}

export function getMapTransitionFlags(mapId: string): MapTransitionFlags {
  return readStore()[mapId] ?? {};
}

export function setMapTransitionFlag<K extends keyof MapTransitionFlags>(
  mapId: string,
  key: K,
  value: MapTransitionFlags[K],
): void {
  const store = readStore();
  store[mapId] = { ...(store[mapId] ?? {}), [key]: value };
  writeStore(store);
}
