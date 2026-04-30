import { DICE_FACES } from "@/lib/tables";

export function DiePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={selected}
              className={`flex size-10 items-center justify-center rounded-md border text-lg ${
                selected
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              }`}
            >
              {DICE_FACES[n - 1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
