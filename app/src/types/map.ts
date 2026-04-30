// Shared map primitives still used by the dot-grid map (`types/mapv2.ts`)
// and the presenter. The v1 rectangle model (Room / MapDoc / MapExit /
// ExitSide) was retired in Phase 5 of the rewrite — see `docs/rewrite-plan.md`.

export type ExitType =
  | "door"
  | "open"
  | "stone"
  | "portcullis"
  | "magical"
  | "secret";

export interface MapNote {
  id: string;
  x: number;
  y: number;
  text: string;
}
