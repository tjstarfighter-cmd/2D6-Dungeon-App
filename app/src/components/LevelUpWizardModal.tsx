import { Suspense, lazy, useMemo, useState } from "react";

import { Modal } from "@/components/Modal";
import { useCharacters } from "@/hooks/useCharacters";
import { STAT_OPTIONS, tierFor, type StatKey } from "@/lib/level-up";
import type { Character, ManoeuvreSlot } from "@/types/character";

const ManoeuvrePicker = lazy(() => import("./LevelUpWizardModal.manoeuvre"));

// Story 6.7 — guided level-up wizard. Two steps: stat bump (+1 to one
// of Shift / Discipline / Precision per the Adventurer Levels Table)
// then a manoeuvre add or swap from WMT1 against the equipped weapon.
//
// Operates on the FIRST entry in pendingLevelUps; on confirm the entry
// pops off and the next pending level-up (if any) opens automatically.

export function LevelUpWizardModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { active, update } = useCharacters();
  if (!active || !active.pendingLevelUps?.length) return null;
  return <LevelUpWizardInner active={active} update={update} onClose={onClose} />;
}

function LevelUpWizardInner({
  active,
  update,
  onClose,
}: {
  active: Character;
  update: (id: string, patch: Partial<Character>) => void;
  onClose: () => void;
}) {
  const pending = active.pendingLevelUps!;
  const head = pending[0];
  const tier = tierFor(head.toLevel);

  const [stat, setStat] = useState<StatKey | null>(null);
  const [manoeuvre, setManoeuvre] = useState<ManoeuvreSlot | null>(null);
  const [swappedOut, setSwappedOut] = useState<string | null>(null);
  // The wizard currently has 2 conceptual steps but renders both at
  // once for compactness; Confirm is gated until at least the stat
  // pick is made (manoeuvre is optional — the player may not have a
  // valid pick at low weapon mastery).

  const remaining = useMemo(() => pending.length, [pending.length]);

  function handleConfirm() {
    if (!stat) return;
    const patch: Partial<Character> = {
      [stat]: (active[stat] ?? 0) + 1,
      pendingLevelUps: pending.slice(1),
    } as Partial<Character>;
    if (manoeuvre) {
      const next = swappedOut
        ? active.manoeuvres.map((m) => (m.name === swappedOut ? manoeuvre : m))
        : [...active.manoeuvres, manoeuvre];
      // Cap to maxManoeuvres for the new level so the player can't
      // exceed the rules' slot limit by spamming confirms.
      patch.manoeuvres = next.slice(0, tier.maxManoeuvres);
    }
    update(active.id, patch);
    if (pending.length <= 1) onClose();
    // Else: wizard auto-re-renders with the next pending level-up
    // because pendingLevelUps shrank by one.
  }

  return (
    <Modal
      title={`Level ${head.toLevel} — ${tier.tier}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Resolve later
          </button>
          <button
            type="button"
            disabled={!stat}
            onClick={handleConfirm}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:dark:bg-zinc-700 disabled:dark:text-zinc-500"
          >
            Confirm
            {remaining > 1 && ` (${remaining - 1} more)`}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          {head.fromLevel} → {head.toLevel}. HP and level were applied
          silently. Pick a stat bump, then optionally swap or add a
          manoeuvre (max {tier.maxManoeuvres}, up to Level{" "}
          {tier.maxManoeuvreLevel}).
        </p>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            +1 stat bump
          </legend>
          {STAT_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                stat === opt.key
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                  : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
              }`}
            >
              <input
                type="radio"
                name="lvlup-stat"
                checked={stat === opt.key}
                onChange={() => setStat(opt.key)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span className="font-medium">{opt.label}</span>
              <span className="ml-auto text-xs text-zinc-500">
                {(active[opt.key] ?? 0)} → {(active[opt.key] ?? 0) + 1}
              </span>
            </label>
          ))}
        </fieldset>

        <Suspense
          fallback={<p className="text-xs text-zinc-500">Loading manoeuvres…</p>}
        >
          <ManoeuvrePicker
            weapon={active.weapon}
            maxLevel={tier.maxManoeuvreLevel}
            existing={active.manoeuvres}
            picked={manoeuvre}
            swappedOut={swappedOut}
            atCap={active.manoeuvres.length >= tier.maxManoeuvres}
            onPick={setManoeuvre}
            onSwapOut={setSwappedOut}
          />
        </Suspense>
      </div>
    </Modal>
  );
}
