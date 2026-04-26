import type { CodexTable, TableRow } from "@/types/tables";

// ----- Roll mechanics ------------------------------------------------------

export const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"] as const;

/** Map a 1–6 result to its Unicode dice face. Returns the number as fallback. */
export function diceFace(n: number): string {
  return DICE_FACES[n - 1] ?? String(n);
}

export type RollKind = "d6" | "2d6" | "d66" | "reference";

export type RollValue = number | string;

/**
 * Detect what kind of roll a table represents, based on row count and the
 * type of the ROLL column. Tables that don't have ROLL as their identifier
 * are reference lookups (e.g. AT1's ARMOUR TYPE column) — no dice picker.
 */
export function rollKindFor(table: CodexTable): RollKind {
  if (table.rollIdentifier !== "ROLL") return "reference";
  const n = table.data.length;
  const first = table.data[0]?.ROLL;
  if (n === 6 && typeof first === "number") return "d6";
  if (n === 11 && typeof first === "number") return "2d6";
  if (n === 36 && typeof first === "string") return "d66";
  return "reference";
}

/** Enumerate the legal roll values for a kind, in display order. */
export function rollValuesFor(kind: RollKind): RollValue[] {
  if (kind === "d6") return [1, 2, 3, 4, 5, 6];
  if (kind === "2d6") return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (kind === "d66") {
    const out: string[] = [];
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        out.push(`${diceFace(a)} ${diceFace(b)}`);
      }
    }
    return out;
  }
  return [];
}

/** Roll a random value for the kind, using the same string format as the data. */
export function rollRandom(kind: RollKind): RollValue | null {
  const r = () => Math.floor(Math.random() * 6) + 1;
  if (kind === "d6") return r();
  if (kind === "2d6") return r() + r();
  if (kind === "d66") return `${diceFace(r())} ${diceFace(r())}`;
  return null;
}

/** Does this row's ROLL cell match the rolled value? Loose string compare. */
export function rowMatchesRoll(
  row: TableRow,
  roll: RollValue | null,
): boolean {
  if (roll === null) return false;
  const cell = row.ROLL;
  if (cell === undefined || cell === null) return false;
  return String(cell) === String(roll);
}

// ----- Categorisation ------------------------------------------------------

// Categories are open-ended (string) so per-level "Level 2", "Level 3", …
// buckets can appear dynamically as more L2+ tables get added. The constants
// below define the *display order* for known categories; everything else
// (Level N for N>=2, then "Other", then alphabetical) sorts after.
const PRIMARY_ORDER = [
  "Generic Reference",
  "Item Generation",
  "Loot & Containers",
  "Encounters & Hazards",
  "Level 1 Creatures",
  "Level 1 Rooms",
] as const;

export type Category = string;

const EXPLICIT: Record<string, Category> = {
  // Generic reference — the things you look up most.
  AT1: "Generic Reference",
  WMT1: "Generic Reference",
  MIT1: "Generic Reference",
  MPT1: "Generic Reference",
  MST1: "Generic Reference",
  VGT1: "Generic Reference",
  VMIT1: "Generic Reference",
  SAT1: "Generic Reference",
  SST_Start: "Generic Reference",

  // Random item generation tables (T1–T4 progression).
  ART1_RANDOM: "Item Generation",
  ART2: "Item Generation",
  ART3: "Item Generation",
  ART4: "Item Generation",
  POT1: "Item Generation",
  POT2: "Item Generation",
  POT3: "Item Generation",
  POT4: "Item Generation",
  SCT1: "Item Generation",
  SCT2: "Item Generation",
  SCT3: "Item Generation",
  SCT4: "Item Generation",
  MIT1_RANDOM: "Item Generation",
  MIT2: "Item Generation",
  GMT1: "Item Generation",
  HST1: "Item Generation",
  HAOIT1: "Item Generation",
  ECT1: "Item Generation",
  GOT1: "Item Generation",
  SST1: "Item Generation",

  // What's in this container?
  BT1: "Loot & Containers",
  BT2: "Loot & Containers",
  CT1: "Loot & Containers",
  CT2: "Loot & Containers",
  PT1: "Loot & Containers",
  PT2: "Loot & Containers",
  RPT1: "Loot & Containers",
  RPT2: "Loot & Containers",
  RATT1: "Loot & Containers",
  RUPT1: "Loot & Containers",
  TAT1: "Loot & Containers",
  TCT1: "Loot & Containers",

  // Special situations during exploration.
  ENP1: "Encounters & Hazards",
  EXT1: "Encounters & Hazards",
  IAUT1: "Encounters & Hazards",
  FTCCT1: "Encounters & Hazards",
  RFUT1: "Encounters & Hazards",
  GCT1: "Encounters & Hazards",
  STIT1: "Encounters & Hazards",
  ENAT1: "Encounters & Hazards",
  POLT1: "Encounters & Hazards",
};

const ROOM_KEYS = new Set(["L1LR", "L1SR", "L1HA_Rooms"]);

export function categoryFor(key: string): Category {
  if (EXPLICIT[key]) return EXPLICIT[key];
  if (ROOM_KEYS.has(key)) return "Level 1 Rooms";
  if (key.startsWith("L1")) return "Level 1 Creatures";
  // L2+ : single bucket per level until subdivision is needed.
  const m = key.match(/^L(\d+)/);
  if (m) return `Level ${m[1]}`;
  return "Other";
}

/**
 * Group all table keys by category. Preserves PRIMARY_ORDER for known
 * buckets, then Level N (sorted by N), then any other custom categories
 * alphabetically, then "Other" last.
 */
export function groupByCategory(
  keys: string[],
): { category: Category; keys: string[] }[] {
  const buckets = new Map<Category, string[]>();
  for (const key of keys) {
    const cat = categoryFor(key);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(key);
  }
  const result: { category: Category; keys: string[] }[] = [];
  for (const c of PRIMARY_ORDER) {
    const ks = buckets.get(c);
    if (ks && ks.length > 0) {
      result.push({ category: c, keys: ks });
      buckets.delete(c);
    }
  }
  const remaining = Array.from(buckets.entries()).sort(([a], [b]) => {
    const aL = a.match(/^Level (\d+)$/);
    const bL = b.match(/^Level (\d+)$/);
    if (aL && bL) return Number(aL[1]) - Number(bL[1]);
    if (aL) return -1;
    if (bL) return 1;
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
  for (const [c, ks] of remaining) result.push({ category: c, keys: ks });
  return result;
}

// ----- Display helpers -----------------------------------------------------

/** A table row column may be a value or a nested sub-table (WMT1). */
export function isNestedRows(value: unknown): value is TableRow[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null
  );
}
