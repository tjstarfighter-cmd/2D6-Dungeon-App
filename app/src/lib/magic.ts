import type { Character } from "@/types/character";

// Best-effort magic-effect interpreter for the Magic sub-tab's [Use] action
// (Story 1.7). Returns a patch + human-readable description if the row's
// name or effect text matches a known pattern; otherwise null so the
// caller can fall back to a "you decide" toast.
//
// Kept deliberately narrow — the AC's only explicit interpretable case is
// "Potion of Healing → HP +10 capped at baseline". Everything else stays
// player-resolved until later stories add concrete rules.

export interface AppliedEffect {
  patch: Partial<Character>;
  description: string;
}

export function tryApplyMagicEffect(
  name: string,
  effectText: string,
  character: Character,
): AppliedEffect | null {
  const n = name.toLowerCase();
  const e = effectText.toLowerCase();

  // Potion of Healing: +10 HP, capped at baseline.
  if (
    n.includes("potion of healing") ||
    /\+\s*10\s*hp\b/.test(e) ||
    /\b10\s*hp\b/.test(e)
  ) {
    const before = character.hp.current;
    const next = Math.min(character.hp.baseline, before + 10);
    const delta = next - before;
    return {
      patch: { hp: { ...character.hp, current: next } },
      description:
        delta > 0
          ? `+${delta} HP (now ${next}/${character.hp.baseline})`
          : `Already at full HP (${character.hp.baseline}/${character.hp.baseline})`,
    };
  }

  return null;
}
