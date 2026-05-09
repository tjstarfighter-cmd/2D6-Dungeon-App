// Story 6.4 — derive the contents-roll table ID from the four-input
// scheme: Level + Ancestry + PinKind + SizeCategory. Used by the
// post-pin auto-prompt in MapV2 so the player gets a one-tap "Roll"
// path to the right table.
//
// IDs follow the codex naming: `L<level><ancestryCode>_<Rooms|Hallways>`
// for the general per-ancestry tables, plus `L<level>SR` / `L<level>LR`
// for the size-bracket variants that don't depend on ancestry.

import type { PinKind } from "@/types/mapv2";
import type { RoomRoll } from "@/lib/mapv2";

export type SizeCategory = "small" | "regular" | "large" | "hallway";

const ANCESTRY_CODE: Record<string, string> = {
  "Human Ancestry": "HA",
};

export function ancestryCode(ancestry: string): string {
  return ANCESTRY_CODE[ancestry] ?? "HA";
}

/**
 * Map an explicit RoomRoll (when the player ran the size flow) or a raw
 * tile count (when they didn't) to a SizeCategory. The pin kind is the
 * tiebreaker — the player explicitly choosing "hall" overrides any
 * room-shaped tile count from the underlying region.
 */
export function sizeCategoryFor(
  pinKind: PinKind,
  roll: RoomRoll | null,
  fallbackTiles: number,
): SizeCategory {
  if (pinKind === "hall") return "hallway";
  if (roll) {
    if (roll.kind === "small") return "small";
    if (roll.kind === "large") return "large";
    if (roll.kind === "corridor") return "regular"; // see note below
    return "regular";
  }
  if (fallbackTiles <= 6) return "small";
  if (fallbackTiles >= 32) return "large";
  return "regular";
}

/**
 * Build the canonical table ID for a freshly-pinned region. Returns
 * `null` only if the inputs are degenerate (level < 1) — caller should
 * fall back to the alternates picker.
 */
export function deriveContentsTableId(input: {
  level: number;
  ancestry: string;
  size: SizeCategory;
}): string | null {
  if (!input.level || input.level < 1) return null;
  const ac = ancestryCode(input.ancestry);
  switch (input.size) {
    case "hallway":
      return `L${input.level}${ac}_Hallways`;
    case "small":
      return `L${input.level}SR`;
    case "large":
      return `L${input.level}LR`;
    default:
      return `L${input.level}${ac}_Rooms`;
  }
}

/** Human-readable label for the prompt header. */
export function sizeLabel(size: SizeCategory): string {
  switch (size) {
    case "small":
      return "Small Room";
    case "large":
      return "Large Room";
    case "hallway":
      return "Hallway";
    default:
      return "Room";
  }
}

/**
 * All L<level>* tables that exist in the codex — the picker presents
 * these as alternates so the player can override the auto-derived ID.
 * Pure: caller passes the codex keys it has loaded.
 */
export function levelAlternates(
  level: number,
  ancestry: string,
  allKeys: readonly string[],
): string[] {
  const ac = ancestryCode(ancestry);
  const prefixes = [`L${level}${ac}_`, `L${level}SR`, `L${level}LR`];
  const matches = allKeys.filter((k) =>
    prefixes.some((p) => k === p || k.startsWith(p)),
  );
  // Stable order: per-ancestry first, then size brackets.
  matches.sort((a, b) => {
    const score = (s: string) => (s.startsWith(`L${level}${ac}_`) ? 0 : 1);
    const d = score(a) - score(b);
    return d !== 0 ? d : a.localeCompare(b);
  });
  return matches;
}
