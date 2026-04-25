import type { Character } from "@/types/character";

// The six subterranean gods, in the order they appear on the physical sheet.
// Names match the card folder filenames in docs/2D6 Dungeon Cards/God Cards/.
export const GODS = [
  "Grakada the Core",
  "Intuneric the Murk",
  "Maduva the Rot",
  "Murataynie the Pulp",
  "Nevazator the Blind",
  "Radacina the Radix",
] as const;

export type GodName = (typeof GODS)[number];

export const STATUS_PIPS = 7; // Bloodied / Soaked have 7 boxes each on the sheet.
export const LEGEND_LEVELS = 10;
export const LARGE_ITEM_SLOTS = 10;

/** Rules: HP baseline = 10 × level. Used by the "set baseline from level" affordance. */
export function baselineHpForLevel(level: number): number {
  return Math.max(1, level) * 10;
}

/** Build a fresh character with the rules' starting values. */
export function createCharacter(name = "New Adventurer"): Character {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    level: 1,
    hp: { current: 10, baseline: 10 },
    xp: 0,
    // Starting stats per Core Rules "Creating an Adventurer":
    // +2 Shift, +1 Discipline, 0 Precision.
    shift: 2,
    discipline: 1,
    precision: 0,
    weapon: "",
    appliedRunes: "",
    manoeuvres: [],
    armour: [],
    scrolls: [],
    potions: [],
    legendLevels: Array(LEGEND_LEVELS).fill(false),
    status: { bloodied: 0, soaked: 0, fever: false, pneumonia: false },
    coins: { gc: 0, sc: 0, cc: 0 },
    treasure: "",
    liberatedPrisoners: 0,
    sideQuests: "",
    favour: Object.fromEntries(GODS.map((g) => [g, 0])),
    backpack: {
      largeItems: Array(LARGE_ITEM_SLOTS).fill(""),
      smallItems: "",
      rations: "",
      lootLockup: "",
      additionalNotes: "",
    },
    createdAt: now,
    updatedAt: now,
  };
}
