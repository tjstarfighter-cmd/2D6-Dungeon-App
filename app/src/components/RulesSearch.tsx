import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

// Story 5.8 — bridge so the Shell's "/" hotkey can focus the in-Rules
// search input that physically lives inside views/Rules. Same pattern
// as TablesSearch / MapTools. Only registered while the Rules overlay
// is mounted, so Shell can fall back to Tables when Rules is closed.

export type RulesSearchHandle = () => void;

type HandleRef = MutableRefObject<RulesSearchHandle | null>;

const RulesSearchContext = createContext<HandleRef | null>(null);

export function RulesSearchProvider({ children }: { children: ReactNode }) {
  const ref = useRef<RulesSearchHandle | null>(null);
  return (
    <RulesSearchContext.Provider value={ref}>
      {children}
    </RulesSearchContext.Provider>
  );
}

export function useRegisterRulesSearch(focus: RulesSearchHandle) {
  const ctxRef = useContext(RulesSearchContext);
  const liveRef = useRef(focus);
  useEffect(() => {
    liveRef.current = focus;
  });

  useEffect(() => {
    if (!ctxRef) return;
    const trampoline: RulesSearchHandle = () => liveRef.current?.();
    ctxRef.current = trampoline;
    return () => {
      if (ctxRef.current === trampoline) ctxRef.current = null;
    };
  }, [ctxRef]);
}

/**
 * Returns a callable that focuses the Rules search input *if one is
 * currently registered* (i.e. the Rules overlay is mounted) and reports
 * whether it did so. Lets Shell's "/" hotkey route to Rules when open
 * and fall through to Tables otherwise.
 */
export function useTryFocusRulesSearch(): () => boolean {
  const ctxRef = useContext(RulesSearchContext);
  return () => {
    const handler = ctxRef?.current;
    if (!handler) return false;
    handler();
    return true;
  };
}
