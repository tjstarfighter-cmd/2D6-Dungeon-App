import { createContext, useContext, type ReactNode } from "react";

// Lets descendants of either shell request that the Combat view be shown.
// Both shells render <Outlet /> internally, so a child view (e.g. the map's
// region panel) has no direct handle on overlay state. The provider here is
// the bridge: ShellLayout binds it to its real overlay state, classic Layout
// binds it to a plain navigate("/combat") fallback.
//
// API kept small on purpose — extend with openTables/openRules/etc. only when
// a concrete caller needs it. No-op default is intentional so unprovided
// trees (tests, presenter) don't crash.
export interface OverlayApi {
  openCombat: () => void;
}

const noop: OverlayApi = {
  openCombat: () => {},
};

const OverlayContext = createContext<OverlayApi>(noop);

export function OverlayProvider({
  value,
  children,
}: {
  value: OverlayApi;
  children: ReactNode;
}) {
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlayApi(): OverlayApi {
  return useContext(OverlayContext);
}
