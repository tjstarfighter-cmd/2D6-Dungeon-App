import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, Card } from "@/components/ui";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import {
  evaluateManoeuvres,
  evaluatePrimeOptions,
  fatigueDieValue,
  fatigueShiftBonus,
  fearfulMomentumBonus,
  formatDiceSet,
  rollD6,
  type ManoeuvreOption,
} from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import type { ManoeuvreSlot } from "@/types/character";
import type { EnemyState } from "@/types/combat";

import { DamagePanel } from "./DamagePanel";
import { DiePicker } from "./DiePicker";

export function PlayerTurnPanel({
  characterId,
  characterShift,
  manoeuvres,
  enemies,
  round,
  r1Kill,
  onApplyDamage,
}: {
  characterId: string;
  characterShift: number;
  manoeuvres: ManoeuvreSlot[];
  enemies: EnemyState[];
  round: number;
  r1Kill: boolean;
  onApplyDamage: (
    enemyId: string,
    amount: number,
    opts?: { interruptApplied?: boolean },
  ) => void;
}) {
  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(null);
  const [chosen, setChosen] = useState<ManoeuvreOption | null>(null);

  // Publishers for the /present/roll OBS overlay. The roll context
  // overlay reads from this slot — we publish on player D66 tap below
  // and on damage rolls inside DamagePanel.
  const { publishResolved: publishRollResolved } = useCurrentRoll();

  // Reset chosen when the active character changes (so manoeuvres always match).
  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
  }, [characterId]);

  // Per Core Rules: the Fatigue Die is a deterministic timer (= round, capped
  // at 6). At fatigue 4/5/6 both combatants gain +1/+2/+3 SP this round.
  const fatigueDie = fatigueDieValue(round);
  const fatigueBonus = fatigueShiftBonus(round);
  const fatigueActive = fatigueBonus > 0;
  // Fearful Momentum (Core Rules p.26): kill an enemy in round 1 of a
  // multi-creature fight, +2 player Shift in round 2 only. The r1Kill flag
  // is gated upstream on "multi alive at time of kill."
  const momentumBonus = fearfulMomentumBonus(round, r1Kill);
  const momentumActive = momentumBonus > 0;
  const effectiveShift = characterShift + fatigueBonus + momentumBonus;

  // Special D66 cases per Core Rules ("Mishap and Prime Attack Rolls").
  // Cannot shift TO a Prime — only natural double 6 qualifies. We trust the
  // user to enter the natural roll (the model can't distinguish post-shift
  // values from natural ones).
  const isPlayerMishap = primary === 1 && secondary === 1;
  const isPlayerPrime = primary === 6 && secondary === 6;

  const options = useMemo(() => {
    if (primary === null || secondary === null) return [];
    // Double 1 always misses — no manoeuvre options.
    if (isPlayerMishap) return [];
    // Double 6 lets you pick any manoeuvre as an Exact Strike.
    if (isPlayerPrime) return evaluatePrimeOptions(manoeuvres);
    return evaluateManoeuvres(manoeuvres, primary, secondary, effectiveShift);
  }, [manoeuvres, primary, secondary, effectiveShift, isPlayerMishap, isPlayerPrime]);

  // Publish player D66 to the OBS roll overlay whenever both dice are set.
  useEffect(() => {
    if (primary === null || secondary === null) return;
    let headline: string;
    if (isPlayerMishap) {
      headline = "Mishap — auto miss";
    } else if (isPlayerPrime) {
      headline = "Prime Attack — pick any Manoeuvre";
    } else if (manoeuvres.length === 0) {
      headline = "(no Manoeuvres on sheet)";
    } else {
      const affordable = options.filter((o) => o.affordable).length;
      headline = `Shift ${effectiveShift} available · ${affordable}/${options.length} options`;
    }
    publishRollResolved({
      source: "combat:player",
      label: "Player manoeuvre",
      dice: "D66",
      value: `${primary} + ${secondary} = ${primary + secondary}`,
      result: { headline },
    });
  }, [
    primary,
    secondary,
    isPlayerMishap,
    isPlayerPrime,
    manoeuvres.length,
    options,
    effectiveShift,
    publishRollResolved,
  ]);

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
              ({primary}, {secondary}) · Shift available: {effectiveShift}
              {(fatigueActive || momentumActive) && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  (base {characterShift}
                  {fatigueActive && ` + fatigue ${fatigueBonus}`}
                  {momentumActive && ` + momentum ${momentumBonus}`})
                </span>
              )}
            </span>
          </span>
        )}
      </div>

      {fatigueActive && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Fatigue Die {fatigueDie}
          </span>
          <span className="ml-2 text-amber-800 dark:text-amber-300">
            +{fatigueBonus} SP this round
            {fatigueDie >= 6 && " (locked at +3 for the rest of combat)"}
          </span>
        </div>
      )}

      {momentumActive && (
        <div className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
            Fearful Momentum
          </span>
          <span className="ml-2 text-emerald-800 dark:text-emerald-300">
            +{momentumBonus} SP this round (round 2 only — killed in round 1
            of a multi-creature fight)
          </span>
        </div>
      )}

      {isPlayerMishap && (
        <div className="mb-3 rounded-md border border-zinc-400 bg-zinc-50 p-3 text-sm dark:border-zinc-600 dark:bg-zinc-950/40">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Mishap — Always Miss
          </div>
          <p className="text-zinc-800 dark:text-zinc-200">
            You rolled a natural double 1. Per the Core Rules, this is an
            automatic miss — proceed to the enemy's turn.
          </p>
        </div>
      )}

      {isPlayerPrime && (
        <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Prime Attack
          </div>
          <p className="text-amber-900 dark:text-amber-200">
            Natural double 6! Pick any Manoeuvre below — it's performed as an
            Exact Strike, your full Shift
            {(fatigueActive || momentumActive) &&
              ` (incl.${fatigueActive ? ` fatigue +${fatigueBonus}` : ""}${
                fatigueActive && momentumActive ? "," : ""
              }${momentumActive ? ` momentum +${momentumBonus}` : ""})`}{" "}
            adds to the damage, and Interrupts cannot reduce it.
          </p>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Prime cannot be reached by shifting — only a natural double 6
            qualifies.
          </p>
        </div>
      )}

      {primary !== null && secondary !== null && manoeuvres.length > 0 && !isPlayerMishap && (
        <ManoeuvreOptions
          options={options}
          shiftAvailable={effectiveShift}
          onPick={setChosen}
          chosen={chosen}
        />
      )}

      {chosen && !isPlayerMishap && (
        <DamagePanel
          option={chosen}
          shiftAvailable={effectiveShift}
          enemies={enemies.filter((e) => e.hp.current > 0)}
          round={round}
          isPrime={isPlayerPrime}
          onApply={(enemyId, amount, opts) => {
            onApplyDamage(enemyId, amount, opts);
            clearRoll();
          }}
          onCancel={() => setChosen(null)}
        />
      )}
    </Card>
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
