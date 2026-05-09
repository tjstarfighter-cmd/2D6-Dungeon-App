import { useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import type { EnemyState } from "@/types/combat";

// Story 5.5 — combat-close summary form. Pre-fills a one-line summary
// from the encounter roster ("Fought 2× Goblin, 1× Ogre — defeated.")
// that the player can edit, plus a free-form notes textarea and an XP
// input. Confirm posts a single resolved Combat entry to the active
// room (or the Unattributed bucket); cancel discards.

export function CombatCloseSummary({
  enemies,
  initialXp,
  characterName,
  onConfirm,
  onCancel,
}: {
  enemies: EnemyState[];
  initialXp: number;
  characterName: string;
  onConfirm: (input: { summary: string; notes: string; xp: number }) => void;
  onCancel: () => void;
}) {
  const defaultSummary = useMemo(() => buildDefaultSummary(enemies), [enemies]);
  const [summary, setSummary] = useState(defaultSummary);
  const [notes, setNotes] = useState("");
  const [xp, setXp] = useState(initialXp);

  return (
    <Modal title="End combat" onClose={onCancel}>
      <div className="space-y-3">
        <div>
          <label
            htmlFor="combat-summary"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Summary
          </label>
          <textarea
            id="combat-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="combat-notes"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Notes (optional)
          </label>
          <textarea
            id="combat-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything else worth remembering — loot drops, near-misses, …"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="combat-xp"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            XP awarded to {characterName}
          </label>
          <input
            id="combat-xp"
            type="number"
            min={0}
            value={xp}
            onChange={(e) => setXp(Math.max(0, Number(e.target.value) || 0))}
            className="block w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Discard (no log entry)
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({ summary: summary.trim(), notes: notes.trim(), xp })
            }
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Confirm + post
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** "Fought 2× Goblin, 1× Ogre — defeated." Pluralisation is left to the
 *  player; this is a starting point they can edit freely. */
function buildDefaultSummary(enemies: EnemyState[]): string {
  if (enemies.length === 0) return "Fought no enemies — combat ended.";
  const counts: Record<string, number> = {};
  for (const e of enemies) {
    const name = (e.name || "Enemy").trim();
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const aliveCount = enemies.filter((e) => e.hp.current > 0).length;
  const outcome = aliveCount === 0 ? "defeated" : "fled / left alive";
  const parts = Object.entries(counts).map(([name, n]) =>
    n > 1 ? `${n}× ${name}` : name,
  );
  return `Fought ${parts.join(", ")} — ${outcome}.`;
}
