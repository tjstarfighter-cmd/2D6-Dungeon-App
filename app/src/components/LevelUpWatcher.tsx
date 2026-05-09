import { useEffect, useRef } from "react";

import { useCharacters } from "@/hooks/useCharacters";
import { useToast } from "@/components/Toast";
import { levelForXp } from "@/lib/level-up";

// Story 6.7 — XP-watcher. Mounted once at Shell level (inside the
// ToastProvider so it can fire the level-up toast). Watches the active
// character's xp and, when it crosses a threshold, silently increments
// level + HP and queues pending choices for the LevelUpWizard modal.
//
// Multiple thresholds in a single XP write (e.g. a generous combat
// summary that pushes the player past two levels at once) all apply in
// the same update; one toast is fired per write, naming the highest
// reached level. Each crossed level pushes its own entry onto
// pendingLevelUps so the wizard surfaces a separate stat/manoeuvre
// choice for every level gained.

export function LevelUpWatcher({
  onResolveChoices,
}: {
  onResolveChoices: () => void;
}) {
  const { active, update } = useCharacters();
  const toast = useToast();
  // Track the last seen XP per character so flips between active
  // characters don't fire phantom level-ups.
  const lastSeen = useRef<Map<string, number>>(new Map());
  // Stable ref for the toast handler so the effect doesn't re-fire on
  // toast api identity changes.
  const onResolveRef = useRef(onResolveChoices);
  useEffect(() => {
    onResolveRef.current = onResolveChoices;
  });

  useEffect(() => {
    if (!active) return;
    const prevXp = lastSeen.current.get(active.id);
    lastSeen.current.set(active.id, active.xp);
    if (prevXp === undefined) return; // first observation; no diff to detect
    if (active.xp <= prevXp) return; // XP didn't go up
    const reachedLevel = levelForXp(active.level, active.xp);
    if (reachedLevel <= active.level) return;

    const gainedLevels = reachedLevel - active.level;
    const pending = (active.pendingLevelUps ?? []).slice();
    for (let i = 0; i < gainedLevels; i++) {
      pending.push({
        fromLevel: active.level + i,
        toLevel: active.level + i + 1,
      });
    }
    update(active.id, {
      level: reachedLevel,
      hp: {
        ...active.hp,
        baseline: active.hp.baseline + 10 * gainedLevels,
        current: active.hp.current + 10 * gainedLevels,
      },
      pendingLevelUps: pending,
    });
    const id = toast.suggestion({
      message: `✨ Level ${reachedLevel} reached! +${gainedLevels * 10} HP applied.`,
      primary: {
        label: "Resolve choices",
        onClick: () => {
          toast.dismiss(id);
          onResolveRef.current();
        },
      },
    });
  }, [active, toast, update]);

  return null;
}
