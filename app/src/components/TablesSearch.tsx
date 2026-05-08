import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

// Bridge so the Shell's global hotkeys (Cmd/Ctrl+K, /) can summon focus on
// the Tables search input that physically lives inside views/Tables. Same
// trampoline pattern as MapTools — Tables registers a handle on mount and
// the Shell reads the latest one at hotkey time.

export type TablesSearchHandle = () => void;

type HandleRef = MutableRefObject<TablesSearchHandle | null>;

const TablesSearchContext = createContext<HandleRef | null>(null);

export function TablesSearchProvider({ children }: { children: ReactNode }) {
  const ref = useRef<TablesSearchHandle | null>(null);
  return (
    <TablesSearchContext.Provider value={ref}>
      {children}
    </TablesSearchContext.Provider>
  );
}

/**
 * Register a focus handler. Stable trampoline — registered handle is
 * rebound to the latest closure each render via a ref, so Shell can call
 * `tablesSearch.focus()` and always reach the current Tables input.
 */
export function useRegisterTablesSearch(focus: TablesSearchHandle) {
  const ctxRef = useContext(TablesSearchContext);
  const liveRef = useRef(focus);
  // Keep the live ref pointing at the latest closure. Done in an effect
  // (not during render) per react-hooks/refs.
  useEffect(() => {
    liveRef.current = focus;
  });

  useEffect(() => {
    if (!ctxRef) return;
    const trampoline: TablesSearchHandle = () => liveRef.current?.();
    ctxRef.current = trampoline;
    return () => {
      if (ctxRef.current === trampoline) ctxRef.current = null;
    };
  }, [ctxRef]);
}

/**
 * Returns a stable callable that reads the latest registered focus
 * handler on every invocation. Capturing it at render time would
 * snapshot a `null` if Tables mounts after the consumer.
 */
export function useTablesSearch(): TablesSearchHandle {
  const ctxRef = useContext(TablesSearchContext);
  return () => ctxRef?.current?.();
}
