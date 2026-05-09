import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

// Story 4.2 — shell-level "active pin" state. Identifies the currently
// selected pinned region (by tilesHash) so the right-column Log surface
// can flip to the matching per-room thread. Story 4.5 will hook this
// into auto-flip-on-pin-tap; for now MapV2 sets it imperatively when
// the user selects a pinned region's marker.

export interface ActivePin {
  tilesHash: string;
}

const ActivePinValueContext = createContext<ActivePin | null>(null);
const ActivePinSetContext = createContext<
  Dispatch<SetStateAction<ActivePin | null>>
>(() => {});

export function ActivePinProvider({ children }: { children: ReactNode }) {
  const [pin, setPin] = useState<ActivePin | null>(null);
  return (
    <ActivePinValueContext.Provider value={pin}>
      <ActivePinSetContext.Provider value={setPin}>
        {children}
      </ActivePinSetContext.Provider>
    </ActivePinValueContext.Provider>
  );
}

export function useActivePin(): ActivePin | null {
  return useContext(ActivePinValueContext);
}

export function useSetActivePin(): Dispatch<SetStateAction<ActivePin | null>> {
  return useContext(ActivePinSetContext);
}
