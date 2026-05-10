import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Story 6.3 — 6-step onboarding tour with anchored tooltips. The tour
// walks the player through the shell's primary surfaces immediately
// after wizard completion (Story 6.2). Skip/Esc and Done both persist
// the "seen" flag (browser-scoped per the AC) so subsequent character
// creations don't re-fire the tour.

const TOUR_SEEN_KEY = "2d6d.onboardingTourSeen";

export function isOnboardingTourSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function ackOnboardingTour(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // ignored — tour will re-fire next launch in private mode, which
    // is acceptable.
  }
}

export interface TourStep {
  /** Selectors tried in order; first match wins. Lets a step fall back
   *  to a coarser anchor when the ideal target isn't rendered (e.g.
   *  Tables NEXT only renders after a roll). */
  selectors: string[];
  title: string;
  body: string;
  /** Callback fired before the tooltip resolves its anchor. The host
   *  uses this to switch tabs so the target is visible. */
  prepare?: () => void;
}

export function OnboardingTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = useCallback(() => {
    ackOnboardingTour();
    onClose();
  }, [onClose]);

  function handleNext() {
    if (stepIndex >= steps.length - 1) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  // Esc behaves like Skip per the AC.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const step = steps[stepIndex];

  // Run prepare() (tab switching) on every step entry. useLayoutEffect
  // so the tab change is committed before we measure the anchor.
  useLayoutEffect(() => {
    step.prepare?.();
  }, [stepIndex, step]);

  // Measure the anchor after prepare() ran. The first measure runs on
  // a double rAF so a tab switch in prepare() has a frame to commit.
  // If the anchor still isn't found (lazy-loaded view, e.g. MapV2),
  // poll for ~1 s — this only happens on the first time a column is
  // visited in a session, and once mounted the chunk is cached.
  // Re-measure on resize/scroll while the step is active so the
  // tooltip tracks an anchor that moves.
  useEffect(() => {
    let cancelled = false;
    let r1 = 0;
    let r2 = 0;
    let retryHandle = 0;
    let attempt = 0;
    const MAX_ATTEMPTS = 12;
    function measure() {
      if (cancelled) return;
      const el = findAnchor(step.selectors);
      const next = el ? el.getBoundingClientRect() : null;
      setRect(next);
      if (!next && attempt < MAX_ATTEMPTS) {
        attempt += 1;
        retryHandle = window.setTimeout(measure, 80);
      }
    }
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(measure);
    });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      if (retryHandle) window.clearTimeout(retryHandle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [stepIndex, step]);

  const positioned = rect ? computeTooltipPosition(rect) : null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Onboarding tour, step ${stepIndex + 1} of ${steps.length}`}
      className="pointer-events-none fixed inset-0 z-40"
    >
      {/* Highlight ring around the anchor. Pointer-events stay off so
          the underlying shell remains interactive (the player can
          poke the highlighted target if they want). */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-emerald-400 ring-offset-2 ring-offset-zinc-50 transition-all duration-150 dark:ring-offset-zinc-950"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      {positioned && (
        <div
          className="pointer-events-auto absolute w-72 max-w-[90vw] rounded-lg border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={positioned}
        >
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Step {stepIndex + 1} of {steps.length}
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</h3>
          <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
            {step.body}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {stepIndex >= steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      )}
      {/* Anchor not found — render a centered fallback so the tour can
          still be skipped. */}
      {!rect && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Step {stepIndex + 1} of {steps.length}
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            (Couldn't anchor this step — skip to continue.)
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {stepIndex >= steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function findAnchor(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const matches = document.querySelectorAll<HTMLElement>(sel);
    for (const el of matches) {
      if (el.offsetParent !== null) return el;
    }
    // Fall back to the first match even if invisible — better than nothing.
    if (matches.length > 0) return matches[0];
  }
  return null;
}

interface PositionStyle {
  top: number;
  left: number;
}

function computeTooltipPosition(rect: DOMRect): PositionStyle {
  const TOOLTIP_W = 288; // w-72
  const TOOLTIP_H_EST = 160;
  const GAP = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer below the anchor; flip above if there isn't room.
  let top = rect.bottom + GAP;
  if (top + TOOLTIP_H_EST > vh - 8) {
    const above = rect.top - TOOLTIP_H_EST - GAP;
    if (above >= 8) top = above;
  }
  // Centre horizontally on the anchor, clamped into the viewport.
  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  left = Math.max(8, Math.min(vw - TOOLTIP_W - 8, left));
  return { top: Math.max(8, top), left };
}
