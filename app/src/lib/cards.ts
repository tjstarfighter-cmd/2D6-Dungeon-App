import type { CardCategory, CardKind, CardRecord } from "@/types/cards";

/**
 * URL for a card image as served by Vite from `public/cards/`.
 * Filenames contain spaces / parens, so we URI-encode the basename.
 */
export function cardImageUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}cards/${encodeURIComponent(filename)}`;
}

export const KIND_LABELS: Record<CardKind, string> = {
  creature: "Creatures",
  god: "Gods",
  herb: "Herbs",
  reference: "Reference",
  sheet: "Sheets",
};

export const KIND_ORDER: CardKind[] = [
  "creature",
  "god",
  "herb",
  "reference",
  "sheet",
];

export const CATEGORY_ORDER: CardCategory[] = [
  "Human",
  "Animal",
  "Undead",
  "Monster",
  "Fungal",
  "Insect",
  "Creature",
];

export interface CardFilter {
  query: string;
  kind: CardKind | "all";
  level: number | "all";
  category: CardCategory | "all";
}

export const DEFAULT_FILTER: CardFilter = {
  query: "",
  kind: "all",
  level: "all",
  category: "all",
};

export function applyFilter(cards: CardRecord[], filter: CardFilter): CardRecord[] {
  const q = filter.query.trim().toLowerCase();
  return cards.filter((c) => {
    if (filter.kind !== "all" && c.kind !== filter.kind) return false;
    if (filter.level !== "all" && c.level !== filter.level) return false;
    if (filter.category !== "all" && c.category !== filter.category) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function findCard(cards: CardRecord[], filename: string): CardRecord | null {
  // The route param is URL-encoded; decode for the lookup.
  const decoded = decodeURIComponent(filename);
  return cards.find((c) => c.filename === decoded) ?? null;
}

export function metaLine(card: CardRecord): string {
  if (card.kind === "creature") {
    return `Level ${card.level} · ${card.category ?? "—"}`;
  }
  return KIND_LABELS[card.kind].replace(/s$/, "");
}
