import type { Character } from "@/types/character";
import { useCharacters } from "@/hooks/useCharacters";
import { NotesPanel } from "@/components/NotesPanel";
import {
  ArmourCard,
  BackpackCard,
  GodsCard,
  IdentityAndStats,
  LegendCard,
  ManoeuvresCard,
  PotionsCard,
  ResourcesCard,
  ScrollsCard,
} from "@/views/Sheet";

// Story 1.5 — sub-tab navigation under PinnedVitals. Loadout is the
// default. Stories 1.6–1.9 will swap the body content for proper pickers
// and the magic [Use] button; for now each tab renders a curated subset
// of the existing v1 cards so navigation works in isolation.

export type SheetSubTab = "loadout" | "magic" | "pack" | "lore";

export const SHEET_SUB_TABS: { key: SheetSubTab; label: string; shortcut: string }[] = [
  { key: "loadout", label: "Loadout", shortcut: "1" },
  { key: "magic", label: "Magic", shortcut: "2" },
  { key: "pack", label: "Pack", shortcut: "3" },
  { key: "lore", label: "Lore", shortcut: "4" },
];

interface Props {
  active: SheetSubTab;
  onChange: (next: SheetSubTab) => void;
}

export function SheetTabs({ active, onChange }: Props) {
  const { active: character, update } = useCharacters();
  if (!character) return null; // PinnedVitals already handles empty states

  function patch(p: Partial<Character>) {
    update(character!.id, p);
  }

  return (
    <>
      <SubTabStrip active={active} onChange={onChange} />
      <div className="flex-1 overflow-auto p-3">
        <div className="space-y-3">
          {active === "loadout" && (
            <LoadoutBody character={character} onPatch={patch} />
          )}
          {active === "magic" && (
            <MagicBody character={character} onPatch={patch} />
          )}
          {active === "pack" && (
            <PackBody character={character} onPatch={patch} />
          )}
          {active === "lore" && (
            <LoreBody character={character} onPatch={patch} />
          )}
        </div>
      </div>
    </>
  );
}

function SubTabStrip({ active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Sheet sub-tabs"
      className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {SHEET_SUB_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            t.key === active
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ----- Tab bodies ---------------------------------------------------------
//
// Each body renders the v1 cards that map to its sub-tab. Stories 1.6–1.9
// replace each body wholesale; until then the cards keep the Sheet usable.

interface BodyProps {
  character: Character;
  onPatch: (patch: Partial<Character>) => void;
}

function LoadoutBody({ character, onPatch }: BodyProps) {
  // IdentityAndStats stays here transitionally so the Weapon picker and
  // Applied Runes are still editable. PinnedVitals already covers the
  // identity/HP/stat fields above; expect to drop the redundant header
  // when Story 1.6 ships the proper Weapon picker.
  return (
    <>
      <IdentityAndStats character={character} onPatch={onPatch} />
      <ManoeuvresCard character={character} onPatch={onPatch} />
      <ArmourCard character={character} onPatch={onPatch} />
    </>
  );
}

function MagicBody({ character, onPatch }: BodyProps) {
  return (
    <>
      <ScrollsCard character={character} onPatch={onPatch} />
      <PotionsCard character={character} onPatch={onPatch} />
    </>
  );
}

function PackBody({ character, onPatch }: BodyProps) {
  return (
    <>
      <ResourcesCard character={character} onPatch={onPatch} />
      <BackpackCard character={character} onPatch={onPatch} />
    </>
  );
}

function LoreBody({ character, onPatch }: BodyProps) {
  return (
    <>
      <GodsCard character={character} onPatch={onPatch} />
      <LegendCard character={character} onPatch={onPatch} />
      <NotesPanel
        target={{ kind: "character", id: character.id }}
        title={`Notes for ${character.name}`}
      />
    </>
  );
}
