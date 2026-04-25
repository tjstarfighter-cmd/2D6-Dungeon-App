// Schema for data/processed/cards_index.json.

export type CardKind = "creature" | "god" | "herb" | "reference" | "sheet";
export type CardCategory =
  | "Animal"
  | "Fungal"
  | "Human"
  | "Insect"
  | "Undead"
  | "Monster"
  | "Creature";

export interface CardRecord {
  kind: CardKind;
  image: string;        // path relative to repo root, e.g. "docs/2D6 Dungeon Cards/.../Foo.png"
  filename: string;
  name: string;
  raw_stem?: string;
  level?: number;
  category?: CardCategory;
  category_code?: string;
  issues?: string[];
}

export interface CardsIndex {
  summary: {
    total: number;
    by_kind: Partial<Record<CardKind, number>>;
    by_level: Record<string, number>;
    by_category: Partial<Record<CardCategory, number>>;
    records_with_issues: number;
  };
  cards: CardRecord[];
}
