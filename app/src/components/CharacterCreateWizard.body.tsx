import { useMemo, useState } from "react";

import { useTablesData } from "@/data/lazy";
import type { TableRow } from "@/types/tables";
import {
  STARTING_KIT_ITEMS,
  STARTING_STATS_LABEL,
  WizardChrome,
  useWizardSteps,
  type CreatedCharacterInput,
} from "./CharacterCreateWizard";

// Story 6.2 — wizard body. Lazy-loaded by the parent so the heavy
// tables import doesn't pay for itself until a player actually starts
// character creation.

const WEAPON_OPTIONS = ["Longsword", "Greataxe", "Heavy Mace"] as const;
const ARMOUR_OPTIONS = [
  "JERKIN",
  "PADDED TUNIC",
  "QUILTED COAT",
  "HIDE DOUBLET",
] as const;
const ARMOUR_DISPLAY: Record<string, string> = {
  JERKIN: "Jerkin",
  "PADDED TUNIC": "Padded Tunic",
  "QUILTED COAT": "Quilted Coat",
  "HIDE DOUBLET": "Hide Doublet",
};
const SCROLL_OPTIONS = [
  "SCROLL OF BALANCE",
  "SCROLL OF MENTAL WHIP",
  "SCROLL OF REFLEXES",
  "SCROLL OF MELT METAL",
] as const;
const SCROLL_DISPLAY: Record<string, string> = {
  "SCROLL OF BALANCE": "Scroll of Balance",
  "SCROLL OF MENTAL WHIP": "Scroll of Mental Whip",
  "SCROLL OF REFLEXES": "Scroll of Reflexes",
  "SCROLL OF MELT METAL": "Scroll of Melt Metal",
};

interface ManoeuvreRow {
  Roll: string;
  Manoeuvre: string;
  Damage: string;
}

export default function CharacterCreateWizardBody({
  onCreate,
  onCancel,
}: {
  onCreate: (input: CreatedCharacterInput) => void;
  onCancel: () => void;
}) {
  const tables = useTablesData();
  const steps = useWizardSteps();

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [weapon, setWeapon] = useState<string>(WEAPON_OPTIONS[0]);
  const [chosenManoeuvres, setChosenManoeuvres] = useState<Set<string>>(
    new Set(),
  );
  const [armour, setArmour] = useState<string>(ARMOUR_OPTIONS[0]);
  const [scroll, setScroll] = useState<string>(SCROLL_OPTIONS[0]);

  // WMT1 Level-1 manoeuvres for the chosen weapon. Falls back to an
  // empty list if WMT1 schema drifts; the Next button stays disabled
  // until exactly 2 are ticked, so the failure mode is visible.
  const manoeuvreRows: ManoeuvreRow[] = useMemo(() => {
    const wmt = tables["WMT1"];
    if (!wmt) return [];
    const row = wmt.data.find((r) => String(r["WEAPON"]) === weapon);
    const list = row?.["Level 1 Manoeuvres"];
    if (!Array.isArray(list)) return [];
    return list.map((entry: TableRow) => ({
      Roll: String(entry["Roll"] ?? ""),
      Manoeuvre: String(entry["Manoeuvre"] ?? ""),
      Damage: String(entry["Damage"] ?? ""),
    }));
  }, [tables, weapon]);

  const armourLookup = useMemo(() => {
    const sat = tables["SAT1"];
    const out = new Map<string, { diceSet: string; modifier: string }>();
    sat?.data.forEach((r) => {
      const key = String(r["ARMOUR TYPE"] ?? "");
      out.set(key, {
        diceSet: String(r["DICE SET"] ?? ""),
        modifier: String(r["MODIFIER"] ?? ""),
      });
    });
    return out;
  }, [tables]);

  const scrollLookup = useMemo(() => {
    const sst = tables["SST_Start"];
    const out = new Map<string, { modifier: string }>();
    sst?.data.forEach((r) => {
      const key = String(r["SCROLL TYPE"] ?? "");
      out.set(key, { modifier: String(r["MODIFIER"] ?? "") });
    });
    return out;
  }, [tables]);

  // Toggle a manoeuvre, capping the set at 2 so the user can't
  // overshoot the rules limit.
  function toggleManoeuvre(name: string) {
    setChosenManoeuvres((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < 2) {
        next.add(name);
      }
      return next;
    });
  }

  // Switching the weapon mid-flow invalidates the manoeuvre choices —
  // they belong to a different WMT1 sublist.
  function chooseWeapon(next: string) {
    if (next === weapon) return;
    setWeapon(next);
    setChosenManoeuvres(new Set());
  }

  const canAdvance = (() => {
    switch (steps[stepIndex].key) {
      case "name":
        return name.trim().length > 0;
      case "weapon":
        return WEAPON_OPTIONS.includes(weapon as (typeof WEAPON_OPTIONS)[number]);
      case "manoeuvres":
        return chosenManoeuvres.size === 2;
      case "armour":
        return ARMOUR_OPTIONS.includes(armour as (typeof ARMOUR_OPTIONS)[number]);
      case "scroll":
        return SCROLL_OPTIONS.includes(scroll as (typeof SCROLL_OPTIONS)[number]);
    }
    return false;
  })();

  const isLastStep = stepIndex === steps.length - 1;

  function handleNext() {
    if (!canAdvance) return;
    if (isLastStep) {
      handleCreate();
    } else {
      setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    }
  }
  function handleBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleCreate() {
    const armourStats = armourLookup.get(armour) ?? {
      diceSet: "",
      modifier: "",
    };
    const scrollStats = scrollLookup.get(scroll) ?? { modifier: "" };
    const manoeuvreList = manoeuvreRows
      .filter((r) => chosenManoeuvres.has(r.Manoeuvre))
      .map((r) => ({
        name: r.Manoeuvre,
        diceSet: r.Roll,
        modifier: r.Damage,
      }));
    onCreate({
      name: name.trim(),
      weapon,
      manoeuvres: manoeuvreList,
      armour: {
        piece: ARMOUR_DISPLAY[armour] ?? armour,
        diceSet: armourStats.diceSet,
        modifier: armourStats.modifier,
      },
      scroll: {
        name: SCROLL_DISPLAY[scroll] ?? scroll,
        modifier: scrollStats.modifier,
      },
    });
  }

  const footer = (
    <>
      <div>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            ← Back
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={!canAdvance}
        onClick={handleNext}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:dark:bg-zinc-700 disabled:dark:text-zinc-500"
      >
        {isLastStep ? "✓ Create" : "Next"}
      </button>
    </>
  );

  let body;
  switch (steps[stepIndex].key) {
    case "name":
      body = <NameStep value={name} onChange={setName} />;
      break;
    case "weapon":
      body = <WeaponStep value={weapon} onChange={chooseWeapon} />;
      break;
    case "manoeuvres":
      body = (
        <ManoeuvresStep
          weapon={weapon}
          rows={manoeuvreRows}
          chosen={chosenManoeuvres}
          onToggle={toggleManoeuvre}
        />
      );
      break;
    case "armour":
      body = (
        <ArmourStep value={armour} lookup={armourLookup} onChange={setArmour} />
      );
      break;
    case "scroll":
      body = (
        <ScrollStep value={scroll} lookup={scrollLookup} onChange={setScroll} />
      );
      break;
    default:
      body = null;
  }

  return (
    <WizardChrome
      stepIndex={stepIndex}
      stepLabel={steps[stepIndex].label}
      onCancel={onCancel}
    >
      {body}
      {footer}
    </WizardChrome>
  );
}

// ---------------------------------------------------------------------------

function NameStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label
        htmlFor="wizard-name"
        className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        What's your adventurer's name?
      </label>
      <input
        id="wizard-name"
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Borin Stoneheart"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <p className="text-xs text-zinc-500">You can rename later from the Sheet.</p>
    </div>
  );
}

function WeaponStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Pick your starting weapon.
      </legend>
      {WEAPON_OPTIONS.map((opt) => (
        <RadioRow
          key={opt}
          name="wizard-weapon"
          checked={value === opt}
          onChange={() => onChange(opt)}
          title={opt}
        />
      ))}
    </fieldset>
  );
}

function ManoeuvresStep({
  weapon,
  rows,
  chosen,
  onToggle,
}: {
  weapon: string;
  rows: ManoeuvreRow[];
  chosen: Set<string>;
  onToggle: (name: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Couldn't find Level 1 manoeuvres for {weapon}. The wizard can't
        proceed; please report this so the data can be patched.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Pick exactly two Level-1 manoeuvres for the <strong>{weapon}</strong>.{" "}
        <span className="text-zinc-500">({chosen.size}/2)</span>
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const picked = chosen.has(r.Manoeuvre);
          const reachedCap = chosen.size >= 2 && !picked;
          return (
            <li key={r.Manoeuvre}>
              <label
                className={`flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                  picked
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                    : reachedCap
                      ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                      : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked}
                  disabled={reachedCap}
                  onChange={() => onToggle(r.Manoeuvre)}
                  className="h-4 w-4 accent-emerald-600"
                />
                <span className="font-mono text-base leading-none">{r.Roll}</span>
                <span className="min-w-0 flex-1 font-medium">{r.Manoeuvre}</span>
                <span className="text-xs text-zinc-500">{r.Damage}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ArmourStep({
  value,
  lookup,
  onChange,
}: {
  value: string;
  lookup: Map<string, { diceSet: string; modifier: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Pick your starting armour.
      </legend>
      {ARMOUR_OPTIONS.map((opt) => {
        const stats = lookup.get(opt);
        return (
          <RadioRow
            key={opt}
            name="wizard-armour"
            checked={value === opt}
            onChange={() => onChange(opt)}
            title={ARMOUR_DISPLAY[opt] ?? opt}
            subtitle={
              stats ? `${stats.diceSet} · ${stats.modifier}` : undefined
            }
          />
        );
      })}
    </fieldset>
  );
}

function ScrollStep({
  value,
  lookup,
  onChange,
}: {
  value: string;
  lookup: Map<string, { modifier: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Pick your starting scroll.
        </legend>
        {SCROLL_OPTIONS.map((opt) => {
          const stats = lookup.get(opt);
          return (
            <RadioRow
              key={opt}
              name="wizard-scroll"
              checked={value === opt}
              onChange={() => onChange(opt)}
              title={SCROLL_DISPLAY[opt] ?? opt}
              subtitle={stats?.modifier}
            />
          );
        })}
      </fieldset>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-1 font-semibold uppercase tracking-wide text-zinc-500">
          Starting kit (included)
        </div>
        <div className="text-zinc-700 dark:text-zinc-300">
          {STARTING_KIT_ITEMS.join(", ")}.
        </div>
        <div className="mt-2 font-semibold uppercase tracking-wide text-zinc-500">
          Stats
        </div>
        <div className="text-zinc-700 dark:text-zinc-300">
          {STARTING_STATS_LABEL}
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  name,
  checked,
  onChange,
  title,
  subtitle,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <label
      className={`flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
        checked
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-emerald-600"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block text-xs text-zinc-500">{subtitle}</span>
        )}
      </span>
    </label>
  );
}

