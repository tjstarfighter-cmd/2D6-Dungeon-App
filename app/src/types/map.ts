// Dungeon map types. A MapDoc is one dungeon level the player is mapping
// out as they explore. Stored in localStorage; included in JSON export
// once we wire it into the backup format.

export type ExitType =
  | "door"
  | "open"
  | "stone"
  | "portcullis"
  | "magical"
  | "secret";

export type ExitSide = "n" | "s" | "e" | "w";

export interface Room {
  id: string;
  /** Top-left grid cell of the room's rectangular bounding box. */
  x: number;
  y: number;
  /** Width and height in cells (each cell = one Dungeon square). */
  w: number;
  h: number;
  /** Short label shown inside the room, e.g. "Library". */
  label?: string;
  /** Free-form room type (e.g. from rolling on a Rooms table). */
  type?: string;
  description?: string;
  encounter?: string;
  treasure?: string;
  cleared?: boolean;
}

export interface MapExit {
  id: string;
  /** Cell the exit attaches to. */
  x: number;
  y: number;
  /** Which edge of the cell. */
  side: ExitSide;
  type: ExitType;
  locked?: boolean;
}

export interface MapNote {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface MapDoc {
  id: string;
  name: string;
  level: number;
  ancestry: string;
  /** Optional pointer to the character whose run this map belongs to. */
  characterId?: string;
  rooms: Room[];
  exits: MapExit[];
  notes: MapNote[];
  /** Logical grid extents — for now just the visible canvas size. */
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}
