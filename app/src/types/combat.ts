// Combat encounter state. Models a list of enemies from day 1 so the
// "multi-creature" combat path doesn't need a data migration later, even
// though the MVP UI defaults to a single enemy.

export interface EnemyState {
  id: string;
  name: string;
  cardId?: string;       // optional reference to cards_index (creature card)
  hp: { current: number; max: number };
  shift: number;
  // Free-form fields until creature stats are extracted from card images.
  manoeuvres: string;
  interrupt: string;
  notes: string;
  /** The encounter round in which this enemy already fired their Interrupt
   *  Stat. Per Core Rules, "a creature can only use one Interrupt per round,
   *  even if both match." */
  interruptUsedRound?: number;
}

export interface Encounter {
  id: string;
  characterId: string;
  enemies: EnemyState[];
  round: number;
  active: boolean;
  startedAt: string;
  endedAt?: string;
}
