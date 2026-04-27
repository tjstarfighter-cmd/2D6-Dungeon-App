import type { CardRecord } from "@/types/cards";
import type { EnemyState } from "@/types/combat";
import type {
  CreatureManoeuvre,
  CreatureRecord,
  CreaturesIndex,
} from "@/types/creatures";

// creatures.json is keyed by the card's filename stem (no extension) — the
// same string `cards_index.json` exposes as `raw_stem`.
function creatureKeyForCard(card: CardRecord): string {
  return card.raw_stem ?? card.filename.replace(/\.png$/i, "");
}

export function findCreatureForCard(
  creatures: CreaturesIndex,
  card: CardRecord,
): CreatureRecord | null {
  return creatures[creatureKeyForCard(card)] ?? null;
}

export function formatManoeuvre(m: CreatureManoeuvre): string {
  return `${m.name} ${m.primary}.${m.secondary} ${m.formula}`;
}

export function formatManoeuvres(creature: CreatureRecord): string {
  return creature.manoeuvres.map(formatManoeuvre).join("; ");
}

/**
 * Build the `addEnemy` init payload for a card pick. When the card has a
 * matching creature record, populate HP / Shift / Interrupt / Manoeuvres so
 * the user doesn't have to type them in.
 */
export function enemyInitFromCard(
  card: CardRecord,
  creature: CreatureRecord | null,
): Partial<EnemyState> {
  if (!creature) {
    return { name: card.name, cardId: card.filename };
  }
  return {
    name: card.name,
    cardId: card.filename,
    hp: { current: creature.hp, max: creature.hp },
    shift: creature.shift,
    interrupt: creature.interrupt,
    manoeuvres: formatManoeuvres(creature),
  };
}
