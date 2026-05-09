// Story 6.9 — Recovery From Unconsciousness Table 1 (RFUT1) handling.
// Two pieces:
//   1. parseRfut1Result(text): classifies the rolled cell text into
//      death / revival / ambiguous and pulls the new HP for revivals.
//   2. Module-level "pending RFUT1 roll" flag with subscribe API so
//      the HpZeroWatcher can mark the user as "expecting to roll
//      RFUT1" and Tables.handleResolveRoll can intercept the next
//      RFUT1 resolution to apply the outcome.

export type Rfut1Outcome =
  | { kind: "death" }
  | { kind: "revival"; hp: number }
  | { kind: "ambiguous" };

/**
 * Pure parser for RFUT1 cell text. Conservative — when the cell mixes
 * a conditional ("if you have malko leaves you save yourself on 1 HP
 * or you die") we report "ambiguous" rather than guess. The toast UX
 * leaves the player at HP 0 in that case so they can resolve it
 * manually.
 */
export function parseRfut1Result(text: string): Rfut1Outcome {
  if (!text) return { kind: "ambiguous" };
  const lower = text.toLowerCase();

  // Death markers come straight from the table (rolls 2–5).
  if (
    lower.includes("adventure is over") ||
    lower.includes("you perish") ||
    lower.includes("eternal sleep")
  ) {
    // If the text ALSO has a conditional revival ("if you have X you
    // save yourself on N HP otherwise you die / perish"), treat as
    // ambiguous — the player has to pick.
    if (/\bif you have\b/.test(lower)) return { kind: "ambiguous" };
    return { kind: "death" };
  }

  // Revival markers: "You have N HP" / "wake with N HP" / "save
  // yourself on N HP" — capture the integer.
  const m =
    /(?:you\s+have|wake\s+with|save\s+yourself\s+on)\s+(\d+)\s+hp/i.exec(text);
  if (m) {
    const hp = parseInt(m[1], 10);
    if (Number.isFinite(hp) && hp > 0) {
      // Conditional ("if you have malko leaves you save yourself on 1
      // HP or you die") — still ambiguous because the auto-revive
      // would skip the "or you die" branch.
      if (/\bif you have\b/.test(lower)) return { kind: "ambiguous" };
      return { kind: "revival", hp };
    }
  }

  return { kind: "ambiguous" };
}

// ---- Pending-roll singleton ----------------------------------------------

let pending: boolean = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function setRfut1Pending(): void {
  if (pending) return;
  pending = true;
  notify();
}

export function clearRfut1Pending(): void {
  if (!pending) return;
  pending = false;
  notify();
}

export function isRfut1Pending(): boolean {
  return pending;
}

export function subscribeRfut1(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
