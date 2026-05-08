import { useTheme, type Theme } from "@/hooks/useTheme";

// Desktop "theme toggle" — single button that cycles Light → Dark → Auto.
// One tap advances; this satisfies the "tap the theme toggle" AC while
// keeping Auto reachable on desktop. Phone exposes the same three options
// as a segmented control via <ThemePicker>.
const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "auto",
  auto: "light",
};

const LABEL: Record<Theme, { glyph: string; text: string }> = {
  light: { glyph: "☀️", text: "Light" },
  dark: { glyph: "🌙", text: "Dark" },
  auto: { glyph: "🖥️", text: "Auto" },
};

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const { glyph, text } = LABEL[theme];
  const next = NEXT[theme];
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${text}. Tap to switch to ${LABEL[next].text}.`}
      title={`Theme: ${text} — tap for ${LABEL[next].text}`}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {glyph} {text}
    </button>
  );
}

// Phone variant — segmented 3-button picker for the overflow menu.
export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  const options: Theme[] = ["light", "dark", "auto"];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
      {options.map((opt) => {
        const { glyph, text } = LABEL[opt];
        const selected = theme === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(opt)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {glyph} {text}
          </button>
        );
      })}
    </div>
  );
}
