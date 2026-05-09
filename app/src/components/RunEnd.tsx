import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Story 6.10 — bridge state for the run-end modal. Two callers fire
// it: Epic 5 Story 5.6 (combat HP→0) and Story 6.9 (RFUT1 death
// outcome). Shell mounts a single RunEndModal driven by this state so
// both paths funnel into the same UI.

export interface RunEndCause {
  kind: "combat" | "non_combat";
  /** Trigger-source description: enemy name (combat) or trap source +
   *  RFUT1 roll detail (non-combat). Surfaced verbatim in the modal. */
  source: string;
  /** Optional room label so the modal can render "fell to a trap in
   *  Hall 2" when the trigger knows where the player was. */
  roomLabel?: string;
}

export interface RunEndApi {
  cause: RunEndCause | null;
  triggerRunEnd: (cause: RunEndCause) => void;
  clearRunEnd: () => void;
}

const noop: RunEndApi = {
  cause: null,
  triggerRunEnd: () => {},
  clearRunEnd: () => {},
};

const RunEndContext = createContext<RunEndApi>(noop);

export function RunEndProvider({ children }: { children: ReactNode }) {
  const [cause, setCause] = useState<RunEndCause | null>(null);
  const api = useMemo<RunEndApi>(
    () => ({
      cause,
      triggerRunEnd: (c) => setCause(c),
      clearRunEnd: () => setCause(null),
    }),
    [cause],
  );
  return (
    <RunEndContext.Provider value={api}>{children}</RunEndContext.Provider>
  );
}

export function useRunEnd(): RunEndApi {
  return useContext(RunEndContext);
}
