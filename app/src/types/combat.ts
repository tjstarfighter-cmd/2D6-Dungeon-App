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
  /** The encounter round in which this enemy already took their attack.
   *  Compared against `encounter.round` to gate the EnemyTurnPanel select
   *  so the player works through enemies one at a time and can't double-tap
   *  the same enemy in a multi-creature round. */
  attackedRound?: number;
}

export interface Encounter {
  id: string;
  characterId: string;
  enemies: EnemyState[];
  round: number;
  active: boolean;
  startedAt: string;
  endedAt?: string;
  /** Optional pointer to the v2 map region this encounter happens in.
   *  Set when combat is started from "Start combat in this room" on the
   *  map; used by the End-combat dialog to offer "mark cleared?" and to
   *  show a room-context badge in the header. The string is the region's
   *  tilesHash from MapDocV2; if walls reshape and the hash drifts, the
   *  prompt skips the mark-cleared step rather than touching the wrong
   *  region. */
  roomId?: string;
  /** Snapshot of the room's label at start time. Used as the display name
   *  in the end-combat prompt so the user sees "Mark Library cleared?"
   *  even if the region is currently labelless or has been renamed. */
  roomLabel?: string;
  /** Optional Outnumbered difficulty rule (Core Rules p.32). When true,
   *  enemies past the first gain extra Shift in EnemyTurnPanel. */
  outnumberedEnabled?: boolean;
  /** Set true when any enemy is killed in round 1 of a fight that had
   *  multiple enemies alive at the time of the kill. Drives Fearful
   *  Momentum (+2 player Shift in round 2 only) per Core Rules p.26. */
  r1Kill?: boolean;
}
