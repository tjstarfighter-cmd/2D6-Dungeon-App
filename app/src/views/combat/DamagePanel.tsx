import { useEffect, useMemo, useState } from "react";

import { Button, Field, Stepper } from "@/components/ui";
import { useCreaturesData } from "@/data/lazy";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import {
  applySixRule,
  findInterruptMatch,
  parseDamageFormula,
  parseInterruptTriggers,
  rollDamage,
  rollsComplete,
  type InterruptMatch,
  type ManoeuvreOption,
} from "@/lib/combat";
import type { EnemyState } from "@/types/combat";

export function DamagePanel({
  option,
  shiftAvailable,
  enemies,
  round,
  isPrime = false,
  onApply,
  onCancel,
}: {
  option: ManoeuvreOption;
  shiftAvailable: number;
  enemies: EnemyState[];
  round: number;
  isPrime?: boolean;
  onApply: (
    enemyId: string,
    amount: number,
    opts?: { interruptApplied?: boolean },
  ) => void;
  onCancel: () => void;
}) {
  const formula = useMemo(() => parseDamageFormula(option.manoeuvre.modifier), [option]);
  const [rolls, setRolls] = useState<number[]>([]);
  const [exactBonus, setExactBonus] = useState(0);
  const [interruptReduction, setInterruptReduction] = useState(0);
  const [targetId, setTargetId] = useState<string>(enemies[0]?.id ?? "");
  const { publishPending: publishRollPending, publishResolved: publishRollResolved } =
    useCurrentRoll();

  const exactBonusMax = option.exact ? Math.max(0, shiftAvailable - option.cost) : 0;

  // ---- Interrupt auto-detection -----------------------------------------
  // Match against the manoeuvre's *post-shift* dice, per Core Rules: "If,
  // after any dice shifts that are needed, either the Primary or Secondary
  // die of your successful attack manoeuvre matches the creature's Interrupt
  // Stat..."
  const creaturesData = useCreaturesData();
  const targetEnemy = enemies.find((e) => e.id === targetId);
  const targetCreature = useMemo(() => {
    if (!targetEnemy?.cardId) return null;
    const stem = targetEnemy.cardId.replace(/\.png$/i, "");
    return creaturesData[stem] ?? null;
  }, [creaturesData, targetEnemy]);

  const interruptTriggers = useMemo(
    () =>
      targetCreature
        ? parseInterruptTriggers(targetCreature.interrupt)
        : parseInterruptTriggers(targetEnemy?.interrupt ?? ""),
    [targetCreature, targetEnemy],
  );

  const interruptMatch: InterruptMatch | null = useMemo(() => {
    if (isPrime) return null; // Prime ignores Interrupts.
    if (!option.diceSet) return null; // unparseable manoeuvre dice
    return findInterruptMatch(interruptTriggers, option.diceSet[0], option.diceSet[1]);
  }, [interruptTriggers, option, isPrime]);

  // "Only one Interrupt per round" — flag if the target already used theirs.
  const interruptAlreadyUsed =
    !!targetEnemy?.interruptUsedRound && targetEnemy.interruptUsedRound === round;

  const suggestedInterrupt =
    !interruptMatch || interruptAlreadyUsed ? 0 : interruptMatch.trigger.modifier;

  // Auto-fill the stepper whenever the inputs that drive the suggestion
  // change. The user can still nudge from there.
  useEffect(() => {
    setInterruptReduction(suggestedInterrupt);
  }, [suggestedInterrupt]);

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

  // Don't surface damage from a positive modifier ("D6 +2") until the dice
  // are actually rolled — otherwise the user could apply phantom damage.
  const rollsReady = formula ? rollsComplete(rolls, formula) : true;
  const damageBase = formula && rollsReady ? applySixRule(rolls, formula.modifier) : 0;
  // Per Core Rules: Prime Attacks "cannot be affected by Interrupts" — even
  // if the user fiddles with the stepper, ignore it when isPrime is set.
  const effectiveInterrupt = isPrime ? 0 : interruptReduction;
  const finalDamage = Math.max(0, damageBase + exactBonus - effectiveInterrupt);

  // Publish the player damage roll to the OBS overlay. Pending while
  // waiting on dice; resolved once they're filled in. Skipped when
  // there's no parseable formula (manual damage path).
  const manoeuvreName = option.manoeuvre.name || "Manoeuvre";
  const formulaDisplay = formula
    ? `${formula.dice}D${formula.sides}${
        formula.modifier !== 0
          ? `${formula.modifier > 0 ? "+" : ""}${formula.modifier}`
          : ""
      }`
    : "—";
  useEffect(() => {
    if (!formula) return;
    if (rollsReady) return;
    publishRollPending({
      source: "combat:player-damage",
      label: `${manoeuvreName} damage`,
      dice: formulaDisplay,
    });
  }, [formula, rollsReady, manoeuvreName, formulaDisplay, publishRollPending]);
  useEffect(() => {
    if (!formula || !rollsReady) return;
    const breakdown: string[] = [`base ${damageBase}`];
    if (exactBonus) breakdown.push(`+${exactBonus} ${isPrime ? "Prime" : "Exact"}`);
    if (effectiveInterrupt) breakdown.push(`−${effectiveInterrupt} Interrupt`);
    publishRollResolved({
      source: "combat:player-damage",
      label: `${manoeuvreName} damage`,
      dice: formulaDisplay,
      value: rolls.slice(0, formula.dice).join(" + "),
      result: {
        headline: `${finalDamage} damage`,
        sub: breakdown.length > 1 ? breakdown.join(" · ") : undefined,
      },
    });
  }, [
    formula,
    rollsReady,
    rolls,
    damageBase,
    exactBonus,
    effectiveInterrupt,
    finalDamage,
    isPrime,
    manoeuvreName,
    formulaDisplay,
    publishRollResolved,
  ]);

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
                {isPrime
                  ? `Prime Strike bonus (up to ${exactBonusMax} SP — your full Shift)`
                  : `Exact Strike bonus (up to ${exactBonusMax} unused SP)`}
              </span>
              <Stepper
                value={exactBonus}
                onChange={setExactBonus}
                min={0}
                max={exactBonusMax}
              />
            </div>
          )}

          {isPrime ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Interrupts cannot reduce a Prime Attack's damage.
            </p>
          ) : (
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Enemy interrupt (− damage)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Stepper
                  value={interruptReduction}
                  onChange={setInterruptReduction}
                  min={0}
                  max={99}
                />
                {interruptMatch && !interruptAlreadyUsed && (
                  <span className="text-xs text-zinc-500">
                    Suggested: −{interruptMatch.trigger.modifier} from{" "}
                    <strong>{interruptMatch.trigger.name}</strong> on{" "}
                    {interruptMatch.trigger.slot} {interruptMatch.matchedValue}
                  </span>
                )}
                {interruptMatch && interruptAlreadyUsed && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    {interruptMatch.trigger.name} would match, but this enemy
                    already used their Interrupt this round.
                  </span>
                )}
                {!interruptMatch &&
                  interruptTriggers.length > 0 &&
                  option.diceSet && (
                    <span className="text-xs text-zinc-500">
                      No Interrupt matches {option.diceSet[0]},{" "}
                      {option.diceSet[1]}.
                    </span>
                  )}
              </div>
              {round >= 7 && interruptMatch && !interruptAlreadyUsed && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Round 7+: movement-based Interrupts no longer fire (Core
                  Rules p.26). If <strong>{interruptMatch.trigger.name}</strong>{" "}
                  is movement-based, set the reduction to 0 — armour-based
                  Interrupts still apply.
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-sm">
            Final damage:{" "}
            <strong className="text-lg text-emerald-700 dark:text-emerald-300">
              {finalDamage}
            </strong>{" "}
            <span className="text-zinc-500">
              (base {damageBase}
              {exactBonus ? ` +${exactBonus}` : ""}
              {effectiveInterrupt ? ` −${effectiveInterrupt}` : ""})
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
          disabled={!targetId || (formula && !rollsReady) || finalDamage <= 0}
          onClick={() =>
            onApply(targetId, finalDamage, {
              interruptApplied: !isPrime && effectiveInterrupt > 0,
            })
          }
        >
          {formula && !rollsReady ? "Roll dice first" : `Apply ${finalDamage} damage`}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
