import { Fragment } from "react";

import type { Character } from "@/types/character";
import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import {
  GODS,
  LARGE_ITEM_SLOTS,
  LEGEND_LEVELS,
  STATUS_PIPS,
  baselineHpForLevel,
} from "@/lib/character";
import { formatDiceSet, parseDiceSet } from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import { CharacterSwitcher } from "@/components/CharacterSwitcher";
import { NotesPanel } from "@/components/NotesPanel";
import {
  Button,
  Card,
  Field,
  NumberField,
  Pips,
  Stepper,
  TextArea,
  TextField,
  Toggle,
} from "@/components/ui";

type Patch = Partial<Character>;
interface SectionProps {
  character: Character;
  onPatch: (patch: Patch) => void;
}

// Two 1–6 selects rendered side-by-side. Persists as the canonical
// "⚂ ⚃" glyph string so combat's parser keeps recognising it; an unset
// die shows as "—" until both values are picked. Old free-text values
// stay readable thanks to parseDiceSet, which also accepts plain digits.
function DiceSetField({
  value,
  onChange,
  ariaLabelPrefix,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabelPrefix?: string;
}) {
  const parsed = parseDiceSet(value);
  const primary = parsed?.[0] ?? null;
  const secondary = parsed?.[1] ?? null;

  function commit(p: number | null, s: number | null) {
    if (p === null || s === null) {
      // Until both are picked, store empty so parseDiceSet returns null
      // (combat helper treats unparseable rows as inert).
      onChange("");
      return;
    }
    onChange(formatDiceSet(p, s));
  }

  return (
    <div className="flex items-center gap-1">
      <DieSelect
        value={primary}
        onChange={(n) => commit(n, secondary)}
        ariaLabel={ariaLabelPrefix ? `${ariaLabelPrefix} primary die` : undefined}
      />
      <DieSelect
        value={secondary}
        onChange={(n) => commit(primary, n)}
        ariaLabel={ariaLabelPrefix ? `${ariaLabelPrefix} secondary die` : undefined}
      />
    </div>
  );
}

function DieSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (next: number) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-zinc-300 bg-white px-1 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <option value="" disabled>
        —
      </option>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <option key={n} value={n}>
          {DICE_FACES[n - 1]} {n}
        </option>
      ))}
    </select>
  );
}

export default function SheetView() {
  const { characters, active, create, update, remove, setActive, replaceAll } =
    useCharacters();
  const { notes, replaceAll: replaceAllNotes } = useNotes();
  const { maps, replaceAll: replaceAllMaps } = useMapsV2();

  function patchActive(patch: Patch) {
    if (!active) return;
    update(active.id, patch);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <CharacterSwitcher
        characters={characters}
        notes={notes}
        maps={maps}
        active={active}
        onSelect={setActive}
        onCreate={() => create()}
        onDelete={remove}
        onReplaceAll={(nextChars, nextNotes, nextMaps) => {
          replaceAll(nextChars);
          replaceAllNotes(nextNotes);
          replaceAllMaps(nextMaps);
        }}
      />

      {!active ? (
        <EmptyState onCreate={() => create()} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <IdentityAndStats character={active} onPatch={patchActive} />
            <StatusCard character={active} onPatch={patchActive} />
            <ManoeuvresCard character={active} onPatch={patchActive} />
            <ResourcesCard character={active} onPatch={patchActive} />
            <ArmourCard character={active} onPatch={patchActive} />
            <GodsCard character={active} onPatch={patchActive} />
            <ScrollsCard character={active} onPatch={patchActive} />
            <LegendCard character={active} onPatch={patchActive} />
            <PotionsCard character={active} onPatch={patchActive} />
            <BackpackCard character={active} onPatch={patchActive} />
          </div>
          <NotesPanel
            target={{ kind: "character", id: active.id }}
            title={`Notes for ${active.name}`}
          />
        </>
      )}
    </section>
  );
}

// -- Empty state ------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">No character yet</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Create a character to start tracking HP, XP, gear, gods, and gold across
        your dungeon runs. Saved automatically in this browser.
      </p>
      <div className="mt-4">
        <Button variant="primary" onClick={onCreate}>
          + Create your first adventurer
        </Button>
      </div>
    </div>
  );
}

// -- Identity & stats -------------------------------------------------------

function IdentityAndStats({ character, onPatch }: SectionProps) {
  function patchHp(patch: Partial<Character["hp"]>) {
    onPatch({ hp: { ...character.hp, ...patch } });
  }
  return (
    <Card title="Identity & Stats" collapsible>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" className="sm:col-span-2">
          <TextField
            value={character.name}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </Field>
        <Field label="Level">
          <NumberField
            min={1}
            max={10}
            value={character.level}
            onChange={(e) => onPatch({ level: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Weapon" className="sm:col-span-2">
          <TextField
            value={character.weapon}
            onChange={(e) => onPatch({ weapon: e.target.value })}
            placeholder="Longsword / Greataxe / Heavy Mace"
          />
        </Field>
        <Field label="Applied Runes">
          <TextField
            value={character.appliedRunes}
            onChange={(e) => onPatch({ appliedRunes: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Health Points
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Stepper
              ariaLabel="Current HP"
              value={character.hp.current}
              onChange={(n) => patchHp({ current: n })}
              min={0}
              max={9999}
              width="w-20"
            />
            <span className="text-sm text-zinc-500">/</span>
            <Stepper
              ariaLabel="Baseline HP"
              value={character.hp.baseline}
              onChange={(n) => patchHp({ baseline: n })}
              min={1}
              max={9999}
              width="w-20"
            />
            <Button
              onClick={() => patchHp({ current: character.hp.baseline })}
              title="Set current HP to baseline"
            >
              Rest
            </Button>
            <Button
              onClick={() =>
                patchHp({ baseline: baselineHpForLevel(character.level) })
              }
              title={`Set baseline to ${baselineHpForLevel(character.level)} (10 × Level)`}
            >
              ↻ baseline
            </Button>
          </div>
        </div>
        <Field label="XP">
          <NumberField
            min={0}
            value={character.xp}
            onChange={(e) => onPatch({ xp: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label="Shift">
          <NumberField
            value={character.shift}
            onChange={(e) => onPatch({ shift: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Discipline">
          <NumberField
            value={character.discipline}
            onChange={(e) =>
              onPatch({ discipline: Number(e.target.value) || 0 })
            }
          />
        </Field>
        <Field label="Precision">
          <NumberField
            value={character.precision}
            onChange={(e) => onPatch({ precision: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
    </Card>
  );
}

// -- Manoeuvres -------------------------------------------------------------

function ManoeuvresCard({ character, onPatch }: SectionProps) {
  function setRow(i: number, patch: Partial<Character["manoeuvres"][number]>) {
    const next = character.manoeuvres.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ manoeuvres: next });
  }
  function add() {
    onPatch({
      manoeuvres: [
        ...character.manoeuvres,
        { name: "", diceSet: "", modifier: "" },
      ],
    });
  }
  function remove(i: number) {
    onPatch({ manoeuvres: character.manoeuvres.filter((_, idx) => idx !== i) });
  }

  return (
    <Card
      title="Manoeuvres"
      collapsible
      action={
        <Button onClick={add} title="Add a manoeuvre">
          + Add
        </Button>
      }
    >
      {character.manoeuvres.length === 0 ? (
        <EmptyRow text="No manoeuvres yet." />
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-sm">
          <HeaderCell>Name</HeaderCell>
          <HeaderCell>Dice Set</HeaderCell>
          <HeaderCell>Modifier</HeaderCell>
          <span />
          {character.manoeuvres.map((m, i) => (
            <Fragment key={i}>
              <TextField
                value={m.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder="e.g. Bash"
              />
              <DiceSetField
                value={m.diceSet}
                onChange={(next) => setRow(i, { diceSet: next })}
                ariaLabelPrefix={`Manoeuvre ${i + 1}`}
              />
              <TextField
                value={m.modifier}
                onChange={(e) => setRow(i, { modifier: e.target.value })}
                placeholder="e.g. D6 +2 damage"
              />
              <Button variant="danger" onClick={() => remove(i)} aria-label={`Remove manoeuvre ${i + 1}`}>
                ✕
              </Button>
            </Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}

// -- Armour -----------------------------------------------------------------

function ArmourCard({ character, onPatch }: SectionProps) {
  function setRow(i: number, patch: Partial<Character["armour"][number]>) {
    const next = character.armour.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ armour: next });
  }
  function add() {
    onPatch({
      armour: [...character.armour, { piece: "", diceSet: "", modifier: "" }],
    });
  }
  function remove(i: number) {
    onPatch({ armour: character.armour.filter((_, idx) => idx !== i) });
  }
  return (
    <Card
      title="Armour"
      collapsible
      action={<Button onClick={add}>+ Add</Button>}
    >
      {character.armour.length === 0 ? (
        <EmptyRow text="No armour equipped." />
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-sm">
          <HeaderCell>Piece</HeaderCell>
          <HeaderCell>Dice Set</HeaderCell>
          <HeaderCell>Modifier</HeaderCell>
          <span />
          {character.armour.map((a, i) => (
            <Fragment key={i}>
              <TextField
                value={a.piece}
                onChange={(e) => setRow(i, { piece: e.target.value })}
                placeholder="e.g. Jerkin"
              />
              <DiceSetField
                value={a.diceSet}
                onChange={(next) => setRow(i, { diceSet: next })}
                ariaLabelPrefix={`Armour ${i + 1}`}
              />
              <TextField
                value={a.modifier}
                onChange={(e) => setRow(i, { modifier: e.target.value })}
                placeholder="e.g. -1 damage"
              />
              <Button variant="danger" onClick={() => remove(i)} aria-label={`Remove armour ${i + 1}`}>
                ✕
              </Button>
            </Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}

// -- Magic Scrolls ----------------------------------------------------------

function ScrollsCard({ character, onPatch }: SectionProps) {
  function setRow(i: number, patch: Partial<Character["scrolls"][number]>) {
    const next = character.scrolls.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ scrolls: next });
  }
  function add() {
    onPatch({
      scrolls: [
        ...character.scrolls,
        { name: "", orbit: "", dispelDoubles: "", effectModifier: "" },
      ],
    });
  }
  function remove(i: number) {
    onPatch({ scrolls: character.scrolls.filter((_, idx) => idx !== i) });
  }
  return (
    <Card
      title="Magic Scrolls"
      collapsible
      defaultOpen={false}
      action={<Button onClick={add}>+ Add</Button>}
    >
      {character.scrolls.length === 0 ? (
        <EmptyRow text="No scrolls." />
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] items-center gap-2 text-sm">
          <HeaderCell>Name</HeaderCell>
          <HeaderCell>Orbit</HeaderCell>
          <HeaderCell>Dispel Doubles</HeaderCell>
          <HeaderCell>Effect Modifier</HeaderCell>
          <span />
          {character.scrolls.map((s, i) => (
            <Fragment key={i}>
              <TextField
                value={s.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <TextField
                value={s.orbit}
                onChange={(e) => setRow(i, { orbit: e.target.value })}
              />
              <TextField
                value={s.dispelDoubles}
                onChange={(e) => setRow(i, { dispelDoubles: e.target.value })}
              />
              <TextField
                value={s.effectModifier}
                onChange={(e) => setRow(i, { effectModifier: e.target.value })}
              />
              <Button variant="danger" onClick={() => remove(i)} aria-label={`Remove scroll ${i + 1}`}>
                ✕
              </Button>
            </Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}

// -- Magic Potions ----------------------------------------------------------

function PotionsCard({ character, onPatch }: SectionProps) {
  function setRow(i: number, patch: Partial<Character["potions"][number]>) {
    const next = character.potions.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ potions: next });
  }
  function add() {
    onPatch({
      potions: [...character.potions, { name: "", effectModifier: "" }],
    });
  }
  function remove(i: number) {
    onPatch({ potions: character.potions.filter((_, idx) => idx !== i) });
  }
  return (
    <Card
      title="Magic Potions"
      collapsible
      defaultOpen={false}
      action={
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{character.potions.length} / 5 carried</span>
          <Button onClick={add} disabled={character.potions.length >= 5}>
            + Add
          </Button>
        </span>
      }
    >
      {character.potions.length === 0 ? (
        <EmptyRow text="No potions." />
      ) : (
        <div className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 text-sm">
          <HeaderCell>Name</HeaderCell>
          <HeaderCell>Effect Modifier</HeaderCell>
          <span />
          {character.potions.map((p, i) => (
            <Fragment key={i}>
              <TextField
                value={p.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
              <TextField
                value={p.effectModifier}
                onChange={(e) => setRow(i, { effectModifier: e.target.value })}
              />
              <Button variant="danger" onClick={() => remove(i)} aria-label={`Remove potion ${i + 1}`}>
                ✕
              </Button>
            </Fragment>
          ))}
        </div>
      )}
    </Card>
  );
}

// -- Status -----------------------------------------------------------------

function StatusCard({ character, onPatch }: SectionProps) {
  function patchStatus(patch: Partial<Character["status"]>) {
    onPatch({ status: { ...character.status, ...patch } });
  }
  return (
    <Card title="Status Conditions" collapsible>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-20 font-medium text-red-700 dark:text-red-400">
            Bloodied
          </span>
          <Pips
            count={STATUS_PIPS}
            filled={character.status.bloodied}
            onChange={(n) => patchStatus({ bloodied: n })}
            ariaLabel="Bloodied pip"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-20 font-medium text-blue-700 dark:text-blue-400">
            Soaked
          </span>
          <Pips
            count={STATUS_PIPS}
            filled={character.status.soaked}
            onChange={(n) => patchStatus({ soaked: n })}
            ariaLabel="Soaked pip"
          />
        </div>
        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <Toggle
            checked={character.status.fever}
            onChange={(v) => patchStatus({ fever: v })}
            label="Fever — −1 HP per room until washed"
          />
          <Toggle
            checked={character.status.pneumonia}
            onChange={(v) => patchStatus({ pneumonia: v })}
            label="Pneumonia — −1 HP per room until heated"
          />
        </div>
      </div>
    </Card>
  );
}

// -- Resources --------------------------------------------------------------

function ResourcesCard({ character, onPatch }: SectionProps) {
  function patchCoins(patch: Partial<Character["coins"]>) {
    onPatch({ coins: { ...character.coins, ...patch } });
  }
  return (
    <Card title="Resources" collapsible defaultOpen={false}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="GC (gold)">
          <NumberField
            value={character.coins.gc}
            onChange={(e) => patchCoins({ gc: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="SC (silver)">
          <NumberField
            value={character.coins.sc}
            onChange={(e) => patchCoins({ sc: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="CC (copper)">
          <NumberField
            value={character.coins.cc}
            onChange={(e) => patchCoins({ cc: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <Field label="Treasure" className="mt-3">
        <TextArea
          rows={3}
          value={character.treasure}
          onChange={(e) => onPatch({ treasure: e.target.value })}
        />
      </Field>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Liberated Prisoners
          </span>
          <Stepper
            value={character.liberatedPrisoners}
            onChange={(n) => onPatch({ liberatedPrisoners: n })}
            ariaLabel="Liberated prisoners"
            width="w-16"
          />
        </div>
        <Field label="Side Quests">
          <TextArea
            rows={2}
            value={character.sideQuests}
            onChange={(e) => onPatch({ sideQuests: e.target.value })}
          />
        </Field>
      </div>
    </Card>
  );
}

// -- Gods -------------------------------------------------------------------

function GodsCard({ character, onPatch }: SectionProps) {
  function setFavour(god: string, n: number) {
    onPatch({ favour: { ...character.favour, [god]: n } });
  }
  return (
    <Card title="Favour of the Gods" collapsible defaultOpen={false}>
      <div className="space-y-2 text-sm">
        {GODS.map((g) => (
          <div key={g} className="flex items-center justify-between gap-2">
            <span>{g}</span>
            <Stepper
              ariaLabel={`Favour Points for ${g}`}
              value={character.favour[g] ?? 0}
              onChange={(n) => setFavour(g, n)}
              min={0}
              width="w-14"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

// -- Legend Status Tracker --------------------------------------------------

function LegendCard({ character, onPatch }: SectionProps) {
  function toggle(i: number) {
    const next = character.legendLevels.slice();
    next[i] = !next[i];
    onPatch({ legendLevels: next });
  }
  return (
    <Card title="Legend Status (levels cleared)" collapsible defaultOpen={false}>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: LEGEND_LEVELS }).map((_, i) => {
          const on = character.legendLevels[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              aria-label={`Level ${i + 1} cleared`}
              aria-pressed={on}
              className={`size-10 rounded-md border text-sm font-semibold ${
                on
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-zinc-300 bg-transparent text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// -- Backpack ---------------------------------------------------------------

function BackpackCard({ character, onPatch }: SectionProps) {
  function patchBackpack(patch: Partial<Character["backpack"]>) {
    onPatch({ backpack: { ...character.backpack, ...patch } });
  }
  function setLargeItem(i: number, value: string) {
    const next = character.backpack.largeItems.slice();
    next[i] = value;
    patchBackpack({ largeItems: next });
  }
  return (
    <Card title="Backpack" collapsible>
      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Large &amp; Heavy Items ({LARGE_ITEM_SLOTS} slots)
        </span>
        <ol className="space-y-1 text-sm">
          {character.backpack.largeItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-zinc-400">{i + 1}.</span>
              <TextField
                value={item}
                onChange={(e) => setLargeItem(i, e.target.value)}
              />
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Small Items">
          <TextArea
            rows={3}
            value={character.backpack.smallItems}
            onChange={(e) => patchBackpack({ smallItems: e.target.value })}
          />
        </Field>
        <Field label="Rations">
          <TextArea
            rows={3}
            value={character.backpack.rations}
            onChange={(e) => patchBackpack({ rations: e.target.value })}
          />
        </Field>
        <Field label="Loot Lockup">
          <TextArea
            rows={3}
            value={character.backpack.lootLockup}
            onChange={(e) => patchBackpack({ lootLockup: e.target.value })}
          />
        </Field>
        <Field label="Additional Notes">
          <TextArea
            rows={3}
            value={character.backpack.additionalNotes}
            onChange={(e) =>
              patchBackpack({ additionalNotes: e.target.value })
            }
          />
        </Field>
      </div>
    </Card>
  );
}

// -- Helpers ----------------------------------------------------------------

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="text-sm text-zinc-500">
      {text} <span className="text-zinc-400">Click + Add to start.</span>
    </p>
  );
}
