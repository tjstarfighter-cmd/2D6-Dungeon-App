import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { Character } from "@/types/character";
import { useCharacters } from "@/hooks/useCharacters";
import { NotesPanel } from "@/components/NotesPanel";
import { Button, Card, Field, TextField } from "@/components/ui";
import {
  ArmourCard,
  BackpackCard,
  GodsCard,
  LegendCard,
  ManoeuvresCard,
  ResourcesCard,
  WeaponField,
} from "@/views/Sheet";
import { MagicPotionsCard, MagicScrollsCard } from "@/components/MagicCards";

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
  return (
    <>
      <WeaponAndRunesCard character={character} onPatch={onPatch} />
      <ManoeuvresCard character={character} onPatch={onPatch} />
      <ArmourCard character={character} onPatch={onPatch} />
    </>
  );
}

// ---- Weapon + Applied Runes card -----------------------------------------
//
// Story 1.6 splits Weapon and Applied Runes out of the legacy IdentityAndStats
// card so PinnedVitals owns name/HP/stats while Loadout owns the gear that
// drives Manoeuvres and combat.
//
// Applied Runes is still persisted as a comma-separated string for backward
// compatibility with existing saves; this editor surfaces each rune as a
// removable chip and adds new ones with an inline input.
function WeaponAndRunesCard({ character, onPatch }: BodyProps) {
  const runes = character.appliedRunes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function setRunes(next: string[]) {
    onPatch({ appliedRunes: next.join(", ") });
  }

  return (
    <Card title="Weapon & Applied Runes" collapsible>
      <Field label="Weapon">
        <WeaponField
          value={character.weapon}
          onChange={(next) => onPatch({ weapon: next })}
        />
      </Field>

      <div className="mt-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Applied Runes
        </div>
        {runes.length === 0 ? (
          <p className="text-sm text-zinc-500">No runes applied.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {runes.map((r, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <span>{r}</span>
                <button
                  type="button"
                  onClick={() => setRunes(runes.filter((_, idx) => idx !== i))}
                  aria-label={`Remove rune ${r}`}
                  className="rounded-full px-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddRune onAdd={(rune) => setRunes([...runes, rune])} />
      </div>
    </Card>
  );
}

function AddRune({ onAdd }: { onAdd: (rune: string) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <div className="mt-2 flex gap-2">
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a rune…"
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <Button onClick={commit} disabled={!draft.trim()}>
        + Add
      </Button>
    </div>
  );
}

function MagicBody({ character, onPatch }: BodyProps) {
  return (
    <>
      <MagicScrollsCard character={character} onPatch={onPatch} />
      <MagicPotionsCard character={character} onPatch={onPatch} />
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
