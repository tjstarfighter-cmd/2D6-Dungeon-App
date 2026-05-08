import { CharacterSwitcher } from "@/components/CharacterSwitcher";
import { Modal } from "@/components/Modal";
import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";

// Story 1.4 wraps the existing inline CharacterSwitcher in a modal so the
// new Sheet-column [↻] button has a working entry point. Story 1.10 adds
// the Past Runs section + new-character wizard launch.
export function CharacterSwitcherModal({ onClose }: { onClose: () => void }) {
  const { characters, active, create, remove, setActive, replaceAll } =
    useCharacters();
  const { notes, replaceAll: replaceAllNotes } = useNotes();
  const { maps, replaceAll: replaceAllMaps } = useMapsV2();

  return (
    <Modal title="Character switcher" onClose={onClose}>
      <CharacterSwitcher
        characters={characters}
        notes={notes}
        maps={maps}
        active={active}
        onSelect={(id) => {
          setActive(id);
          onClose();
        }}
        onCreate={() => {
          create();
          onClose();
        }}
        onDelete={(id) => {
          remove(id);
        }}
        onReplaceAll={(nextChars, nextNotes, nextMaps) => {
          replaceAll(nextChars);
          replaceAllNotes(nextNotes);
          replaceAllMaps(nextMaps);
          onClose();
        }}
      />
    </Modal>
  );
}
