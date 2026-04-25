import { useId } from "react";

import type { Character } from "@/types/character";
import type { Note } from "@/types/notes";
import { Button } from "@/components/ui";
import {
  downloadText,
  parseImport,
  pickJsonFile,
  serialiseBackup,
} from "@/lib/io";

interface Props {
  characters: Character[];
  notes: Note[];
  active: Character | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onReplaceAll: (characters: Character[], notes: Note[]) => void;
}

export function CharacterSwitcher({
  characters,
  notes,
  active,
  onSelect,
  onCreate,
  onDelete,
  onReplaceAll,
}: Props) {
  const selectId = useId();

  async function handleImport() {
    const text = await pickJsonFile();
    if (text == null) return;
    const result = parseImport(text);
    if (result.errors.length > 0) {
      alert(`Import had problems:\n${result.errors.join("\n")}`);
      if (result.characters.length === 0 && result.notes.length === 0) return;
    }
    if (
      (characters.length > 0 || notes.length > 0) &&
      !confirm(
        `Replace current data (${characters.length} characters, ${notes.length} notes) ` +
          `with imported data (${result.characters.length} characters, ${result.notes.length} notes)?`,
      )
    ) {
      return;
    }
    onReplaceAll(result.characters, result.notes);
  }

  function handleExport() {
    const text = serialiseBackup(characters, notes);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`2d6d-backup-${stamp}.json`, text);
  }

  function handleDelete() {
    if (!active) return;
    if (
      confirm(
        `Delete character "${active.name}"? This cannot be undone (export first if you want a backup).`,
      )
    ) {
      onDelete(active.id);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grow">
        <label
          htmlFor={selectId}
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Active Character
        </label>
        <select
          id={selectId}
          value={active?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={characters.length === 0}
          className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {characters.length === 0 && <option value="">(no characters yet)</option>}
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — Level {c.level}
            </option>
          ))}
        </select>
      </div>
      <Button variant="primary" onClick={onCreate}>
        + New
      </Button>
      <Button onClick={handleImport}>Import…</Button>
      <Button onClick={handleExport} disabled={characters.length === 0 && notes.length === 0}>
        Export
      </Button>
      <Button variant="danger" onClick={handleDelete} disabled={!active}>
        Delete
      </Button>
    </div>
  );
}
