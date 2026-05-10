import { Suspense, lazy, useEffect, useMemo, type ReactNode } from "react";

// Story 6.2 — 5-step character-creation wizard. Lazily loads the
// tables JSON so the bundle isn't paid for until a player actually
// creates a character. Centered card on desktop, full-screen takeover
// on phone (the modal styling is inline rather than via <Modal> so we
// can do the responsive layout switch).

const WizardBody = lazy(() => import("./CharacterCreateWizard.body"));

export interface CreatedCharacterInput {
  name: string;
  weapon: string;
  manoeuvres: { name: string; diceSet: string; modifier: string }[];
  armour: { piece: string; diceSet: string; modifier: string };
  scroll: { name: string; modifier: string };
}

export function CharacterCreateWizard({
  onCreate,
  onCancel,
}: {
  onCreate: (input: CreatedCharacterInput) => void;
  onCancel: () => void;
}) {
  // Confirm-on-Esc/Cancel discards; matches the spec's "confirm
  // cancellation" wording.
  function confirmCancel() {
    if (window.confirm("Discard this new character? Your selections will be lost.")) {
      onCancel();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        confirmCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // confirmCancel/onCancel are stable enough across the wizard's life;
    // the listener only needs to call the latest cancel path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create character"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950 lg:items-center lg:justify-center lg:bg-zinc-900/60 dark:lg:bg-zinc-950/70"
    >
      <div className="flex h-full w-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 lg:h-auto lg:max-h-[85vh] lg:w-[min(36rem,92vw)] lg:rounded-lg lg:border lg:border-zinc-200 lg:bg-white lg:shadow-2xl dark:lg:border-zinc-700 dark:lg:bg-zinc-900">
        <Suspense
          fallback={
            <WizardChrome onCancel={confirmCancel} stepIndex={0} stepLabel="Loading…">
              <p className="text-sm text-zinc-500">Loading rules…</p>
              <span />
            </WizardChrome>
          }
        >
          <WizardBody onCreate={onCreate} onCancel={confirmCancel} />
        </Suspense>
      </div>
    </div>
  );
}

// Shared chrome (header + footer slots). The body imports this so the
// fallback above shares the same layout shell.
export function WizardChrome({
  onCancel,
  stepIndex,
  stepLabel,
  children,
}: {
  onCancel: () => void;
  stepIndex: number;
  stepLabel: string;
  children: [ReactNode, ReactNode];
}) {
  const [body, footer] = children;
  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Step {stepIndex + 1} of 5
          </div>
          <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">{stepLabel}</h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{body}</div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {footer}
      </footer>
    </>
  );
}

// Re-export the input type so the body file stays self-contained.
export function useWizardSteps(): readonly { key: string; label: string }[] {
  return useMemo(
    () =>
      [
        { key: "name", label: "Name" },
        { key: "weapon", label: "Weapon" },
        { key: "manoeuvres", label: "Starting Manoeuvres" },
        { key: "armour", label: "Starting Armour" },
        { key: "scroll", label: "Starting Scroll" },
      ] as const,
    [],
  );
}

// Convenience: starting-kit display strings used by Step 5's footer.
export const STARTING_KIT_ITEMS = [
  "Potion of Healing",
  "flint & steel",
  "lantern",
  "3 rations",
  "pouch",
  "wax sealing kit",
  "large backpack",
] as const;

export const STARTING_STATS_LABEL =
  "Shift +2 · Discipline +1 · Precision 0 · HP 10/10 · Level 1 · XP 0";
