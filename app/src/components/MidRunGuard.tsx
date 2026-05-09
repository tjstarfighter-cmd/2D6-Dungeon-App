import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Modal } from "@/components/Modal";
import { useEncounter } from "@/hooks/useEncounter";

// Story 6.14 — guard modal for character/map switches during a live
// combat encounter. Callers wrap their switch action in
// `requestSwitch(intent)`. When no encounter is active the intent runs
// immediately; otherwise the guard modal interposes with three
// controls.

export interface MidRunGuardApi {
  /** Run `intent` now if no combat is live, else queue it behind the
   *  guard modal. */
  requestSwitch: (intent: () => void) => void;
}

const noop: MidRunGuardApi = { requestSwitch: () => {} };
const MidRunGuardContext = createContext<MidRunGuardApi>(noop);

export function MidRunGuardProvider({ children }: { children: ReactNode }) {
  const { encounter, end } = useEncounter();
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Live ref so requestSwitch always sees the latest encounter without
  // depending on the api's identity.
  const liveEncounterRef = useRef(encounter);
  useEffect(() => {
    liveEncounterRef.current = encounter;
  });

  const api = useMemo<MidRunGuardApi>(
    () => ({
      requestSwitch: (intent) => {
        if (!liveEncounterRef.current) {
          intent();
        } else {
          // Wrap so React's state setter doesn't try to call it
          // expecting (prev) => next.
          setPending(() => intent);
        }
      },
    }),
    [],
  );

  function runIntent() {
    const intent = pending;
    setPending(null);
    intent?.();
  }

  return (
    <MidRunGuardContext.Provider value={api}>
      {children}
      {pending && (
        <Modal
          title="End current encounter first?"
          onClose={() => setPending(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // "Switch anyway": discard combat state, no summary.
                  end();
                  runIntent();
                }}
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-900/40"
              >
                Switch anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  // "End encounter": same end() — Story 5.5's close-
                  // summary flow can't be auto-triggered from here
                  // without coupling to Combat's local UI state. The
                  // user is told this in the modal copy so they know
                  // to close encounters with summaries themselves
                  // when they want a logged outcome.
                  end();
                  runIntent();
                }}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                End encounter
              </button>
            </>
          }
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Combat state will be lost. To capture an outcome instead,
            cancel here, switch to the Combat tab, and use{" "}
            <strong>End combat</strong> to post a Combat summary entry
            first.
          </p>
        </Modal>
      )}
    </MidRunGuardContext.Provider>
  );
}

export function useMidRunGuard(): MidRunGuardApi {
  return useContext(MidRunGuardContext);
}
