import { useEffect, useRef } from "react";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useState } from "react";

// Story 8.1 — quota watcher. Polls navigator.storage.estimate() on
// mount and every 60s while the tab has focus. ≥80% fires a one-shot
// soft toast; ≥95% opens the hard modal that nudges the player into
// Backup & restore.

const SOFT_THRESHOLD = 0.8;
const HARD_THRESHOLD = 0.95;
const POLL_MS = 60_000;

export function StorageQuotaWatcher({
  onOpenBackup,
}: {
  onOpenBackup: () => void;
}) {
  const toast = useToast();
  const softFiredRef = useRef(false);
  const [hardOpen, setHardOpen] = useState<{ pct: number } | null>(null);
  // Stable refs so the polling loop doesn't tear down on toast-api
  // identity flips.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    let stopped = false;

    async function check() {
      if (stopped) return;
      const api =
        typeof navigator !== "undefined" &&
        navigator.storage &&
        typeof navigator.storage.estimate === "function"
          ? navigator.storage
          : null;
      if (!api) return;
      try {
        const est = await api.estimate();
        const used = typeof est.usage === "number" ? est.usage : 0;
        const quota = typeof est.quota === "number" ? est.quota : 0;
        if (!quota) return;
        const pct = used / quota;
        if (pct >= HARD_THRESHOLD) {
          setHardOpen({ pct });
        } else if (pct >= SOFT_THRESHOLD && !softFiredRef.current) {
          softFiredRef.current = true;
          const id = toastRef.current.success({
            message: `Storage ${(pct * 100).toFixed(0)}% used. Consider exporting old runs.`,
          });
          // success toasts auto-fade after ~3s; we don't need an undo.
          void id;
        }
      } catch {
        // estimate() can throw in private mode / sandboxed contexts.
        // Quiet failure per AC — no false threshold, no user-visible
        // error.
      }
    }

    check();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!hardOpen) return null;
  return (
    <Modal
      title="Storage almost full"
      onClose={() => setHardOpen(null)}
      footer={
        <>
          <button
            type="button"
            onClick={() => setHardOpen(null)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              setHardOpen(null);
              onOpenBackup();
            }}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Backup &amp; restore
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Local storage is approximately {(hardOpen.pct * 100).toFixed(0)}%
        used. Export old runs and delete to free space — without action
        the browser may reject new writes.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Estimates are best-effort and reported by the browser; the exact
        number may vary slightly between checks.
      </p>
    </Modal>
  );
}
