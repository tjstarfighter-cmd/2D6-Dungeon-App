import { useShellPreference } from "@/hooks/useShellPreference";

// Transitional toggle to flip between the classic Layout and the new
// ShellLayout. Both shells render this so the user can switch from either.
export function ShellPicker() {
  const [choice, setChoice] = useShellPreference();
  const next = choice === "new" ? "classic" : "new";
  const label = choice === "new" ? "Classic shell" : "New shell";
  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      title={`Switch to the ${label.toLowerCase()}`}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {label}
    </button>
  );
}
