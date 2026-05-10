import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { Character, StatusConditions } from "@/types/character";
import { useCharacters } from "@/hooks/useCharacters";
import { STATUS_PIPS } from "@/lib/character";
import { useShellNav } from "@/components/Shell";
import { Pips, Stepper, Toggle } from "@/components/ui";
import { ReadOnlyShield } from "@/components/ReadOnlyShield";

// Story 1.4 — pinned-top of the Sheet column. Always visible while the
// Sheet content scrolls below it. Holds the at-a-glance vitals: identity,
// HP, status pips, condition toggles. Sub-tabs (Loadout / Magic / Pack /
// Lore) ship in Story 1.5 and live below this.
//
// Empty states matter here because the column should still be useful when
// no character is active or none exist yet.

interface Props {
  onOpenSwitcher: () => void;
}

export function PinnedVitals({ onOpenSwitcher }: Props) {
  const { characters, active, update } = useCharacters();
  const nav = useShellNav();

  if (characters.length === 0) {
    // Story 6.2 — empty-state CTA hands off to the 5-step wizard.
    // Fill the whole sheet column so the column doesn't look like an
    // empty box with a small card at the top.
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold">Welcome</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Create a character to start tracking HP, XP, gear, and gold across
            your runs.
          </p>
          <button
            type="button"
            onClick={() => nav.openWizard()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + Create your first adventurer
          </button>
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <Pinned>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-zinc-500">No active character</span>
          <button
            type="button"
            onClick={onOpenSwitcher}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Pick a character
          </button>
        </div>
      </Pinned>
    );
  }

  return (
    <Pinned>
      <ReadOnlyShield>
        <ActiveVitals
          character={active}
          onUpdate={(patch) => update(active.id, patch)}
          onOpenSwitcher={onOpenSwitcher}
        />
      </ReadOnlyShield>
      {/* Story 6.13 — Switch character escape hatch lives outside the
          read-only shield so the player can leave a deceased character. */}
      {active.state === "dead" && (
        <button
          type="button"
          onClick={onOpenSwitcher}
          aria-label="Switch character"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          ↻ Switch character (current is deceased)
        </button>
      )}
    </Pinned>
  );
}

// Wrapper holds the sticky-top styling so empty states share it.
function Pinned({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-tour-anchor="sheet-vitals"
      className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {children}
    </div>
  );
}

// ---- Active character body ------------------------------------------------

function ActiveVitals({
  character,
  onUpdate,
  onOpenSwitcher,
}: {
  character: Character;
  onUpdate: (patch: Partial<Character>) => void;
  onOpenSwitcher: () => void;
}) {
  function patchStatus(patch: Partial<StatusConditions>) {
    onUpdate({ status: { ...character.status, ...patch } });
  }

  function setHp(next: number) {
    onUpdate({ hp: { ...character.hp, current: next } });
  }

  function rest() {
    // Per the rules' between-level rest: recover 2 HP × Adventurer Level,
    // capped at the baseline. Story 6.x extends this to a full ration / level
    // transition flow with optional cloth-bandage bonus and ration deduction.
    const recovery = 2 * Math.max(1, character.level);
    const next = Math.min(character.hp.baseline, character.hp.current + recovery);
    setHp(next);
  }

  return (
    <div className="space-y-2">
      <IdentityRow
        name={character.name}
        level={character.level}
        onName={(name) => onUpdate({ name })}
        onLevel={(level) => onUpdate({ level })}
        onOpenSwitcher={onOpenSwitcher}
      />
      {(character.pendingLevelUps?.length ?? 0) > 0 && (
        <PendingLevelUpPip count={character.pendingLevelUps!.length} />
      )}
      <HpRow
        current={character.hp.current}
        baseline={character.hp.baseline}
        onChange={setHp}
        onRest={rest}
      />
      <StatsRow
        xp={character.xp}
        shift={character.shift}
        discipline={character.discipline}
        precision={character.precision}
      />
      <PipRows
        bloodied={character.status.bloodied}
        soaked={character.status.soaked}
        onChange={(next) => patchStatus(next)}
      />
      <ConditionToggles
        fever={character.status.fever}
        pneumonia={character.status.pneumonia}
        onChange={(next) => patchStatus(next)}
      />
    </div>
  );
}

// ---- Identity row ---------------------------------------------------------

function IdentityRow({
  name,
  level,
  onName,
  onLevel,
  onOpenSwitcher,
}: {
  name: string;
  level: number;
  onName: (next: string) => void;
  onLevel: (next: number) => void;
  onOpenSwitcher: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <InlineText
        value={name}
        onChange={onName}
        className="grow truncate text-sm font-semibold"
        ariaLabel="Character name"
      />
      <span className="text-xs text-zinc-500">Lvl</span>
      <InlineNumber
        value={level}
        onChange={onLevel}
        min={1}
        max={10}
        className="text-xs font-medium"
        ariaLabel="Character level"
      />
      <button
        type="button"
        onClick={onOpenSwitcher}
        aria-label="Switch character"
        title="Switch character"
        className="ml-auto rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        ↻
      </button>
    </div>
  );
}

// Tap-to-edit text. Esc cancels (restores original); Enter/blur commits.
function InlineText({
  value,
  onChange,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) onChange(draft.trim());
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (draft.trim()) onChange(draft.trim());
            setEditing(false);
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className={`rounded border border-zinc-300 bg-white px-1 py-0 ${className} dark:border-zinc-600 dark:bg-zinc-800`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel ? `Edit ${ariaLabel.toLowerCase()}` : undefined}
      className={`text-left hover:underline ${className}`}
    >
      {value}
    </button>
  );
}

// Story 6.7 — pending level-up choices badge. Tap re-summons the
// LevelUpWizard via ShellNavContext.
function PendingLevelUpPip({ count }: { count: number }) {
  const nav = useShellNav();
  return (
    <button
      type="button"
      onClick={() => nav.openLevelUp()}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
    >
      <span>
        ✨ {count} level-up choice{count === 1 ? "" : "s"} pending
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

// Tap-to-edit integer. Same semantics as InlineText, with min/max guards.
function InlineNumber({
  value,
  onChange,
  min,
  max,
  className = "",
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  function commit() {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, Math.round(n)));
      onChange(clamped);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        className={`w-12 rounded border border-zinc-300 bg-white px-1 py-0 text-center ${className} dark:border-zinc-600 dark:bg-zinc-800`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel ? `Edit ${ariaLabel.toLowerCase()}` : undefined}
      className={`hover:underline ${className}`}
    >
      {value}
    </button>
  );
}

// ---- HP row ---------------------------------------------------------------

function HpRow({
  current,
  baseline,
  onChange,
  onRest,
}: {
  current: number;
  baseline: number;
  onChange: (next: number) => void;
  onRest: () => void;
}) {
  const pct = baseline > 0 ? Math.max(0, Math.min(100, (current / baseline) * 100)) : 0;
  const barClass =
    pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">HP</span>
      <Stepper
        value={current}
        onChange={onChange}
        min={0}
        max={baseline}
        ariaLabel="Current HP"
        width="w-12"
      />
      <span className="text-zinc-500 tabular-nums">/ {baseline}</span>
      <span className="ml-1 h-1.5 w-12 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <span className={`block h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </span>
      <button
        type="button"
        onClick={onRest}
        title="Recover 2×Lvl HP, capped at baseline"
        className="ml-auto rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        Rest
      </button>
    </div>
  );
}

// ---- Stats one-liner ------------------------------------------------------

function StatsRow({
  xp,
  shift,
  discipline,
  precision,
}: {
  xp: number;
  shift: number;
  discipline: number;
  precision: number;
}) {
  const items: { label: string; value: number }[] = [
    { label: "XP", value: xp },
    { label: "Shift", value: shift },
    { label: "Disc", value: discipline },
    { label: "Prec", value: precision },
  ];
  return (
    <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      {items.map((it, i) => (
        <span key={it.label} className="contents">
          <dt className="text-zinc-500">{it.label}</dt>
          <dd className="font-medium tabular-nums">{it.value}</dd>
          {i < items.length - 1 && (
            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
              ·
            </span>
          )}
        </span>
      ))}
    </dl>
  );
}

// ---- Bloodied / Soaked pip rows ------------------------------------------

function PipRows({
  bloodied,
  soaked,
  onChange,
}: {
  bloodied: number;
  soaked: number;
  onChange: (patch: Partial<StatusConditions>) => void;
}) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-16 text-zinc-500">Bloodied</span>
        <Pips
          count={STATUS_PIPS}
          filled={bloodied}
          onChange={(next) => onChange({ bloodied: next })}
          ariaLabel="Bloodied"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-zinc-500">Soaked</span>
        <Pips
          count={STATUS_PIPS}
          filled={soaked}
          onChange={(next) => onChange({ soaked: next })}
          ariaLabel="Soaked"
        />
      </div>
    </div>
  );
}

// ---- Fever / Pneumonia toggles -------------------------------------------

function ConditionToggles({
  fever,
  pneumonia,
  onChange,
}: {
  fever: boolean;
  pneumonia: boolean;
  onChange: (patch: Partial<StatusConditions>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Toggle
        checked={fever}
        onChange={(next) => onChange({ fever: next })}
        label="Fever"
      />
      <Toggle
        checked={pneumonia}
        onChange={(next) => onChange({ pneumonia: next })}
        label="Pneumonia"
      />
    </div>
  );
}
