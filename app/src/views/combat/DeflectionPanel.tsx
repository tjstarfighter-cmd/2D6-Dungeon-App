import type { DeflectionEval } from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import type { ArmourSlot } from "@/types/character";

export function DeflectionPanel({
  armour,
  deflections,
  selectedIdx,
  onSelect,
  totalDeflection,
}: {
  armour: ArmourSlot[];
  deflections: DeflectionEval[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  totalDeflection: number;
}) {
  return (
    <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Armour deflection
      </h3>
      <p className="mb-1 text-xs text-zinc-500">
        Pick at most one piece — only one armour deflection applies per attack.
      </p>
      {armour.map((a, i) => {
        const d = deflections[i];
        const selected = selectedIdx === i;
        const matchAny = d.matches.some(Boolean);
        return (
          <label
            key={i}
            className={`mb-1 flex flex-wrap items-center gap-2 rounded px-2 py-1 ${
              d.fullMatch
                ? "bg-emerald-100 dark:bg-emerald-950/40"
                : matchAny
                  ? "bg-amber-50 dark:bg-amber-950/30"
                  : ""
            }`}
          >
            <input
              type="radio"
              name="enemy-deflection-piece"
              checked={selected}
              onChange={() => onSelect(i)}
              className="size-4 border-zinc-400"
            />
            <span className="font-medium">{a.piece || "(unnamed)"}</span>
            <span className="font-mono text-xs">
              {d.diceSet.length === 0 ? (
                <span className="text-zinc-400">unparseable</span>
              ) : (
                d.diceSet.map((die, j) => (
                  <span
                    key={j}
                    className={
                      d.matches[j]
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-500"
                    }
                  >
                    {DICE_FACES[die - 1]}
                    {j < d.diceSet.length - 1 ? " " : ""}
                  </span>
                ))
              )}
            </span>
            <span className="text-xs text-zinc-500">{a.modifier || "—"}</span>
            {d.fullMatch && (
              <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                DEFLECTS
              </span>
            )}
          </label>
        );
      })}
      <label className="mb-1 flex flex-wrap items-center gap-2 rounded px-2 py-1">
        <input
          type="radio"
          name="enemy-deflection-piece"
          checked={selectedIdx === null}
          onChange={() => onSelect(null)}
          className="size-4 border-zinc-400"
        />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          None — take the full hit
        </span>
      </label>
      <p className="mt-2 text-sm">
        Deflection:{" "}
        <strong className="text-emerald-700 dark:text-emerald-400">
          −{totalDeflection}
        </strong>
      </p>
    </div>
  );
}
