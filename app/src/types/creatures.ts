// Schema for data/processed/creatures.json — keyed by the card's raw
// filename stem (e.g. "Apothecary L1 (H)"), parallel to cards_index.json's
// `raw_stem` field.

export interface CreatureManoeuvre {
  /** D66 primary die that triggers this manoeuvre (1–6). */
  primary: number;
  /** D66 secondary die that triggers this manoeuvre (1–6). */
  secondary: number;
  name: string;
  formula: string;
}

export interface CreatureRecord {
  name: string;
  level: number;
  category: string;
  hp: number;
  xp: number;
  shift: number;
  treasure: string;
  interrupt: string;
  manoeuvres: CreatureManoeuvre[];
  flavour: string;
  mishap: string;
  prime: string;
  image: string;
}

export type CreaturesIndex = Record<string, CreatureRecord>;
