import { useMemo } from "react";

import { useTablesData } from "@/data/lazy";
import type { TableRow } from "@/types/tables";
import type { ManoeuvreSlot } from "@/types/character";

// Story 6.7 — manoeuvre-picker step. Lazy-loaded by LevelUpWizardModal
// so the tables JSON only loads when a level-up actually opens.

export default function ManoeuvrePicker({
  weapon,
  maxLevel,
  existing,
  picked,
  swappedOut,
  atCap,
  onPick,
  onSwapOut,
}: {
  weapon: string;
  maxLevel: number;
  existing: ManoeuvreSlot[];
  picked: ManoeuvreSlot | null;
  swappedOut: string | null;
  atCap: boolean;
  onPick: (m: ManoeuvreSlot | null) => void;
  onSwapOut: (name: string | null) => void;
}) {
  const tables = useTablesData();

  const rows = useMemo<ManoeuvreSlot[]>(() => {
    const wmt = tables["WMT1"];
    if (!wmt || !weapon) return [];
    const weaponRow = wmt.data.find((r) => String(r["WEAPON"]) === weapon);
    if (!weaponRow) return [];
    const out: ManoeuvreSlot[] = [];
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      const list = weaponRow[`Level ${lvl} Manoeuvres`];
      if (!Array.isArray(list)) continue;
      for (const m of list as TableRow[]) {
        const name = String(m["Manoeuvre"] ?? "");
        if (!name) continue;
        // Skip manoeuvres the player already has (no point listing them
        // unless they're available as a swap target — but the existing
        // ones live in the swap-out picker below).
        if (existing.some((e) => e.name === name)) continue;
        out.push({
          name,
          diceSet: String(m["Roll"] ?? ""),
          modifier: String(m["Damage"] ?? ""),
        });
      }
    }
    return out;
  }, [tables, weapon, maxLevel, existing]);

  if (!weapon) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No weapon equipped — manoeuvre pick skipped.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No new manoeuvres available for {weapon} at Level {maxLevel}.
      </p>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Add or swap a manoeuvre ({weapon}, up to Level {maxLevel})
      </legend>
      {atCap && (
        <p className="text-xs text-zinc-500">
          Roster is full ({existing.length}). Pick which existing manoeuvre to
          swap out:
        </p>
      )}
      {atCap && (
        <div className="grid grid-cols-2 gap-1">
          {existing.map((m) => (
            <label
              key={m.name}
              className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
                swappedOut === m.name
                  ? "border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <input
                type="radio"
                name="lvlup-swapout"
                checked={swappedOut === m.name}
                onChange={() => onSwapOut(m.name)}
                className="h-3 w-3 accent-rose-600"
              />
              <span className="min-w-0 truncate">{m.name}</span>
            </label>
          ))}
        </div>
      )}
      <ul className="max-h-48 space-y-1 overflow-auto rounded border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
              picked === null
                ? "bg-zinc-100 dark:bg-zinc-800"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            }`}
          >
            <span className="font-medium">Skip — keep current manoeuvres</span>
          </button>
        </li>
        {rows.map((m) => (
          <li key={m.name}>
            <button
              type="button"
              onClick={() => onPick(m)}
              disabled={atCap && !swappedOut}
              className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left ${
                picked?.name === m.name
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="font-mono">{m.diceSet}</span>
              <span className="min-w-0 flex-1 font-medium">{m.name}</span>
              <span className="text-zinc-500">{m.modifier}</span>
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
