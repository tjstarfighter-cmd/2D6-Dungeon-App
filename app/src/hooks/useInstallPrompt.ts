import { useEffect, useState } from "react";

// Captures the browser's `beforeinstallprompt` event so the InstallPill can
// fire it on demand. Also tracks whether the app is already installed (so
// the pill never shows post-install) and whether the user has permanently
// suppressed the pill via long-press / settings.
//
// Per-session dismissal lives in the consuming component — it's just
// useState, cleared on reload.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const PERM_KEY = "2d6d.installPillSuppressed";

export interface InstallPromptApi {
  /** True if the pill should be eligible to show right now. */
  canInstall: boolean;
  installed: boolean;
  permSuppressed: boolean;
  prompt: () => Promise<void>;
  suppressPermanently: () => void;
}

export function useInstallPrompt(): InstallPromptApi {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  });
  const [permSuppressed, setPermSuppressed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PERM_KEY) === "true";
  });

  useEffect(() => {
    function onBefore(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function prompt(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  function suppressPermanently(): void {
    localStorage.setItem(PERM_KEY, "true");
    setPermSuppressed(true);
  }

  return {
    canInstall: deferred != null && !installed && !permSuppressed,
    installed,
    permSuppressed,
    prompt,
    suppressPermanently,
  };
}
