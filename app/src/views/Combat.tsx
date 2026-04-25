import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { useEncounter } from "@/hooks/useEncounter";
import {
  Button,
  Card,
  Field,
  NumberField,
  Stepper,
  TextField,
} from "@/components/ui";
import { NotesPanel } from "@/components/NotesPanel";
import { DICE_FACES } from "@/lib/tables";
import {
  applySixRule,
  evaluateManoeuvres,
  formatDiceSet,
  parseDamageFormula,
  rollD6,
  rollDamage,
  type ManoeuvreOption,
} from "@/lib/combat";
import type { EnemyState } from "@/types/combat";

export function CombatView() {
  const { active } = useCharacters();
  const { encounter, start, end, addEnemy, removeEnemy, updateEnemy, damageEnemy, nextRound } =
    useEncounter();

  if (!active) {
    return (
      <Card title="Combat Helper">
        <p className="text-sm">
          Combat needs an active character so the helper can match your dice
          against your Manoeuvres.{" "}
          <Link to="/" className="font-medium underline">
            Pick or create one on the Character Sheet view
          </Link>
          .
        </p>
      </Card>
    );
  }

  if (!encounter) {
    return (
      <Card title="Combat Helper">
        <p className="text-sm">
          Active character: <strong>{active.name}</strong> · Level {active.level} ·{" "}
          {active.weapon || "(no weapon)"} · Shift {active.shift}
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => start(active.id)}>
            Start combat
          </Button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          The helper auto-detects Manoeuvre matches, suggests shift costs, rolls
          damage with the &quot;6 ≥ 1&quot; rule, and tracks enemy HP. Add multiple
          enemies for an Outnumbered encounter.
        </p>
      </Card>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Combat — Round {encounter.round}</h2>
            <p className="text-sm text-zinc-500">
              {active.name} · Shift {active.shift} · Weapon: {active.weapon || "—"} · HP{" "}
              {active.hp.current}/{active.hp.baseline}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={nextRound}>End round → {encounter.round + 1}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("End combat and clear the encounter?")) end();
              }}
            >
              End combat
            </Button>
          </div>
        </header>
      </Card>

      <EnemiesPanel
        enemies={encounter.enemies}
        onAdd={() => addEnemy()}
        onRemove={removeEnemy}
        onUpdate={updateEnemy}
        onDamage={damageEnemy}
      />

      <PlayerTurnPanel
        characterId={active.id}
        characterShift={active.shift}
        manoeuvres={active.manoeuvres}
        enemies={encounter.enemies}
        onApplyDamage={damageEnemy}
      />

      <EnemyTurnPanel characterId={active.id} />

      <NotesPanel target={{ kind: "session" as const, id: encounter.id }} compact />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Enemies

function EnemiesPanel({
  enemies,
  onAdd,
  onRemove,
  onUpdate,
  onDamage,
}: {
  enemies: EnemyState[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<EnemyState>) => void;
  onDamage: (id: string, amount: number) => void;
}) {
  return (
    <Card
      title={`Enemies (${enemies.length})`}
      action={<Button onClick={onAdd}>+ Add enemy</Button>}
    >
      {enemies.length === 0 ? (
        <p className="text-sm text-zinc-500">No enemies. Add one to start.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {enemies.map((e) => (
            <EnemyCard
              key={e.id}
              enemy={e}
              onRemove={() => {
                if (confirm(`Remove ${e.name || "this enemy"} from the encounter?`)) {
                  onRemove(e.id);
                }
              }}
              onUpdate={(patch) => onUpdate(e.id, patch)}
              onDamage={(amount) => onDamage(e.id, amount)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function EnemyCard({
  enemy,
  onRemove,
  onUpdate,
  onDamage,
}: {
  enemy: EnemyState;
  onRemove: () => void;
  onUpdate: (patch: Partial<EnemyState>) => void;
  onDamage: (amount: number) => void;
}) {
  const dead = enemy.hp.current <= 0;
  const [dmg, setDmg] = useState(1);
  return (
    <div
      className={`rounded-md border p-3 ${
        dead
          ? "border-zinc-300 bg-zinc-100 opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <TextField
          value={enemy.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Enemy name"
        />
        <Button variant="danger" onClick={onRemove} aria-label="Remove enemy">
          ✕
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="HP">
          <Stepper
            value={enemy.hp.current}
            onChange={(n) => onUpdate({ hp: { ...enemy.hp, current: n } })}
            min={0}
            max={9999}
          />
        </Field>
        <Field label="Max HP">
          <Stepper
            value={enemy.hp.max}
            onChange={(n) =>
              onUpdate({ hp: { current: Math.min(enemy.hp.current, n), max: n } })
            }
            min={1}
            max={9999}
          />
        </Field>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <Field label="Quick damage" className="grow">
          <input
            type="number"
            min={1}
            value={dmg}
            onChange={(e) => setDmg(Math.max(1, Number(e.target.value) || 1))}
            className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>
        <Button onClick={() => onDamage(dmg)} disabled={dead}>
          − Apply
        </Button>
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-500">
          Stats &amp; notes
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Shift">
            <NumberField
              value={enemy.shift}
              onChange={(e) => onUpdate({ shift: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Interrupt">
            <TextField
              value={enemy.interrupt}
              onChange={(e) => onUpdate({ interrupt: e.target.value })}
              placeholder='e.g. "1s -2 dmg"'
            />
          </Field>
          <Field label="Manoeuvres" className="sm:col-span-2">
            <TextField
              value={enemy.manoeuvres}
              onChange={(e) => onUpdate({ manoeuvres: e.target.value })}
              placeholder="Free-text — auto-load comes when creature stats are extracted"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextField
              value={enemy.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player turn

function PlayerTurnPanel({
  characterId,
  characterShift,
  manoeuvres,
  enemies,
  onApplyDamage,
}: {
  characterId: string;
  characterShift: number;
  manoeuvres: import("@/types/character").ManoeuvreSlot[];
  enemies: EnemyState[];
  onApplyDamage: (enemyId: string, amount: number) => void;
}) {
  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(null);
  const [chosen, setChosen] = useState<ManoeuvreOption | null>(null);

  // Reset chosen when the active character changes (so manoeuvres always match).
  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
  }, [characterId]);

  const options = useMemo(
    () =>
      primary !== null && secondary !== null
        ? evaluateManoeuvres(manoeuvres, primary, secondary, characterShift)
        : [],
    [manoeuvres, primary, secondary, characterShift],
  );

  function autoRoll() {
    setPrimary(rollD6());
    setSecondary(rollD6());
    setChosen(null);
  }

  function clearRoll() {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
  }

  return (
    <Card title="Player turn">
      {manoeuvres.length === 0 && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          No Manoeuvres on your sheet — the helper can't auto-match. Add some
          on the{" "}
          <Link to="/" className="underline">
            Sheet view
          </Link>
          .
        </p>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <DiePicker
          label="Primary"
          value={primary}
          onChange={(n) => {
            setPrimary(n);
            setChosen(null);
          }}
        />
        <DiePicker
          label="Secondary"
          value={secondary}
          onChange={(n) => {
            setSecondary(n);
            setChosen(null);
          }}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={autoRoll}>🎲 Auto-roll D66</Button>
        {(primary !== null || secondary !== null) && (
          <Button onClick={clearRoll}>Clear</Button>
        )}
        {primary !== null && secondary !== null && (
          <span className="ml-2 text-sm">
            Rolled:{" "}
            <strong className="font-mono text-base">
              {DICE_FACES[primary - 1]} {DICE_FACES[secondary - 1]}
            </strong>{" "}
            <span className="text-zinc-500">
              ({primary}, {secondary}) · Shift available: {characterShift}
            </span>
          </span>
        )}
      </div>

      {primary !== null && secondary !== null && manoeuvres.length > 0 && (
        <ManoeuvreOptions
          options={options}
          shiftAvailable={characterShift}
          onPick={setChosen}
          chosen={chosen}
        />
      )}

      {chosen && (
        <DamagePanel
          option={chosen}
          shiftAvailable={characterShift}
          enemies={enemies.filter((e) => e.hp.current > 0)}
          onApply={(enemyId, amount) => {
            onApplyDamage(enemyId, amount);
            clearRoll();
          }}
          onCancel={() => setChosen(null)}
        />
      )}
    </Card>
  );
}

function DiePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={selected}
              className={`flex size-10 items-center justify-center rounded-md border text-lg ${
                selected
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              }`}
            >
              {DICE_FACES[n - 1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ManoeuvreOptions({
  options,
  shiftAvailable,
  onPick,
  chosen,
}: {
  options: ManoeuvreOption[];
  shiftAvailable: number;
  onPick: (opt: ManoeuvreOption) => void;
  chosen: ManoeuvreOption | null;
}) {
  return (
    <div className="space-y-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Manoeuvre options
      </h3>
      <ul className="space-y-1">
        {options.map((o) => {
          const isPicked = chosen?.index === o.index;
          const cls = isPicked
            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50"
            : o.exact
              ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
              : !o.affordable
                ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950/30"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
          return (
            <li key={o.index} className={`rounded-md border p-2 ${cls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{o.manoeuvre.name || "(unnamed)"}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {o.diceSet ? formatDiceSet(o.diceSet[0], o.diceSet[1]) : "?"}
                  </span>
                  <span className="text-xs text-zinc-500">{o.manoeuvre.modifier}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {o.exact ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                      EXACT STRIKE
                    </span>
                  ) : Number.isFinite(o.cost) ? (
                    <span
                      className={`text-xs font-medium ${
                        o.affordable ? "text-zinc-600 dark:text-zinc-400" : "text-red-600"
                      }`}
                    >
                      {o.cost} SP
                      {!o.affordable ? ` (have ${shiftAvailable})` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">unparseable dice set</span>
                  )}
                  <Button onClick={() => onPick(o)} variant={o.exact ? "primary" : "default"}>
                    Use
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DamagePanel({
  option,
  shiftAvailable,
  enemies,
  onApply,
  onCancel,
}: {
  option: ManoeuvreOption;
  shiftAvailable: number;
  enemies: EnemyState[];
  onApply: (enemyId: string, amount: number) => void;
  onCancel: () => void;
}) {
  const formula = useMemo(() => parseDamageFormula(option.manoeuvre.modifier), [option]);
  const [rolls, setRolls] = useState<number[]>([]);
  const [exactBonus, setExactBonus] = useState(0);
  const [interruptReduction, setInterruptReduction] = useState(0);
  const [targetId, setTargetId] = useState<string>(enemies[0]?.id ?? "");

  const exactBonusMax = option.exact ? Math.max(0, shiftAvailable - option.cost) : 0;

  function doRoll() {
    if (!formula) return;
    const r = rollDamage(formula);
    setRolls(r.rolls);
  }

  function setManualRoll(i: number, value: number) {
    const next = rolls.slice();
    while (next.length <= i) next.push(0);
    next[i] = Math.max(0, Math.min(formula?.sides ?? 6, value));
    setRolls(next);
  }

  const damageBase = formula ? applySixRule(rolls, formula.modifier) : 0;
  const finalDamage = Math.max(0, damageBase + exactBonus - interruptReduction);

  return (
    <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
      <h3 className="mb-2 text-sm font-semibold">
        Damage — {option.manoeuvre.name || "manoeuvre"}{" "}
        <span className="font-normal text-zinc-500">({option.manoeuvre.modifier || "?"})</span>
      </h3>

      {!formula ? (
        <p className="text-sm text-zinc-500">
          Couldn't parse the damage formula. Apply damage manually using the
          enemy's Quick damage controls above.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                {formula.dice}D{formula.sides}
                {formula.modifier !== 0
                  ? ` ${formula.modifier > 0 ? "+" : ""}${formula.modifier}`
                  : ""}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {Array.from({ length: formula.dice }).map((_, i) => (
                  <input
                    key={i}
                    type="number"
                    min={0}
                    max={formula.sides}
                    value={rolls[i] ?? ""}
                    onChange={(e) => setManualRoll(i, Number(e.target.value) || 0)}
                    placeholder="—"
                    className="size-12 rounded-md border border-zinc-300 bg-white text-center text-lg dark:border-zinc-700 dark:bg-zinc-900"
                  />
                ))}
              </div>
            </div>
            <Button onClick={doRoll}>🎲 Roll</Button>
          </div>

          {option.exact && exactBonusMax > 0 && (
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Exact Strike bonus (up to {exactBonusMax} unused SP)
              </span>
              <Stepper
                value={exactBonus}
                onChange={setExactBonus}
                min={0}
                max={exactBonusMax}
              />
            </div>
          )}

          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Enemy interrupt (− damage)
            </span>
            <Stepper
              value={interruptReduction}
              onChange={setInterruptReduction}
              min={0}
              max={99}
            />
          </div>

          <p className="mt-3 text-sm">
            Final damage:{" "}
            <strong className="text-lg text-emerald-700 dark:text-emerald-300">
              {finalDamage}
            </strong>{" "}
            <span className="text-zinc-500">
              (base {damageBase}
              {exactBonus ? ` +${exactBonus}` : ""}
              {interruptReduction ? ` −${interruptReduction}` : ""})
            </span>
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Apply to">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="block w-48 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {enemies.length === 0 && <option value="">(no live enemies)</option>}
            {enemies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || "(unnamed)"} — {e.hp.current}/{e.hp.max}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="primary"
          disabled={!targetId || finalDamage <= 0}
          onClick={() => onApply(targetId, finalDamage)}
        >
          Apply {finalDamage} damage
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enemy turn

function EnemyTurnPanel({ characterId }: { characterId: string }) {
  const { active, update } = useCharacters();
  const [damage, setDamage] = useState(1);

  function applyDamage() {
    if (!active || active.id !== characterId) return;
    update(active.id, {
      hp: { ...active.hp, current: Math.max(0, active.hp.current - damage) },
    });
    setDamage(1);
  }

  if (!active) return null;
  return (
    <Card title="Enemy turn">
      <p className="text-sm text-zinc-500">
        Enter the damage your character takes after armour deflection. Your
        armour dice sets:{" "}
        <span className="font-mono">
          {active.armour.length === 0
            ? "(none)"
            : active.armour.map((a) => a.diceSet || "—").join(" · ")}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Damage taken">
          <Stepper value={damage} onChange={setDamage} min={0} max={99} />
        </Field>
        <Button variant="primary" onClick={applyDamage}>
          − Apply to {active.name}
        </Button>
        <span className="ml-auto self-center text-sm text-zinc-500">
          HP {active.hp.current}/{active.hp.baseline}
        </span>
      </div>
    </Card>
  );
}
