import type { Character } from "@/types/character";
import type { Note } from "@/types/notes";

const EXPORT_VERSION = 2;

interface ExportPayloadV2 {
  format: "2d6d-export";
  version: number;
  exportedAt: string;
  characters: Character[];
  notes: Note[];
}

/** Serialise a backup blob containing characters + notes. */
export function serialiseBackup(
  characters: Character[],
  notes: Note[],
): string {
  const payload: ExportPayloadV2 = {
    format: "2d6d-export",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    characters,
    notes,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  characters: Character[];
  notes: Note[];
  errors: string[];
}

/**
 * Parse an export blob. Tolerant: accepts a bare characters array
 * (legacy v1), a v1 wrapper (no notes), or a v2 wrapper (with notes).
 */
export function parseImport(text: string): ImportResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      characters: [],
      notes: [],
      errors: [`Not valid JSON: ${(e as Error).message}`],
    };
  }

  let charactersRaw: unknown;
  let notesRaw: unknown = [];
  if (Array.isArray(raw)) {
    charactersRaw = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Partial<ExportPayloadV2>;
    if (Array.isArray(obj.characters)) {
      charactersRaw = obj.characters;
      if (Array.isArray(obj.notes)) notesRaw = obj.notes;
    } else {
      return {
        characters: [],
        notes: [],
        errors: ["Expected an array of characters or an export payload."],
      };
    }
  } else {
    return {
      characters: [],
      notes: [],
      errors: ["Expected an array of characters or an export payload."],
    };
  }

  const characters: Character[] = [];
  (charactersRaw as unknown[]).forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`Character ${i}: not an object`);
      return;
    }
    const c = item as Character;
    if (typeof c.id !== "string" || typeof c.name !== "string") {
      errors.push(`Character ${i}: missing required fields (id, name)`);
      return;
    }
    characters.push(c);
  });

  const notes: Note[] = [];
  (notesRaw as unknown[]).forEach((item, i) => {
    if (!item || typeof item !== "object") {
      errors.push(`Note ${i}: not an object`);
      return;
    }
    const n = item as Note;
    if (typeof n.id !== "string" || typeof n.body !== "string") {
      errors.push(`Note ${i}: missing required fields (id, body)`);
      return;
    }
    notes.push(n);
  });

  return { characters, notes, errors };
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadText(filename: string, text: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Read a single user-selected file as text. Resolves to null if cancelled. */
export function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
