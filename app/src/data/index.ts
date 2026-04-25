// Central data layer. The app imports from here; downstream code never
// touches JSON paths directly.

import tablesJson from "@game-data/tables_codex.json";
import cardsJson from "@game-data/cards_index.json";
import rulesMarkdown from "@game-data/core_rules.md?raw";

import type { TablesCodex } from "@/types/tables";
import type { CardsIndex } from "@/types/cards";

// Cast through `unknown` because TypeScript infers extremely narrow literal
// types from the imported JSON; we trust the runtime shape (validated by the
// extraction scripts in scripts/) over its inferred shape.
export const tables: TablesCodex = tablesJson as unknown as TablesCodex;
export const cards: CardsIndex = cardsJson as unknown as CardsIndex;
export const rulesMd: string = rulesMarkdown;

// Convenience derived views — cheap, computed once at module load.
export const tableKeys = Object.keys(tables);
export const tableCount = tableKeys.length;
export const cardCount = cards.cards.length;
