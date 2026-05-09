// Player character schema, modeled on the physical character sheet
// (see docs/2D6 Dungeon Cards/2D6 Character Sheet.png and Sheet 2 + Backpack).
// Stored in localStorage; exportable/importable as JSON.

export type RunMode = "mapAnchored" | "lookup";
export const DEFAULT_RUN_MODE: RunMode = "mapAnchored";

export interface ManoeuvreSlot {
  name: string;
  diceSet: string;     // e.g. "⚂ ⚃" — preserved as written
  modifier: string;    // e.g. "D6 +2 damage"
}

export interface ArmourSlot {
  piece: string;
  diceSet: string;
  modifier: string;    // e.g. "-2 Damage"
}

export interface ScrollSlot {
  name: string;
  orbit: string;
  dispelDoubles: string;
  effectModifier: string;
}

export interface PotionSlot {
  name: string;
  effectModifier: string;
}

export interface Coins {
  gc: number;
  sc: number;
  cc: number;
}

export interface StatusConditions {
  bloodied: number;     // 0–7
  soaked: number;       // 0–7
  fever: boolean;
  pneumonia: boolean;
}

export type SideQuestStatus = "active" | "complete" | "abandoned";

export interface SideQuest {
  id: string;
  text: string;
  description?: string;
  status: SideQuestStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Backpack {
  largeItems: string[];   // up to 10 numbered slots
  smallItems: string;     // free-form
  rations: string;
  lootLockup: string;
  additionalNotes: string;
}

export interface Character {
  id: string;
  name: string;
  level: number;
  hp: { current: number; baseline: number };
  xp: number;
  shift: number;
  discipline: number;
  precision: number;
  weapon: string;
  appliedRunes: string;
  manoeuvres: ManoeuvreSlot[];
  armour: ArmourSlot[];
  scrolls: ScrollSlot[];
  potions: PotionSlot[];
  legendLevels: boolean[];     // length 10
  status: StatusConditions;
  coins: Coins;
  treasure: string;
  liberatedPrisoners: number;
  sideQuests: SideQuest[];
  favour: Record<string, number>;  // god name -> Favour Points
  backpack: Backpack;
  // Per-run state. `mode` is the shell mode for this run:
  //   'mapAnchored' — sheet sidebar + map main + overlay launchers (default)
  //   'lookup'      — sheet sidebar + nav between views (at-home physical-paper play)
  // Field is optional so existing saves don't need migration.
  currentRun?: { mapId?: string; mode?: RunMode };
  /** Story 6.7 — queued level-up choices from XP-threshold crossings.
   *  Each entry corresponds to one level the player still has to resolve
   *  (stat bump + optional manoeuvre swap). HP and the level number
   *  itself were applied silently when the threshold was crossed. */
  pendingLevelUps?: { fromLevel: number; toLevel: number }[];
  /** Story 6.12 — append-only archive of completed runs. Display order
   *  in the CharacterSwitcher's Past runs section is reverse-chronological;
   *  the array itself stays append-only so indexes are stable. */
  runs?: RunRecord[];
  createdAt: string;
  updatedAt: string;
}

// ---- Story 6.12: RunRecord ------------------------------------------------

export type RunEndReason = "death" | "exit_shaft";

export interface RunSummaryStats {
  cause: { kind: "combat" | "non_combat"; source: string; roomLabel?: string };
  levelsReached: number;
  roomsEntered: number;
  killsTotal: number;
  killBreakdown: { name: string; count: number }[];
  xp: number;
  treasureCoins: { gc: number; sc: number; cc: number };
  /** Map ids the run touched. Maps live in their own store; the record
   *  references them by id so an archived run can render thumbnails
   *  without duplicating wall data. */
  mapIds: string[];
}

export interface RunRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  endReason: RunEndReason;
  summaryStats: RunSummaryStats;
}
