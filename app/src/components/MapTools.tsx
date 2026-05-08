import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

// Bridge so the Shell's map-area tab strip can summon Map actions that
// physically live inside MapV2 (Setup overlay, Roll panel, undo stack,
// zoom-to-fit). MapV2 registers its handlers via useEffect on mount;
// the tab strip's support buttons read the latest registered handlers
// at click time.
//
// Used by Story 1.11 to satisfy the AC "right side of the strip shows
// ⚙ Setup · 🎲 Roll · ↶ Undo · ⌖ Zoom buttons" without lifting the
// MapV2 internal state up to the Shell.

export interface MapToolsHandle {
  openSetup: () => void;
  openRoll: () => void;
  undo: () => void;
  zoomFit: () => void;
}

type HandleRef = MutableRefObject<MapToolsHandle | null>;

const MapToolsContext = createContext<HandleRef | null>(null);

export function MapToolsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<MapToolsHandle | null>(null);
  return (
    <MapToolsContext.Provider value={ref}>{children}</MapToolsContext.Provider>
  );
}

/**
 * Register MapV2's tool handlers. Stable trampoline pattern — the registered
 * handle is rebound to the latest closure each render via a ref, so the
 * Shell can call e.g. `mapTools.openSetup()` and always reach the current
 * MapV2's handler without re-registering.
 */
export function useRegisterMapTools(handlers: MapToolsHandle) {
  const ctxRef = useContext(MapToolsContext);
  const liveRef = useRef(handlers);
  // Keep the live ref pointing at the latest closures. Done in an effect
  // (not during render) per react-hooks/refs.
  useEffect(() => {
    liveRef.current = handlers;
  });

  useEffect(() => {
    if (!ctxRef) return;
    const trampoline: MapToolsHandle = {
      openSetup: () => liveRef.current.openSetup(),
      openRoll: () => liveRef.current.openRoll(),
      undo: () => liveRef.current.undo(),
      zoomFit: () => liveRef.current.zoomFit(),
    };
    ctxRef.current = trampoline;
    return () => {
      if (ctxRef.current === trampoline) ctxRef.current = null;
    };
  }, [ctxRef]);
}

/**
 * Returns a stable callable that reads the latest registered handle on every
 * invocation. Capturing it at render time would snapshot a `null` if MapV2
 * mounts after the consumer (Story 1.11's tab strip).
 */
export function useMapTools(): MapToolsHandle {
  const ctxRef = useContext(MapToolsContext);
  return {
    openSetup: () => ctxRef?.current?.openSetup(),
    openRoll: () => ctxRef?.current?.openRoll(),
    undo: () => ctxRef?.current?.undo(),
    zoomFit: () => ctxRef?.current?.zoomFit(),
  };
}
