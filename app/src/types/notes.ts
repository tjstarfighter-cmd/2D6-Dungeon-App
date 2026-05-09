// Polymorphic notes — attach to any addressable entity, or float free as
// a session note. Story 4.1 expands the Note shape into the typed-log
// model: each entry now carries an entryType (Roll · Loot · Combat ·
// Event · Note) and a pending/resolved state so the per-room log can
// drive game-loop flows. Free-floating notes (no target) land in the
// Unattributed bucket per Story 4.4.

export type NoteTargetKind =
  | "table"
  | "card"
  | "creature"
  | "character"
  | "session"
  | "map"
  | "room";

export interface NoteTarget {
  kind: NoteTargetKind;
  // For target.kind === "room", `id` is the region's tilesHash (the
  // stable identifier for a region's tile set, see lib/mapv2#tilesHash).
  id: string;
}

export type NoteEntryType = "Roll" | "Loot" | "Combat" | "Event" | "Note";
export type NoteState = "pending" | "resolved";

export interface Note {
  id: string;
  body: string;            // markdown-ish text
  createdAt: string;
  updatedAt: string;
  target?: NoteTarget;     // omit for free-floating session notes (Unattributed)
  entryType: NoteEntryType;
  state: NoteState;
}
