// Polymorphic notes — attach to any addressable entity, or float free as
// a session note. Map/room targets are reserved for the future map epic.

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
  id: string;
}

export interface Note {
  id: string;
  body: string;            // markdown-ish text
  createdAt: string;
  updatedAt: string;
  target?: NoteTarget;     // omit for free-floating session notes
}
