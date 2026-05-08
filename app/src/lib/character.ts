import {
  DEFAULT_RUN_MODE,
  type Character,
  type RunMode,
  type SideQuest,
} from "@/types/character";

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
export const LARGE_ITEM_SLOTS = 5;

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalise a stored character payload to the current schema. Used on read
 * so the rest of the app can rely on typed fields without scattering migration
 * checks. Currently handles the sideQuests string → SideQuest[] migration
 * (Story 1.8).
 */
export function normalizeCharacter(raw: unknown): Character {
  // Defensive cast — storage values come from JSON.parse and may predate the
  // current schema. We trust the rest of the shape (everything else has
  // been around since the rewrite) and only patch fields known to drift.
  const c = raw as Omit<Character, "sideQuests"> & { sideQuests: unknown };

  let sideQuests: SideQuest[];
  const rawQuests = c.sideQuests;
  if (Array.isArray(rawQuests)) {
    sideQuests = rawQuests as SideQuest[];
  } else if (typeof rawQuests === "string" && rawQuests.trim()) {
    sideQuests = [
      {
        id: genId(),
        text: rawQuests.trim(),
        status: "active",
        createdAt: c.createdAt ?? new Date().toISOString(),
      },
    ];
  } else {
    sideQuests = [];
  }

  return { ...c, sideQuests } as Character;
}

/** Rules: HP baseline = 10 × level. Used by the "set baseline from level" affordance. */
export function baselineHpForLevel(level: number): number {
  return Math.max(1, level) * 10;
}

/** Read the current run's shell mode, falling back to the default for legacy saves. */
export function getRunMode(character: Character | null | undefined): RunMode {
  return character?.currentRun?.mode ?? DEFAULT_RUN_MODE;
}

/** Build a fresh character with the rules' starting values. */
export function createCharacter(name = "New Adventurer"): Character {
  const now = new Date().toISOString();
  return {
    id: genId(),
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
    sideQuests: [],
    favour: Object.fromEntries(GODS.map((g) => [g, 0])),
    currentRun: { mode: DEFAULT_RUN_MODE },
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
