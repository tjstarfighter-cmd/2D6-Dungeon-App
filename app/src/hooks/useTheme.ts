import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "2d6d.theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Default dark per project preference; only fall back to system if the user
  // has explicitly chosen a system preference and it's light.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * Theme hook. Persists choice to localStorage and toggles `.dark` on <html>.
 * Defaults to dark per the project's stated preference.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
