import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";

import type {
  ArmourSlot,
  Character,
  ManoeuvreSlot,
  PotionSlot,
  ScrollSlot,
} from "@/types/character";
import { useCharacters } from "@/hooks/useCharacters";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import { preloadTables, useTablesData } from "@/data/lazy";
import {
  GODS,
  LARGE_ITEM_SLOTS,
  LEGEND_LEVELS,
  STATUS_PIPS,
  baselineHpForLevel,
} from "@/lib/character";
import { formatDiceSet, parseDiceSet } from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import type { TableRow } from "@/types/tables";
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
  // Hold partial picks locally — parseDiceSet returns null until both dice are
  // present, so without this the first pick would visibly disappear.
  const [pending, setPending] = useState<{
    primary: number | null;
    secondary: number | null;
  }>({ primary: null, secondary: null });

  // Drop pending state when value changes from outside (character switch,
  // import, etc.) so a half-finished pick doesn't leak across rows.
  useEffect(() => {
    setPending({ primary: null, secondary: null });
  }, [value]);

  const primary = parsed?.[0] ?? pending.primary;
  const secondary = parsed?.[1] ?? pending.secondary;

  function commit(p: number | null, s: number | null) {
    if (p === null || s === null) {
      setPending({ primary: p, secondary: s });
      return;
    }
    setPending({ primary: null, secondary: null });
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

// Weapon picker: the three core weapons from WMT1, plus "Custom…" so a
// homebrew weapon name still survives. The dropdown drives the manoeuvre
// picker in ManoeuvresCard, so keeping the value snapped to the canonical
// names is what makes that drawer auto-lock to the right table row.
const WEAPON_OPTIONS = ["Longsword", "Greataxe", "Heavy Mace"] as const;

function WeaponField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const isPreset = (WEAPON_OPTIONS as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(!isPreset && value.length > 0);

  // If the value gets set to a preset from elsewhere (import, etc.), drop
  // out of custom mode so the dropdown reflects the real value.
  useEffect(() => {
    if (isPreset) setCustomMode(false);
  }, [isPreset]);

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Weapon"
        value={customMode ? "__custom" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom") {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(v);
          }
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">—</option>
        {WEAPON_OPTIONS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
        <option value="__custom">Custom…</option>
      </select>
      {customMode && (
        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Weapon name"
        />
      )}
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
          <WeaponField
            value={character.weapon}
            onChange={(next) => onPatch({ weapon: next })}
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
  const [pickerOpen, setPickerOpen] = useState(false);

  // Warm the tables chunk so opening the picker doesn't suspend visibly.
  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<Character["manoeuvres"][number]>) {
    const next = character.manoeuvres.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ manoeuvres: next });
  }
  function addBlank() {
    onPatch({
      manoeuvres: [
        ...character.manoeuvres,
        { name: "", diceSet: "", modifier: "" },
      ],
    });
  }
  function addFromTable(slot: ManoeuvreSlot) {
    onPatch({ manoeuvres: [...character.manoeuvres, slot] });
  }
  function remove(i: number) {
    onPatch({ manoeuvres: character.manoeuvres.filter((_, idx) => idx !== i) });
  }

  return (
    <Card
      title="Manoeuvres"
      collapsible
      action={
        <div className="flex gap-2">
          <Button onClick={addBlank} title="Add a blank manoeuvre row">
            + Custom
          </Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
            title="Pick from the Weapon Manoeuvres table"
          >
            {pickerOpen ? "Close picker" : "+ From table"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <Suspense
          fallback={
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
              Loading manoeuvres…
            </p>
          }
        >
          <ManoeuvrePicker
            weapon={character.weapon}
            level={character.level}
            existing={character.manoeuvres}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}

      {character.manoeuvres.length === 0 ? (
        !pickerOpen && <EmptyRow text="No manoeuvres yet." />
      ) : (
        <div
          className={`grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-sm ${
            pickerOpen ? "mt-3" : ""
          }`}
        >
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

// Picker drawer that reads WMT1, filters to the character's weapon, and lists
// Level 1..N manoeuvres (N capped at character level). Roll button picks a
// random row from the visible pool. Clicking any row appends it to the sheet.
function ManoeuvrePicker({
  weapon,
  level,
  existing,
  onPick,
}: {
  weapon: string;
  level: number;
  existing: ManoeuvreSlot[];
  onPick: (slot: ManoeuvreSlot) => void;
}) {
  const tables = useTablesData();
  const [selectedWeapon, setSelectedWeapon] = useState(weapon || "");
  const [rolledKey, setRolledKey] = useState<string | null>(null);
  const rolledRef = useRef<HTMLLIElement | null>(null);

  const wmt1 = tables.WMT1;

  const weapons = useMemo<string[]>(() => {
    if (!wmt1) return [];
    return wmt1.data
      .map((row) => String(row.WEAPON ?? ""))
      .filter((w) => w.length > 0);
  }, [wmt1]);

  // If the character's weapon string matches a table entry case-insensitively,
  // prefer that over whatever the user last clicked in the picker.
  const matchedFromCharacter = useMemo(() => {
    const w = (weapon || "").toLowerCase().trim();
    if (!w) return "";
    return weapons.find((x) => x.toLowerCase() === w) ?? "";
  }, [weapons, weapon]);

  const effectiveWeapon =
    matchedFromCharacter || selectedWeapon || weapons[0] || "";

  const weaponRow = useMemo(
    () => wmt1?.data.find((r) => r.WEAPON === effectiveWeapon),
    [wmt1, effectiveWeapon],
  );

  // Levels in the table are "Level 1 Manoeuvres", "Level 2 Manoeuvres", …
  // Cap at character level so a L1 character can't browse L3 tables.
  const groups = useMemo(() => {
    if (!weaponRow) return [];
    const out: { level: number; rows: TableRow[] }[] = [];
    for (let i = 1; i <= level; i++) {
      const cell = weaponRow[`Level ${i} Manoeuvres`];
      if (Array.isArray(cell)) out.push({ level: i, rows: cell as TableRow[] });
    }
    return out;
  }, [weaponRow, level]);

  const flatRows = useMemo(
    () => groups.flatMap((g) => g.rows.map((r, i) => ({ ...r, _key: `L${g.level}-${i}` }))),
    [groups],
  );

  function rollRandom() {
    if (flatRows.length === 0) return;
    const pick = flatRows[Math.floor(Math.random() * flatRows.length)];
    setRolledKey(pick._key as string);
    // Defer scroll until the highlight class is applied.
    requestAnimationFrame(() => {
      rolledRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function pickRow(row: TableRow) {
    onPick({
      name: String(row.Manoeuvre ?? ""),
      diceSet: String(row.Roll ?? ""),
      modifier: String(row.Damage ?? ""),
    });
  }

  if (!wmt1) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        Weapon Manoeuvres table (WMT1) not found in this codex.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 text-sm">
          <span className="text-zinc-500">Weapon</span>
          <select
            value={effectiveWeapon}
            onChange={(e) => setSelectedWeapon(e.target.value)}
            disabled={!!matchedFromCharacter}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-900"
            title={
              matchedFromCharacter
                ? "Driven by the Weapon field on the sheet — change it there to switch tables"
                : "Pick a weapon to view its manoeuvres"
            }
          >
            {weapons.length === 0 && <option value="">(no weapons)</option>}
            {weapons.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-zinc-500">
          Showing Level 1–{level}
        </span>
        <Button
          onClick={rollRandom}
          disabled={flatRows.length === 0}
          title="Roll a random manoeuvre across all visible levels"
        >
          🎲 Roll
        </Button>
        <span className="ml-auto text-xs text-zinc-500">
          Click any row to add it
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No manoeuvres available for {effectiveWeapon || "this weapon"} at
          Level {level}.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.level}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Level {g.level}
              </h4>
              <ul className="space-y-1">
                {g.rows.map((row, i) => {
                  const key = `L${g.level}-${i}`;
                  const rolled = rolledKey === key;
                  const name = String(row.Manoeuvre ?? "");
                  const dup = existing.some(
                    (m) => m.name.trim().toLowerCase() === name.toLowerCase(),
                  );
                  return (
                    <li
                      key={key}
                      ref={rolled ? rolledRef : undefined}
                      className={`rounded-md border ${
                        rolled
                          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pickRow(row)}
                        className="grid w-full grid-cols-[auto_auto_1fr_1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <span className="font-mono text-base">{String(row.Roll ?? "")}</span>
                        {rolled && (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                            Rolled
                          </span>
                        )}
                        <span className={rolled ? "" : "col-start-3"}>
                          <span className="font-medium">{name}</span>
                        </span>
                        <span className="text-xs text-zinc-500">{String(row.Damage ?? "")}</span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {dup ? "(already added)" : "+ Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Armour -----------------------------------------------------------------

function ArmourCard({ character, onPatch }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<Character["armour"][number]>) {
    const next = character.armour.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ armour: next });
  }
  function addBlank() {
    onPatch({
      armour: [...character.armour, { piece: "", diceSet: "", modifier: "" }],
    });
  }
  function addFromTable(slot: ArmourSlot) {
    onPatch({ armour: [...character.armour, slot] });
  }
  function remove(i: number) {
    onPatch({ armour: character.armour.filter((_, idx) => idx !== i) });
  }
  return (
    <Card
      title="Armour"
      collapsible
      action={
        <div className="flex gap-2">
          <Button onClick={addBlank} title="Add a blank armour row">
            + Custom
          </Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
            title="Pick from the AT1 armour catalog"
          >
            {pickerOpen ? "Close picker" : "+ From table"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <Suspense
          fallback={
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
              Loading armour…
            </p>
          }
        >
          <ArmourPicker
            level={character.level}
            existing={character.armour}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}

      {character.armour.length === 0 ? (
        !pickerOpen && <EmptyRow text="No armour equipped." />
      ) : (
        <div
          className={`grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-sm ${
            pickerOpen ? "mt-3" : ""
          }`}
        >
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

// Armour picker: AT1 holds the full catalog (piece, dice set, modifier, cost);
// ART1–ART4 are the per-tier rolling tables. We use ART1–ART4 to assign each
// AT1 row a tier (1–4); items not in any ART table are bucketed as "Top tier".
// Default visible tiers = 1..character.level, with a "Show all" toggle.
function ArmourPicker({
  level,
  existing,
  onPick,
}: {
  level: number;
  existing: ArmourSlot[];
  onPick: (slot: ArmourSlot) => void;
}) {
  const tables = useTablesData();
  const [showAll, setShowAll] = useState(false);
  const [rolledKey, setRolledKey] = useState<string | null>(null);
  const rolledRef = useRef<HTMLLIElement | null>(null);

  const at1 = tables.AT1;

  // Build name → tier map from ART1..ART4. Names are normalized (uppercased,
  // stripped of punctuation) because ART tables sometimes drop apostrophes
  // ("BISHOPS MANTLE" vs AT1's "BISHOP'S MANTLE").
  const tierByName = useMemo(() => {
    const map = new Map<string, number>();
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const sources: [string, number][] = [
      ["ART1_RANDOM", 1],
      ["ART2", 2],
      ["ART3", 3],
      ["ART4", 4],
    ];
    for (const [key, tier] of sources) {
      const t = tables[key];
      if (!t) continue;
      for (const row of t.data) {
        const name = String(row.ITEM ?? "");
        if (name) map.set(norm(name), tier);
      }
    }
    return { map, norm };
  }, [tables]);

  function tierFor(piece: string): number {
    return tierByName.map.get(tierByName.norm(piece)) ?? 5;
  }

  const groups = useMemo(() => {
    if (!at1) return [];
    const buckets = new Map<number, TableRow[]>();
    for (const row of at1.data) {
      const piece = String(row["ARMOUR TYPE"] ?? "");
      if (!piece) continue;
      const tier = tierFor(piece);
      if (!showAll && tier > level) continue;
      if (!buckets.has(tier)) buckets.set(tier, []);
      buckets.get(tier)!.push(row);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, rows]) => ({ tier, rows }));
  }, [at1, level, showAll, tierByName]);

  const flatRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.rows.map((r, i) => ({ row: r, key: `T${g.tier}-${i}` })),
      ),
    [groups],
  );

  function rollRandom() {
    if (flatRows.length === 0) return;
    const pick = flatRows[Math.floor(Math.random() * flatRows.length)];
    setRolledKey(pick.key);
    requestAnimationFrame(() => {
      rolledRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function pickRow(row: TableRow) {
    onPick({
      piece: String(row["ARMOUR TYPE"] ?? ""),
      diceSet: String(row["DICE SET"] ?? ""),
      modifier: String(row.MODIFIER ?? ""),
    });
  }

  if (!at1) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        Armour table (AT1) not found in this codex.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">
          {showAll ? "Showing all tiers" : `Showing T1–T${level}`}
        </span>
        <label className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="size-3.5"
          />
          Show all tiers
        </label>
        <Button
          onClick={rollRandom}
          disabled={flatRows.length === 0}
          title="Roll a random armour piece across all visible tiers"
        >
          🎲 Roll
        </Button>
        <span className="ml-auto text-xs text-zinc-500">
          Click any row to add it
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">No armour available.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.tier}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {g.tier <= 4 ? `Tier ${g.tier}` : "Top tier"}
              </h4>
              <ul className="space-y-1">
                {g.rows.map((row, i) => {
                  const key = `T${g.tier}-${i}`;
                  const rolled = rolledKey === key;
                  const piece = String(row["ARMOUR TYPE"] ?? "");
                  const dup = existing.some(
                    (a) => a.piece.trim().toLowerCase() === piece.toLowerCase(),
                  );
                  return (
                    <li
                      key={key}
                      ref={rolled ? rolledRef : undefined}
                      className={`rounded-md border ${
                        rolled
                          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pickRow(row)}
                        className="grid w-full grid-cols-[1fr_auto_auto_auto_auto] items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <span className="font-medium">{piece}</span>
                        <span className="font-mono text-base">{String(row["DICE SET"] ?? "")}</span>
                        <span className="text-xs text-zinc-500">{String(row.MODIFIER ?? "")}</span>
                        <span className="text-xs text-zinc-400">{String(row.COST ?? "")}</span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {rolled ? "Rolled · + Add" : dup ? "(already added)" : "+ Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Magic Scrolls ----------------------------------------------------------

function ScrollsCard({ character, onPatch }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<Character["scrolls"][number]>) {
    const next = character.scrolls.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ scrolls: next });
  }
  function addBlank() {
    onPatch({
      scrolls: [
        ...character.scrolls,
        { name: "", orbit: "", dispelDoubles: "", effectModifier: "" },
      ],
    });
  }
  function addFromTable(slot: ScrollSlot) {
    onPatch({ scrolls: [...character.scrolls, slot] });
  }
  function remove(i: number) {
    onPatch({ scrolls: character.scrolls.filter((_, idx) => idx !== i) });
  }
  return (
    <Card
      title="Magic Scrolls"
      collapsible
      defaultOpen={false}
      action={
        <div className="flex gap-2">
          <Button onClick={addBlank} title="Add a blank scroll row">
            + Custom
          </Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
            title="Pick from the MST1 scroll catalog"
          >
            {pickerOpen ? "Close picker" : "+ From table"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <Suspense
          fallback={
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
              Loading scrolls…
            </p>
          }
        >
          <ScrollPicker
            level={character.level}
            existing={character.scrolls}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}

      {character.scrolls.length === 0 ? (
        !pickerOpen && <EmptyRow text="No scrolls." />
      ) : (
        <div
          className={`grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] items-center gap-2 text-sm ${
            pickerOpen ? "mt-3" : ""
          }`}
        >
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

// Scroll picker: MST1 holds the catalog (name, orbit, dispel ds, effect, …);
// SCT1–SCT4 are the per-tier rolling tables. Same shape as ArmourPicker.
function ScrollPicker({
  level,
  existing,
  onPick,
}: {
  level: number;
  existing: ScrollSlot[];
  onPick: (slot: ScrollSlot) => void;
}) {
  const tables = useTablesData();
  const [showAll, setShowAll] = useState(false);
  const [rolledKey, setRolledKey] = useState<string | null>(null);
  const rolledRef = useRef<HTMLLIElement | null>(null);

  const mst1 = tables.MST1;

  // Strip "SCROLL OF " prefix and non-alphanumerics so SCT4's
  // "SCROLL OF SURGING HEALTH" matches MST1's "SURGING HEALTH" column value.
  const norm = (s: string) =>
    s.toUpperCase().replace(/^SCROLL OF /, "").replace(/[^A-Z0-9]/g, "");

  const tierByName = useMemo(() => {
    const map = new Map<string, number>();
    const sources: [string, number][] = [
      ["SCT1", 1],
      ["SCT2", 2],
      ["SCT3", 3],
      ["SCT4", 4],
    ];
    for (const [key, tier] of sources) {
      const t = tables[key];
      if (!t) continue;
      for (const row of t.data) {
        const name = String(row.ITEM ?? "");
        if (name) map.set(norm(name), tier);
      }
    }
    return map;
  }, [tables]);

  function tierFor(name: string): number {
    return tierByName.get(norm(name)) ?? 5;
  }

  const groups = useMemo(() => {
    if (!mst1) return [];
    const buckets = new Map<number, TableRow[]>();
    for (const row of mst1.data) {
      const name = String(row["SCROLL OF"] ?? "");
      if (!name) continue;
      const tier = tierFor(name);
      if (!showAll && tier > level) continue;
      if (!buckets.has(tier)) buckets.set(tier, []);
      buckets.get(tier)!.push(row);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, rows]) => ({ tier, rows }));
  }, [mst1, level, showAll, tierByName]);

  const flatRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.rows.map((r, i) => ({ row: r, key: `T${g.tier}-${i}` })),
      ),
    [groups],
  );

  function rollRandom() {
    if (flatRows.length === 0) return;
    const pick = flatRows[Math.floor(Math.random() * flatRows.length)];
    setRolledKey(pick.key);
    requestAnimationFrame(() => {
      rolledRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function pickRow(row: TableRow) {
    onPick({
      name: `Scroll of ${String(row["SCROLL OF"] ?? "")}`,
      orbit: String(row.ORBIT ?? ""),
      dispelDoubles: String(row["DISPEL DS"] ?? ""),
      effectModifier: String(row.EFFECT ?? ""),
    });
  }

  if (!mst1) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        Magic Scrolls table (MST1) not found in this codex.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">
          {showAll ? "Showing all tiers" : `Showing T1–T${level}`}
        </span>
        <label className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="size-3.5"
          />
          Show all tiers
        </label>
        <Button
          onClick={rollRandom}
          disabled={flatRows.length === 0}
          title="Roll a random scroll across all visible tiers"
        >
          🎲 Roll
        </Button>
        <span className="ml-auto text-xs text-zinc-500">
          Click any row to add it
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">No scrolls available.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.tier}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {g.tier <= 4 ? `Tier ${g.tier}` : "Top tier"}
              </h4>
              <ul className="space-y-1">
                {g.rows.map((row, i) => {
                  const key = `T${g.tier}-${i}`;
                  const rolled = rolledKey === key;
                  const name = String(row["SCROLL OF"] ?? "");
                  const dup = existing.some(
                    (s) =>
                      s.name.trim().toUpperCase().replace(/^SCROLL OF /, "") ===
                      name.toUpperCase(),
                  );
                  return (
                    <li
                      key={key}
                      ref={rolled ? rolledRef : undefined}
                      className={`rounded-md border ${
                        rolled
                          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pickRow(row)}
                        className="grid w-full grid-cols-[1fr_auto_auto_2fr_auto] items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <span className="font-medium">SCROLL OF {name}</span>
                        <span className="text-xs text-zinc-500">{String(row.ORBIT ?? "")}</span>
                        <span className="text-xs text-zinc-500">DS {String(row["DISPEL DS"] ?? "")}</span>
                        <span className="text-xs text-zinc-500">{String(row.EFFECT ?? "")}</span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {rolled ? "Rolled · + Add" : dup ? "(already added)" : "+ Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Magic Potions ----------------------------------------------------------

function PotionsCard({ character, onPatch }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const atCap = character.potions.length >= 5;

  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<Character["potions"][number]>) {
    const next = character.potions.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ potions: next });
  }
  function addBlank() {
    if (atCap) return;
    onPatch({
      potions: [...character.potions, { name: "", effectModifier: "" }],
    });
  }
  function addFromTable(slot: PotionSlot) {
    if (atCap) return;
    onPatch({ potions: [...character.potions, slot] });
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
          <div className="flex gap-2">
            <Button
              onClick={addBlank}
              disabled={atCap}
              title="Add a blank potion row"
            >
              + Custom
            </Button>
            <Button
              variant={pickerOpen ? "primary" : "default"}
              onClick={() => setPickerOpen((o) => !o)}
              disabled={atCap && !pickerOpen}
              title="Pick from the MPT1 potion catalog"
            >
              {pickerOpen ? "Close picker" : "+ From table"}
            </Button>
          </div>
        </span>
      }
    >
      {pickerOpen && !atCap && (
        <Suspense
          fallback={
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
              Loading potions…
            </p>
          }
        >
          <PotionPicker
            level={character.level}
            existing={character.potions}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}

      {character.potions.length === 0 ? (
        !pickerOpen && <EmptyRow text="No potions." />
      ) : (
        <div
          className={`grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 text-sm ${
            pickerOpen ? "mt-3" : ""
          }`}
        >
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

// Potion picker: MPT1 catalog filtered/grouped by tier from POT1–POT4.
function PotionPicker({
  level,
  existing,
  onPick,
}: {
  level: number;
  existing: PotionSlot[];
  onPick: (slot: PotionSlot) => void;
}) {
  const tables = useTablesData();
  const [showAll, setShowAll] = useState(false);
  const [rolledKey, setRolledKey] = useState<string | null>(null);
  const rolledRef = useRef<HTMLLIElement | null>(null);

  const mpt1 = tables.MPT1;

  const norm = (s: string) =>
    s.toUpperCase().replace(/^POTION OF /, "").replace(/[^A-Z0-9]/g, "");

  const tierByName = useMemo(() => {
    const map = new Map<string, number>();
    const sources: [string, number][] = [
      ["POT1", 1],
      ["POT2", 2],
      ["POT3", 3],
      ["POT4", 4],
    ];
    for (const [key, tier] of sources) {
      const t = tables[key];
      if (!t) continue;
      for (const row of t.data) {
        const name = String(row.ITEM ?? "");
        if (name) map.set(norm(name), tier);
      }
    }
    return map;
  }, [tables]);

  function tierFor(name: string): number {
    return tierByName.get(norm(name)) ?? 5;
  }

  const groups = useMemo(() => {
    if (!mpt1) return [];
    const buckets = new Map<number, TableRow[]>();
    for (const row of mpt1.data) {
      const name = String(row["POTION OF"] ?? "");
      if (!name) continue;
      const tier = tierFor(name);
      if (!showAll && tier > level) continue;
      if (!buckets.has(tier)) buckets.set(tier, []);
      buckets.get(tier)!.push(row);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, rows]) => ({ tier, rows }));
  }, [mpt1, level, showAll, tierByName]);

  const flatRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.rows.map((r, i) => ({ row: r, key: `T${g.tier}-${i}` })),
      ),
    [groups],
  );

  function rollRandom() {
    if (flatRows.length === 0) return;
    const pick = flatRows[Math.floor(Math.random() * flatRows.length)];
    setRolledKey(pick.key);
    requestAnimationFrame(() => {
      rolledRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function pickRow(row: TableRow) {
    onPick({
      name: `Potion of ${String(row["POTION OF"] ?? "")}`,
      effectModifier: String(row["EFFECT MODIFIER"] ?? ""),
    });
  }

  if (!mpt1) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        Magic Potions table (MPT1) not found in this codex.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">
          {showAll ? "Showing all tiers" : `Showing T1–T${level}`}
        </span>
        <label className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="size-3.5"
          />
          Show all tiers
        </label>
        <Button
          onClick={rollRandom}
          disabled={flatRows.length === 0}
          title="Roll a random potion across all visible tiers"
        >
          🎲 Roll
        </Button>
        <span className="ml-auto text-xs text-zinc-500">
          Click any row to add it
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">No potions available.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.tier}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {g.tier <= 4 ? `Tier ${g.tier}` : "Top tier"}
              </h4>
              <ul className="space-y-1">
                {g.rows.map((row, i) => {
                  const key = `T${g.tier}-${i}`;
                  const rolled = rolledKey === key;
                  const name = String(row["POTION OF"] ?? "");
                  const dup = existing.some(
                    (p) =>
                      p.name.trim().toUpperCase().replace(/^POTION OF /, "") ===
                      name.toUpperCase(),
                  );
                  return (
                    <li
                      key={key}
                      ref={rolled ? rolledRef : undefined}
                      className={`rounded-md border ${
                        rolled
                          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pickRow(row)}
                        className="grid w-full grid-cols-[1fr_2fr_auto_auto] items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <span className="font-medium">POTION OF {name}</span>
                        <span className="text-xs text-zinc-500">{String(row["EFFECT MODIFIER"] ?? "")}</span>
                        <span className="text-xs text-zinc-400">{String(row.DURATION ?? "")}</span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {rolled ? "Rolled · + Add" : dup ? "(already added)" : "+ Add"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
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
