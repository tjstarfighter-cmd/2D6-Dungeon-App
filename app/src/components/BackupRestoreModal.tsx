import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import {
  downloadText,
  parseImport,
  pickJsonFile,
  serialiseBackup,
} from "@/lib/io";

// Minimal Backup & restore surface for Story 1.2. Story 8.2 replaces this
// with the full Full Backup · Full Restore · Selective Delete UI; for now
// we only need full export + full import so users have a backup gesture
// available from the [⋯] / [⚙] menus today.

export function BackupRestoreModal({ onClose }: { onClose: () => void }) {
  const { characters: chars, replaceAll: replaceChars } = useCharacters();
  const { notes, replaceAll: replaceNotes } = useNotes();
  const { maps, replaceAll: replaceMaps } = useMapsV2();

  function handleExport() {
    const text = serialiseBackup(chars, notes, maps);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`2d6d-backup-${stamp}.json`, text);
  }

  async function handleImport() {
    const text = await pickJsonFile();
    if (text == null) return;
    const result = parseImport(text);
    if (result.errors.length > 0) {
      alert(`Import had problems:\n${result.errors.join("\n")}`);
      if (
        result.characters.length === 0 &&
        result.notes.length === 0 &&
        result.maps.length === 0
      ) {
        return;
      }
    }
    if (
      (chars.length > 0 || notes.length > 0 || maps.length > 0) &&
      !confirm(
        `Replace current data (${chars.length} characters, ${notes.length} notes, ${maps.length} maps) ` +
          `with imported data (${result.characters.length} characters, ${result.notes.length} notes, ${result.maps.length} maps)?`,
      )
    ) {
      return;
    }
    replaceChars(result.characters);
    replaceNotes(result.notes);
    replaceMaps(result.maps);
    onClose();
  }

  return (
    <Modal title="Backup & restore" onClose={onClose}>
      <p className="text-zinc-600 dark:text-zinc-400">
        Export everything to a JSON file you can keep, or restore an existing
        backup. Selective delete and per-run PDF export ship in Story 8.2.
      </p>
      <dl className="mt-4 space-y-3 text-zinc-700 dark:text-zinc-300">
        <div className="flex items-center justify-between gap-3">
          <div>
            <dt className="font-semibold">Export all data</dt>
            <dd className="text-xs text-zinc-500">
              {chars.length} characters · {maps.length} maps · {notes.length}{" "}
              notes
            </dd>
          </div>
          <Button onClick={handleExport}>Export…</Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <dt className="font-semibold">Restore from backup</dt>
            <dd className="text-xs text-zinc-500">
              Replaces all current data after a confirmation prompt.
            </dd>
          </div>
          <Button onClick={handleImport}>Import…</Button>
        </div>
      </dl>
    </Modal>
  );
}
