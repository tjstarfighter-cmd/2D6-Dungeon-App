import type { CreaturesIndex } from "@/types/creatures";
import type { NoteEntryType } from "@/types/notes";
import { extractReferencedTableIds } from "@/lib/tables";

// Story 6.5 — parse a rolled-cell text from a contents table into
// proposed log entries. Surface concerns (modal, confirmation flow)
// stay out of this module; the parser is pure so it's easy to unit-
// test and reuse from any caller (room-gen flow today, possibly other
// auto-suggest flows later).

export interface ParsedEntry {
  /** Stable id for React keys + tracking edits in the preview modal. */
  id: string;
  type: NoteEntryType;
  body: string;
  /** Filled for table-id matches so the resulting Note can auto-resolve
   *  when the player rolls on that table. */
  tableRef?: string;
  /** Filled for creature matches so the Combat picker can pre-populate
   *  the right card. Stores the creature record's key (filename stem). */
  creatureKey?: string;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** The original rolled-cell text. Surfaced in the preview so the user
   *  can sanity-check the parser's interpretation. */
  rawText: string;
}

/**
 * Parse a rolled-cell text. Order of operations:
 * 1. Extract known table-id references (longest-id wins, word-boundary).
 * 2. Match creature names case-insensitively, longest-name first to
 *    prevent shorter names absorbing matches inside compound names.
 * 3. If neither produced anything, surface the raw text as a single
 *    Event entry so the player still has a one-tap log path.
 */
export function parseContentsCellText(
  text: string,
  knownTableIds: ReadonlyArray<string>,
  creatures: CreaturesIndex,
): ParseResult {
  const trimmed = (text ?? "").trim();
  const entries: ParsedEntry[] = [];

  // ---- Table-id refs --------------------------------------------------
  const tableIds = extractReferencedTableIds(trimmed, knownTableIds);
  for (const id of tableIds) {
    entries.push({
      id: `table-${id}`,
      // Treasure-shaped table IDs surface as Loot; everything else is a
      // generic Roll entry. The classification is heuristic — players
      // can change the entry type from the preview's Edit panel.
      type: looksLikeLoot(id) ? "Loot" : "Roll",
      body: `${id} — see table`,
      tableRef: id,
    });
  }

  // ---- Creature names -------------------------------------------------
  // Build a case-insensitive name → key map. Skip empty / placeholder
  // entries so we don't match "" everywhere.
  const creatureNames: Array<{ name: string; key: string }> = [];
  for (const [key, rec] of Object.entries(creatures)) {
    const name = rec.name?.trim();
    if (!name) continue;
    creatureNames.push({ name, key });
  }
  // Longest first so "Goblin Shaman" wins over "Goblin".
  creatureNames.sort((a, b) => b.name.length - a.name.length);

  const lower = trimmed.toLowerCase();
  const creatureSpans: Array<{ start: number; end: number }> = [];
  for (const { name, key } of creatureNames) {
    const needle = name.toLowerCase();
    let from = 0;
    while (from <= lower.length - needle.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      // Word-boundary check.
      const before = idx > 0 ? lower[idx - 1] : "";
      const after = end < lower.length ? lower[end] : "";
      const isWord = (c: string) => /[a-z0-9_]/.test(c);
      if (isWord(before) || isWord(after)) {
        from = idx + 1;
        continue;
      }
      // Already covered by a longer name?
      const overlapped = creatureSpans.some(
        (s) => s.start <= idx && s.end >= end,
      );
      if (overlapped) {
        from = end;
        continue;
      }
      creatureSpans.push({ start: idx, end });
      entries.push({
        id: `creature-${key}-${idx}`,
        type: "Combat",
        body: name,
        creatureKey: key,
      });
      from = end;
    }
  }

  // ---- Fallback: raw text as Event ------------------------------------
  if (entries.length === 0 && trimmed) {
    entries.push({
      id: "raw-text",
      type: "Event",
      body: trimmed,
    });
  }

  return { entries, rawText: trimmed };
}

// Heuristic: tables whose IDs hint at loot/treasure surface as Loot
// entries by default. Pure pattern matching — no codex lookup so the
// parser stays cheap and side-effect-free.
const LOOT_HINTS = ["LOOT", "TREASURE", "POUCH", "BAG", "CHEST", "URN", "SARC"];
function looksLikeLoot(id: string): boolean {
  const upper = id.toUpperCase();
  return LOOT_HINTS.some((h) => upper.includes(h));
}

/**
 * Compose a single human-readable summary line for the preview header,
 * e.g. "Detected: 1 Combat (Stupid Rat), 1 Loot (T1).".
 */
export function summarizeParseResult(result: ParseResult): string {
  if (result.entries.length === 0) return "Nothing detected.";
  const buckets = new Map<NoteEntryType, string[]>();
  for (const e of result.entries) {
    const list = buckets.get(e.type) ?? [];
    list.push(e.body.replace(/\s+—.*$/, "").trim() || e.tableRef || "");
    buckets.set(e.type, list);
  }
  const parts: string[] = [];
  for (const [type, items] of buckets) {
    parts.push(`${items.length} ${type} (${items.join(", ")})`);
  }
  return `Detected: ${parts.join(", ")}.`;
}
