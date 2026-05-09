import { useState } from "react";

import { Modal } from "@/components/Modal";

// Story 6.6 — rest/ration prompt for level transitions. Pure-UI; the
// caller wires it to the active character's HP / pack via onResolve.
//
// Defaults follow Core Rules p.18: Eat 1 ration → +2 HP × Lvl
// (+2 if a cloth/bandage is applied). Skipping the rest costs ½ current
// HP, capped at 20.

export interface RestResolution {
  /** Net delta to apply to character HP (positive on Rest, negative on Skip). */
  hpDelta: number;
  /** Rations to deduct from the character's pack on apply. */
  rationsConsumed: number;
}

export function RestRationModal({
  level,
  currentHp,
  currentRations,
  onResolve,
  onClose,
}: {
  level: number;
  currentHp: number;
  currentRations: number;
  onResolve: (r: RestResolution) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [bandage, setBandage] = useState(false);
  const [editRations, setEditRations] = useState("1");
  const [editHpDelta, setEditHpDelta] = useState(String(2 * level));

  const restHp = 2 * level + (bandage ? 2 : 0);
  const skipPenalty = Math.min(20, Math.floor(currentHp / 2));

  function applyRest() {
    onResolve({ hpDelta: restHp, rationsConsumed: 1 });
  }
  function applySkip() {
    onResolve({ hpDelta: -skipPenalty, rationsConsumed: 0 });
  }
  function applyEdit() {
    const r = parseInt(editRations, 10);
    const h = parseInt(editHpDelta, 10);
    onResolve({
      hpDelta: Number.isFinite(h) ? h : 0,
      rationsConsumed: Number.isFinite(r) && r >= 0 ? r : 0,
    });
  }

  const noRations = currentRations <= 0;

  return (
    <Modal
      title="Rest before descending?"
      onClose={onClose}
      footer={
        editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={applyEdit}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Edit details
            </button>
            <button
              type="button"
              onClick={applySkip}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={applyRest}
              disabled={noRations}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:dark:bg-zinc-700 disabled:dark:text-zinc-500"
            >
              Rest
            </button>
          </>
        )
      }
    >
      {editing ? (
        <div className="space-y-3 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
            Manual override — applied as-is on Apply.
          </p>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-zinc-500">
              Rations consumed
            </span>
            <input
              type="number"
              min={0}
              value={editRations}
              onChange={(e) => setEditRations(e.target.value)}
              className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-zinc-500">
              HP delta (positive heal, negative damage)
            </span>
            <input
              type="number"
              value={editHpDelta}
              onChange={(e) => setEditHpDelta(e.target.value)}
              className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bandage}
              onChange={(e) => setBandage(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            <span>Cloth/bandage applied (+2 to standard rest)</span>
          </label>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-zinc-700 dark:text-zinc-300">
            Eat 1 ration → <strong>+{restHp} HP</strong>{" "}
            <span className="text-zinc-500">
              (+2 × Lvl{bandage ? " · +2 cloth/bandage" : ""})
            </span>
            . Skip → <strong>−{skipPenalty} HP</strong>{" "}
            <span className="text-zinc-500">(½ current, capped 20)</span>.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bandage}
              onChange={(e) => setBandage(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            <span>Apply cloth/bandage (+2 to Rest)</span>
          </label>
          <p className="text-xs text-zinc-500">
            Rations on hand: <strong>{currentRations}</strong> · current HP{" "}
            <strong>{currentHp}</strong> · level <strong>{level}</strong>
          </p>
          {noRations && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              No rations available. Rest is disabled — Skip applies the
              −{skipPenalty} HP penalty (or use <em>Edit details</em> to
              override).
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
