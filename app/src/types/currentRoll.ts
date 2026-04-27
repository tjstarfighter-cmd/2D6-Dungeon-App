// Slot for the "what roll is happening right now" presenter overlay. One
// roll at a time — newer publishes overwrite older ones. The presenter
// route at /present/roll reads this and renders pending or resolved state.

export type CurrentRollSource =
  | "combat:player"
  | "combat:player-damage"
  | "combat:enemy"
  | "combat:enemy-damage"
  | "table";

export interface CurrentRollResult {
  headline: string;
  sub?: string;
}

export interface CurrentRoll {
  source: CurrentRollSource;
  label: string;
  dice: string;
  status: "pending" | "resolved";
  value?: string;
  result?: CurrentRollResult;
  updatedAt: number;
}
