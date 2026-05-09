import { Suspense, lazy, useEffect } from "react";

// Story 1.2 ships a fullscreen Rules overlay so the [Rules] header button
// has a working destination today. Story 5.7 replaces this with a proper
// right slide-over (desktop) / full-screen takeover with state preservation
// and in-Rules search.

const RulesView = lazy(() => import("@/views/Rules"));

export function RulesOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rules"
      // Story 5.7 — phone keeps the full-screen takeover; desktop pins
      // the surface to the right column (~320px) just below the Shell
      // header so the Sheet and Map columns stay visible behind it.
      className="fixed inset-0 z-40 flex flex-col bg-zinc-50 dark:bg-zinc-950 lg:left-auto lg:right-0 lg:top-12 lg:w-80 lg:border-l lg:border-zinc-200 lg:shadow-xl dark:lg:border-zinc-800"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Rules
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Rules"
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Suspense
          fallback={
            <div className="text-sm text-zinc-500" role="status" aria-live="polite">
              Loading…
            </div>
          }
        >
          <RulesView onInAppNavigate={onClose} />
        </Suspense>
      </div>
    </div>
  );
}
