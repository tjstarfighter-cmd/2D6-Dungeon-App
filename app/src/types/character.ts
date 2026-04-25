// Player character schema, modeled on the physical character sheet
// (see docs/2D6 Dungeon Cards/2D6 Character Sheet.png and Sheet 2 + Backpack).
// Stored in localStorage; exportable/importable as JSON.

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
  sideQuests: string;
  favour: Record<string, number>;  // god name -> Favour Points
  backpack: Backpack;
  // Optional reference to a future Map epic — reserved so saves don't
  // need migration when the map view ships.
  currentRun?: { mapId?: string };
  createdAt: string;
  updatedAt: string;
}
