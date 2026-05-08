import { useRef, useState, type MouseEvent } from "react";

import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const LONG_PRESS_MS = 600;

/**
 * Per-session install pill. Visible while the browser has a deferred
 * install prompt available, the app isn't already installed, and the
 * user hasn't permanently suppressed it.
 *
 * `compact` collapses the label so the phone header just shows `⊕`.
 */
export function InstallPill({ compact = false }: { compact?: boolean }) {
  const { canInstall, prompt, suppressPermanently } = useInstallPrompt();
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const longPress = useRef<{ timer: number | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  if (!canInstall || sessionDismissed) return null;

  function startLongPress() {
    longPress.current.fired = false;
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      suppressPermanently();
    }, LONG_PRESS_MS);
  }
  function cancelLongPress() {
    if (longPress.current.timer != null) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  }

  function handleClick() {
    // If long-press already fired, swallow the click so we don't also
    // open the install prompt the user was trying to permanently dismiss.
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    void prompt();
  }

  function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    setSessionDismissed(true);
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 text-xs text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100"
      role="group"
      aria-label="Install app"
    >
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        aria-label="Install app"
        title="Install (long-press to never show again)"
        className="rounded-l-full px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/60"
      >
        ⊕{compact ? "" : " Install"}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install pill for this session"
        title="Dismiss for this session"
        className="rounded-r-full border-l border-amber-400 px-1.5 py-0.5 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-900/60"
      >
        ✕
      </button>
    </span>
  );
}
