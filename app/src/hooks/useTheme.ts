import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "auto";
const STORAGE_KEY = "2d6d.theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "auto";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

// Resolve the effective theme — the binary value actually applied to the DOM.
// "auto" follows the OS preference via prefers-color-scheme.
function resolveEffective(theme: Theme): "light" | "dark" {
  if (theme !== "auto") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Theme hook. Persists the user's pick (light / dark / auto) to localStorage
 * and toggles `.dark` on <html> based on the effective theme. In `auto` mode
 * the effective value follows the OS preference and updates live when it
 * changes.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.classList.toggle("dark", resolveEffective(theme) === "dark");
    };
    apply();
    localStorage.setItem(STORAGE_KEY, theme);

    if (theme !== "auto") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return [theme, setTheme];
}
