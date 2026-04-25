// Schema for entries in data/processed/tables_codex.json.
// The JSON is a top-level object keyed by stable table IDs ("AT1", "L1HA_Rooms", ...).
// Each table has a title, optional notes/flavor text, and a row array.

export interface TableRow {
  // Rows are JSON objects with column-name keys. Most values are strings or
  // numbers; a few WMT1 cells nest sub-tables of manoeuvres. Some tables
  // (e.g. MPT1) have alternative columns per row, so values may be undefined.
  [column: string]: string | number | TableRow[] | undefined;
}

export interface CodexTable {
  title: string;
  rollIdentifier: string;
  notes: string | null;
  flavorText: string | null;
  data: TableRow[];
}

export type TablesCodex = Record<string, CodexTable>;
