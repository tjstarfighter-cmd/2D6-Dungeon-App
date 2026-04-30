import { useEffect, useMemo, useState } from "react";

import { Button, Card, Field, Stepper } from "@/components/ui";
import { useCharacters } from "@/hooks/useCharacters";
import { useCreaturesData } from "@/data/lazy";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import { useEncounter } from "@/hooks/useEncounter";
import {
  applySixRule,
  evaluateDeflection,
  evaluateEnemyManoeuvres,
  fatigueDieValue,
  fatigueShiftBonus,
  outnumberedShiftBonus,
  parseDamageFormula,
  rollD6,
  rollDamage,
  rollsComplete,
  type EnemyManoeuvreOption,
} from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import type { CreatureManoeuvre } from "@/types/creatures";

import { DeflectionPanel } from "./DeflectionPanel";
import { DiePicker } from "./DiePicker";
import { ShiftBreakdown } from "./PlayerTurnPanel";

type ListVariant = "idle" | "mishap" | "prime" | "normal";

export function EnemyTurnPanel({
  characterId,
}: {
  characterId: string;
}) {
  const { active, update } = useCharacters();
  const { encounter, updateEnemy } = useEncounter();
  const creaturesData = useCreaturesData();

  const enemies = encounter?.enemies ?? [];
  const round = encounter?.round ?? 1;
  const outnumberedEnabled = !!encounter?.outnumberedEnabled;
  const liveEnemies = enemies.filter((e) => e.hp.current > 0);
  const pendingEnemies = liveEnemies.filter((e) => e.attackedRound !== round);
  const allAttacked = liveEnemies.length > 0 && pendingEnemies.length === 0;

  const [selectedEnemyId, setSelectedEnemyId] = useState<string>(
    pendingEnemies[0]?.id ?? "",
  );
  // Per-round manual shift override for the attacking enemy.
  const [manualShift, setManualShift] = useState(0);

  useEffect(() => {
    const stillPending = pendingEnemies.find((e) => e.id === selectedEnemyId);
    if (!stillPending) {
      setSelectedEnemyId(pendingEnemies[0]?.id ?? "");
    }
  }, [pendingEnemies, selectedEnemyId]);

  const selectedEnemy = enemies.find((e) => e.id === selectedEnemyId);
  const selectedCardId = selectedEnemy?.cardId;
  const selectedCreature = useMemo(() => {
    if (!selectedCardId) return null;
    const stem = selectedCardId.replace(/\.png$/i, "");
    return creaturesData[stem] ?? null;
  }, [creaturesData, selectedCardId]);
  const auto = selectedCreature !== null;

  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(null);
  const [chosen, setChosen] = useState<EnemyManoeuvreOption | null>(null);
  const [rolls, setRolls] = useState<number[]>([]);
  const [manualDamage, setManualDamage] = useState(1);

  const fatigueDie = fatigueDieValue(round);
  const fatigueBonus = fatigueShiftBonus(round);
  const fatigueActive = fatigueBonus > 0;

  const [appliedPieceIdx, setAppliedPieceIdx] = useState<number | null>(null);

  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
    setRolls([]);
    setManualDamage(1);
  }, [characterId, selectedEnemyId]);

  // Reset manual shift override on round / enemy switch.
  useEffect(() => {
    setManualShift(0);
  }, [round, selectedEnemyId]);

  const liveIndex = liveEnemies.findIndex((e) => e.id === selectedEnemyId);
  const outnumberedBonus = outnumberedShiftBonus(
    Math.max(0, liveIndex),
    liveEnemies.length,
    outnumberedEnabled,
  );
  const enemyShift = selectedEnemy?.shift ?? 0;
  const effectiveEnemyShift = Math.max(
    0,
    enemyShift + fatigueBonus + outnumberedBonus + manualShift,
  );

  const isMishap = primary === 1 && secondary === 1;
  const isPrime = primary === 6 && secondary === 6;
  const dicePresent = primary !== null && secondary !== null;

  const options = useMemo(() => {
    if (!selectedCreature || primary === null || secondary === null) return [];
    if (isMishap || isPrime) return [];
    return evaluateEnemyManoeuvres(
      selectedCreature.manoeuvres,
      primary,
      secondary,
      effectiveEnemyShift,
    );
  }, [selectedCreature, primary, secondary, effectiveEnemyShift, isMishap, isPrime]);

  // Always-visible enemy manoeuvre list. When dice aren't entered we synthesize
  // sentinel options so the list still renders the creature's threat profile.
  const visibleManoeuvres = useMemo<EnemyManoeuvreOption[]>(() => {
    if (!auto || !selectedCreature) return [];
    if (!dicePresent || isMishap) {
      return selectedCreature.manoeuvres.map((m, i) => ({
        index: i,
        manoeuvre: m,
        cost: dicePresent ? Infinity : 0,
        exact: false,
        affordable: false,
        maxDamage: parseMaxDamage(m),
      }));
    }
    if (isPrime) {
      return selectedCreature.manoeuvres.map((m, i) => ({
        index: i,
        manoeuvre: m,
        cost: 0,
        exact: true,
        affordable: true,
        maxDamage: parseMaxDamage(m),
      }));
    }
    return options;
  }, [auto, selectedCreature, dicePresent, isMishap, isPrime, options]);

  const variant: ListVariant = !dicePresent
    ? "idle"
    : isMishap
      ? "mishap"
      : isPrime
        ? "prime"
        : "normal";

  // Auto-pick the strongest affordable option as a default.
  useEffect(() => {
    if (chosen) return;
    const best = options.find((o) => o.affordable);
    if (best) setChosen(best);
  }, [options, chosen]);

  const {
    publishPending: publishRollPending,
    publishResolved: publishRollResolved,
  } = useCurrentRoll();

  const enemyName = selectedEnemy?.name || "Enemy";
  useEffect(() => {
    if (primary === null || secondary === null) return;
    let headline: string;
    if (!auto) {
      headline = "manual roll (no creature stats)";
    } else if (isMishap) {
      headline = `Mishap — ${selectedCreature?.mishap ? "see card" : "no card text"}`;
    } else if (isPrime) {
      headline = `Prime Attack — ${selectedCreature?.prime ? "see card" : "no card text"}`;
    } else if (chosen?.affordable) {
      headline = chosen.manoeuvre.name;
    } else if (options.length === 0) {
      headline = "(no manoeuvres listed)";
    } else {
      const affordable = options.filter((o) => o.affordable).length;
      headline = affordable === 0
        ? "Miss — no reachable Manoeuvre"
        : `${affordable}/${options.length} options · Shift ${effectiveEnemyShift}`;
    }
    publishRollResolved({
      source: "combat:enemy",
      label: `${enemyName} attacks`,
      dice: "D66",
      value: `${primary} + ${secondary} = ${primary + secondary}`,
      result: { headline },
    });
  }, [
    primary,
    secondary,
    auto,
    isMishap,
    isPrime,
    selectedCreature,
    chosen,
    options,
    effectiveEnemyShift,
    enemyName,
    publishRollResolved,
  ]);

  const armour = active?.armour ?? [];
  const deflections = useMemo(() => {
    if (primary === null || secondary === null) return [];
    return armour.map((a) =>
      evaluateDeflection(a.diceSet, primary, secondary, a.modifier),
    );
  }, [armour, primary, secondary]);

  useEffect(() => {
    if (deflections.length === 0) {
      setAppliedPieceIdx(null);
      return;
    }
    let bestIdx: number | null = null;
    let bestMod = 0;
    deflections.forEach((d, i) => {
      if (d.fullMatch && d.modifier > bestMod) {
        bestMod = d.modifier;
        bestIdx = i;
      }
    });
    setAppliedPieceIdx(bestIdx);
  }, [deflections]);

  const formula = chosen ? parseDamageFormula(chosen.manoeuvre.formula) : null;
  const rollsReady = formula ? rollsComplete(rolls, formula) : true;
  const manoeuvreDamage = formula && rollsReady ? applySixRule(rolls, formula.modifier) : 0;

  let computedDamage: number;
  if (auto) {
    if (isMishap || isPrime) {
      computedDamage = manualDamage;
    } else if (chosen?.affordable) {
      computedDamage = manoeuvreDamage;
    } else {
      computedDamage = 0;
    }
  } else {
    computedDamage = manualDamage;
  }

  const applyBlocked =
    auto && !isMishap && !isPrime && chosen?.affordable && !!formula && !rollsReady;

  const totalDeflection =
    isPrime || appliedPieceIdx === null
      ? 0
      : (deflections[appliedPieceIdx]?.modifier ?? 0);
  const finalDamage = Math.max(0, computedDamage - totalDeflection);
  const showDeflectionHelper =
    primary !== null && secondary !== null && armour.length > 0 && !isPrime;
  const isMiss =
    auto &&
    primary !== null &&
    secondary !== null &&
    !isMishap &&
    !isPrime &&
    options.length > 0 &&
    !options.some((o) => o.affordable);

  const enemyManoeuvreName = chosen?.manoeuvre.name ?? "";
  const enemyFormulaDisplay = formula
    ? `${formula.dice}D${formula.sides}${
        formula.modifier !== 0
          ? `${formula.modifier > 0 ? "+" : ""}${formula.modifier}`
          : ""
      }`
    : "—";
  useEffect(() => {
    if (!auto || isMishap || isPrime) return;
    if (!chosen?.affordable) return;
    if (!formula) return;
    if (rollsReady) return;
    publishRollPending({
      source: "combat:enemy-damage",
      label: `${enemyName} · ${enemyManoeuvreName}`,
      dice: enemyFormulaDisplay,
    });
  }, [
    auto,
    isMishap,
    isPrime,
    chosen,
    formula,
    rollsReady,
    enemyName,
    enemyManoeuvreName,
    enemyFormulaDisplay,
    publishRollPending,
  ]);
  useEffect(() => {
    if (!auto || isMishap || isPrime) return;
    if (!chosen?.affordable) return;
    if (!formula || !rollsReady) return;
    const target = active?.name ?? "you";
    const sub = totalDeflection > 0
      ? `(after −${totalDeflection} deflection)`
      : undefined;
    publishRollResolved({
      source: "combat:enemy-damage",
      label: `${enemyName} · ${enemyManoeuvreName}`,
      dice: enemyFormulaDisplay,
      value: rolls.slice(0, formula.dice).join(" + "),
      result: { headline: `${finalDamage} to ${target}`, sub },
    });
  }, [
    auto,
    isMishap,
    isPrime,
    chosen,
    formula,
    rollsReady,
    rolls,
    finalDamage,
    totalDeflection,
    active,
    enemyName,
    enemyManoeuvreName,
    enemyFormulaDisplay,
    publishRollResolved,
  ]);

  function autoRollD66() {
    setPrimary(rollD6());
    setSecondary(rollD6());
    setChosen(null);
    setRolls([]);
  }

  function clearRoll() {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
    setRolls([]);
  }

  function pickManoeuvre(opt: EnemyManoeuvreOption) {
    setChosen(opt);
    setRolls([]);
  }

  function rollManoeuvreDamage() {
    if (!formula) return;
    setRolls(rollDamage(formula).rolls);
  }

  function setManualRoll(i: number, value: number) {
    if (!formula) return;
    const next = rolls.slice();
    while (next.length <= i) next.push(0);
    next[i] = Math.max(0, Math.min(formula.sides, value));
    setRolls(next);
  }

  function applyDamage() {
    if (!active || active.id !== characterId) return;
    update(active.id, {
      hp: { ...active.hp, current: Math.max(0, active.hp.current - finalDamage) },
    });
    if (selectedEnemyId) {
      updateEnemy(selectedEnemyId, { attackedRound: round });
    }
    clearRoll();
    setManualDamage(1);
  }

  if (!active) return null;

  if (liveEnemies.length === 0) {
    return (
      <Card title="Enemy turn">
        <p className="text-sm text-zinc-500">
          No live enemies. End combat or add one to continue.
        </p>
      </Card>
    );
  }

  if (allAttacked) {
    return (
      <Card title="Enemy turn">
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          All {liveEnemies.length} enemies have taken their turn this round.
          End the round above to continue.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Enemy turn">
      {liveEnemies.length > 1 && (
        <p className="mb-2 text-xs text-zinc-500">
          Round {round} · {liveEnemies.length - pendingEnemies.length}/
          {liveEnemies.length} enemies attacked. You decide the order.
        </p>
      )}

      {pendingEnemies.length === 1 && liveEnemies.length === 1 ? (
        <p className="mb-3 text-sm">
          <strong>{selectedEnemy?.name || "Enemy"}</strong> attacks
          {!auto && (
            <span className="text-zinc-500">
              {" "}· manual damage entry
              {selectedEnemy?.cardId && " (no creature stats found)"}
            </span>
          )}
        </p>
      ) : (
        <div className="mb-3">
          <Field label="Attacking enemy">
            <select
              value={selectedEnemyId}
              onChange={(e) => setSelectedEnemyId(e.target.value)}
              className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {pendingEnemies.map((e) => {
                const idx = liveEnemies.findIndex((x) => x.id === e.id);
                const bonus = outnumberedShiftBonus(
                  Math.max(0, idx),
                  liveEnemies.length,
                  outnumberedEnabled,
                );
                return (
                  <option key={e.id} value={e.id}>
                    {e.name || "(unnamed)"} — {e.hp.current}/{e.hp.max} HP
                    {bonus > 0 && ` (Outnumbered +${bonus})`}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
      )}

      {auto && (
        <ShiftBreakdown
          base={enemyShift}
          fatigue={fatigueBonus}
          fatigueDie={fatigueDie}
          fatigueLabel="Fatigue"
          secondaryBonus={outnumberedBonus}
          secondaryActive={outnumberedBonus > 0}
          secondaryLabel="Outnumb."
          manual={manualShift}
          onManual={setManualShift}
          total={effectiveEnemyShift}
        />
      )}

      <p className="mb-3 text-sm text-zinc-500">
        {auto
          ? "Enter the rolled D66 for the enemy. The helper picks the best Manoeuvre, rolls damage, and applies armour deflection."
          : "Enter the enemy's attack dice for the deflection helper, or just type the damage your character takes if you'd rather do the math yourself."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DiePicker
          label="Enemy primary"
          value={primary}
          onChange={(n) => {
            setPrimary(n);
            setChosen(null);
            setRolls([]);
          }}
        />
        <DiePicker
          label="Enemy secondary"
          value={secondary}
          onChange={(n) => {
            setSecondary(n);
            setChosen(null);
            setRolls([]);
          }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {auto && <Button onClick={autoRollD66}>🎲 Auto-roll D66</Button>}
        {(primary !== null || secondary !== null) && (
          <Button onClick={clearRoll}>Clear</Button>
        )}
        {auto && primary !== null && secondary !== null && (
          <span className="ml-2 text-sm">
            Rolled:{" "}
            <strong className="font-mono text-base">
              {DICE_FACES[primary - 1]} {DICE_FACES[secondary - 1]}
            </strong>{" "}
            <span className="text-zinc-500">
              ({primary}, {secondary})
            </span>
          </span>
        )}
      </div>

      {auto && fatigueActive && variant !== "idle" && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Fatigue Die {fatigueDie}
          </span>
          <span className="ml-2 text-amber-800 dark:text-amber-300">
            +{fatigueBonus} SP this round for the enemy too
            {fatigueDie >= 6 && " (locked at +3)"}
          </span>
        </div>
      )}

      {auto && primary !== null && secondary !== null && isMishap && selectedCreature && (
        <div className="mt-3 rounded-md border border-zinc-400 bg-zinc-50 p-3 text-sm dark:border-zinc-600 dark:bg-zinc-950/40">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Mishap Attack (double 1)
          </div>
          <p className="text-zinc-800 dark:text-zinc-200">
            {selectedCreature.mishap || "(no Mishap text on card)"}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Mishap effects vary; enter the resulting damage manually below
            (often 0).
          </p>
        </div>
      )}

      {auto && primary !== null && secondary !== null && isPrime && selectedCreature && (
        <div className="mt-3 rounded-md border border-rose-400 bg-rose-50 p-3 text-sm dark:border-rose-700 dark:bg-rose-950/30">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            Prime Attack (double 6)
          </div>
          <p className="text-rose-900 dark:text-rose-100">
            {selectedCreature.prime || "(no Prime text on card)"}
          </p>
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
            Armour cannot deflect Prime damage. Enter the damage from the card
            text below.
          </p>
        </div>
      )}

      {auto && (
        <EnemyManoeuvreList
          options={visibleManoeuvres}
          chosen={chosen}
          variant={variant}
          shiftAvailable={effectiveEnemyShift}
          onPick={pickManoeuvre}
        />
      )}

      {auto && chosen?.affordable && !isMishap && !isPrime && formula && (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
          <div className="mb-2 flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                {formula.dice}D{formula.sides}
                {formula.modifier !== 0
                  ? ` ${formula.modifier > 0 ? "+" : ""}${formula.modifier}`
                  : ""}{" "}
                damage
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
            <Button onClick={rollManoeuvreDamage}>🎲 Roll</Button>
          </div>
          {rollsReady ? (
            <p className="text-sm">
              Manoeuvre damage:{" "}
              <strong className="text-rose-700 dark:text-rose-300">
                {manoeuvreDamage}
              </strong>{" "}
              <span className="text-zinc-500">
                {chosen.exact
                  ? "(exact)"
                  : `(after spending ${chosen.cost} SP to shift)`}
              </span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              Roll the {formula.dice}D{formula.sides} damage dice to compute
              the hit.
            </p>
          )}
        </div>
      )}

      {isMiss && (
        <p className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
          Miss — no Manoeuvre is reachable within Shift {effectiveEnemyShift}.
          The enemy's attack does no damage.
        </p>
      )}

      {showDeflectionHelper && (
        <DeflectionPanel
          armour={armour}
          deflections={deflections}
          selectedIdx={appliedPieceIdx}
          onSelect={setAppliedPieceIdx}
          totalDeflection={totalDeflection}
        />
      )}

      {(!auto || isMishap || isPrime) && (
        <div className="mt-3">
          <Field
            label={
              isPrime ? "Prime damage" : isMishap ? "Mishap damage" : "Raw damage"
            }
          >
            <Stepper value={manualDamage} onChange={setManualDamage} min={0} max={99} />
          </Field>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {showDeflectionHelper && totalDeflection > 0 && (
          <span className="self-center text-sm text-zinc-500">
            after −{totalDeflection} deflection ={" "}
            <strong className="text-zinc-900 dark:text-zinc-100">{finalDamage}</strong>
          </span>
        )}
        <Button variant="primary" onClick={applyDamage} disabled={applyBlocked}>
          {applyBlocked
            ? "Roll damage dice first"
            : `− Apply ${finalDamage} to ${active.name}`}
        </Button>
        <span className="ml-auto self-center text-sm text-zinc-500">
          HP {active.hp.current}/{active.hp.baseline}
        </span>
      </div>
    </Card>
  );
}

function parseMaxDamage(m: CreatureManoeuvre): number | null {
  const f = parseDamageFormula(m.formula);
  return f ? f.dice * f.sides + f.modifier : null;
}

function EnemyManoeuvreList({
  options,
  chosen,
  variant,
  shiftAvailable,
  onPick,
}: {
  options: EnemyManoeuvreOption[];
  chosen: EnemyManoeuvreOption | null;
  variant: ListVariant;
  shiftAvailable: number;
  onPick: (opt: EnemyManoeuvreOption) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Enemy manoeuvres
        </h3>
        {variant === "idle" && (
          <span className="text-xs text-zinc-400">
            Roll the D66 to see matches
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {options.map((o) => {
          const isPicked = chosen?.index === o.index;
          const exact =
            variant === "prime" || (variant === "normal" && o.exact);
          const affordable = variant === "prime" || o.affordable;

          let cls: string;
          if (variant === "idle") {
            cls = "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
          } else if (variant === "mishap") {
            cls = "border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-950/30";
          } else if (isPicked) {
            cls = "border-rose-500 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/40";
          } else if (exact) {
            cls = "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30";
          } else if (!affordable) {
            cls = "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950/30";
          } else {
            cls = "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
          }

          const showUse = variant === "prime" || variant === "normal";

          return (
            <li key={o.index} className={`rounded-md border p-2 ${cls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semibold">{o.manoeuvre.name}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {DICE_FACES[o.manoeuvre.primary - 1]}{" "}
                    {DICE_FACES[o.manoeuvre.secondary - 1]}
                  </span>
                  <span className="truncate text-xs text-zinc-500">
                    {o.manoeuvre.formula}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  {variant === "idle" || variant === "mishap" ? null : exact ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                      EXACT
                    </span>
                  ) : (
                    <span
                      className={`text-xs font-medium ${
                        affordable
                          ? "text-zinc-600 dark:text-zinc-400"
                          : "text-red-600"
                      }`}
                    >
                      {o.cost} SP
                      {!affordable ? ` (have ${shiftAvailable})` : ""}
                    </span>
                  )}
                  {showUse && (
                    <Button
                      onClick={() => onPick(o)}
                      variant={isPicked ? "primary" : "default"}
                      disabled={!affordable}
                    >
                      Use
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
