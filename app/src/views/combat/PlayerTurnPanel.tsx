import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, Card, Stepper } from "@/components/ui";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import {
  evaluateManoeuvres,
  evaluatePrimeOptions,
  fatigueDieValue,
  fatigueShiftBonus,
  fearfulMomentumBonus,
  formatDiceSet,
  parseDiceSet,
  rollD6,
  type ManoeuvreOption,
} from "@/lib/combat";
import { DICE_FACES } from "@/lib/tables";
import type { ManoeuvreSlot } from "@/types/character";
import type { EnemyState } from "@/types/combat";

import { DamagePanel } from "./DamagePanel";
import { DiePicker } from "./DiePicker";

type ListVariant = "idle" | "mishap" | "prime" | "normal";

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
  // Player's shift pool resets each round per Core Rules; the manual override
  // tracks GM/houserule adjustments the helper can't infer (potion, Aspect,
  // earlier-round Interrupt that nicked your pool, etc.).
  const [manualShift, setManualShift] = useState(0);

  const { publishResolved: publishRollResolved } = useCurrentRoll();

  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
  }, [characterId]);

  // Manual shift adjustment is per-round per the rules.
  useEffect(() => {
    setManualShift(0);
  }, [characterId, round]);

  const fatigueDie = fatigueDieValue(round);
  const fatigueBonus = fatigueShiftBonus(round);
  const fatigueActive = fatigueBonus > 0;
  const momentumBonus = fearfulMomentumBonus(round, r1Kill);
  const momentumActive = momentumBonus > 0;
  const effectiveShift = Math.max(
    0,
    characterShift + fatigueBonus + momentumBonus + manualShift,
  );

  const isPlayerMishap = primary === 1 && secondary === 1;
  const isPlayerPrime = primary === 6 && secondary === 6;
  const dicePresent = primary !== null && secondary !== null;

  const options = useMemo(() => {
    if (primary === null || secondary === null) return [];
    if (isPlayerMishap) return [];
    if (isPlayerPrime) return evaluatePrimeOptions(manoeuvres);
    return evaluateManoeuvres(manoeuvres, primary, secondary, effectiveShift);
  }, [manoeuvres, primary, secondary, effectiveShift, isPlayerMishap, isPlayerPrime]);

  // Always-visible list. In idle/mishap modes we synthesize sentinel options
  // so the manoeuvre rows render with no Use button or cost pill.
  const visibleManoeuvres = useMemo<ManoeuvreOption[]>(() => {
    if (!dicePresent || isPlayerMishap) {
      return manoeuvres.map((m, i) => ({
        index: i,
        manoeuvre: m,
        diceSet: parseDiceSet(m.diceSet),
        cost: dicePresent ? Infinity : 0,
        exact: false,
        affordable: false,
      }));
    }
    return options;
  }, [manoeuvres, dicePresent, isPlayerMishap, options]);

  const variant: ListVariant = !dicePresent
    ? "idle"
    : isPlayerMishap
      ? "mishap"
      : isPlayerPrime
        ? "prime"
        : "normal";

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
      <ShiftBreakdown
        base={characterShift}
        fatigue={fatigueBonus}
        fatigueDie={fatigueDie}
        fatigueLabel="Fatigue"
        secondaryBonus={momentumBonus}
        secondaryActive={momentumActive}
        secondaryLabel="Momentum"
        manual={manualShift}
        onManual={setManualShift}
        total={effectiveShift}
      />

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
        {dicePresent && (
          <span className="ml-2 text-sm">
            Rolled:{" "}
            <strong className="font-mono text-base">
              {DICE_FACES[primary! - 1]} {DICE_FACES[secondary! - 1]}
            </strong>{" "}
            <span className="text-zinc-500">
              ({primary}, {secondary})
            </span>
          </span>
        )}
      </div>

      {fatigueActive && variant !== "idle" && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            Fatigue Die {fatigueDie}
          </span>
          <span className="ml-2 text-amber-800 dark:text-amber-300">
            +{fatigueBonus} SP this round
            {fatigueDie >= 6 && " (locked at +3 for the rest of combat)"}
          </span>
        </div>
      )}

      {momentumActive && variant !== "idle" && (
        <div className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
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

      {manoeuvres.length > 0 && (
        <ManoeuvreList
          options={visibleManoeuvres}
          variant={variant}
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

// ---------------------------------------------------------------------------
// Shift breakdown widget (also used by EnemyTurnPanel)
// ---------------------------------------------------------------------------

export function ShiftBreakdown({
  base,
  fatigue,
  fatigueDie,
  fatigueLabel,
  secondaryBonus,
  secondaryActive,
  secondaryLabel,
  manual,
  onManual,
  total,
}: {
  base: number;
  fatigue: number;
  fatigueDie: number;
  fatigueLabel: string;
  secondaryBonus: number;
  secondaryActive: boolean;
  secondaryLabel: string;
  manual: number;
  onManual: (n: number) => void;
  total: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Shift
      </span>
      <SegmentLabel label="Base" value={base} />
      <SegmentLabel
        label={`${fatigueLabel} ${fatigueDie}`}
        value={fatigue}
        muted={fatigue === 0}
      />
      <SegmentLabel
        label={secondaryLabel}
        value={secondaryBonus}
        muted={!secondaryActive}
      />
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Manual
        </span>
        <Stepper
          value={manual}
          onChange={onManual}
          min={-9}
          max={9}
          width="w-12"
          ariaLabel="Manual shift adjustment"
        />
      </span>
      <span className="ml-auto rounded bg-zinc-900 px-2 py-0.5 text-sm font-semibold tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900">
        = {total} SP
      </span>
    </div>
  );
}

function SegmentLabel({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return (
    <span
      className={`inline-flex items-baseline gap-1 ${
        muted ? "text-zinc-400" : "text-zinc-700 dark:text-zinc-300"
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums">
        {sign}
        {abs}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Manoeuvre list (always-visible, state-aware)
// ---------------------------------------------------------------------------

function ManoeuvreList({
  options,
  variant,
  shiftAvailable,
  onPick,
  chosen,
}: {
  options: ManoeuvreOption[];
  variant: ListVariant;
  shiftAvailable: number;
  onPick: (opt: ManoeuvreOption) => void;
  chosen: ManoeuvreOption | null;
}) {
  return (
    <div className="space-y-1">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Manoeuvres
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
            cls = "border-emerald-500 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/50";
          } else if (exact) {
            cls = "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30";
          } else if (!affordable) {
            cls = "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950/30";
          } else {
            cls = "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
          }

          // Action affordance: hide Use button in idle/mishap modes.
          const showUse = variant === "prime" || variant === "normal";

          return (
            <li key={o.index} className={`rounded-md border p-2 ${cls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semibold">
                    {o.manoeuvre.name || "(unnamed)"}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {o.diceSet
                      ? formatDiceSet(o.diceSet[0], o.diceSet[1])
                      : o.manoeuvre.diceSet || "?"}
                  </span>
                  <span className="truncate text-xs text-zinc-500">
                    {o.manoeuvre.modifier}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  {variant === "idle" || variant === "mishap" ? null : exact ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                      EXACT
                    </span>
                  ) : Number.isFinite(o.cost) ? (
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
                  ) : (
                    <span className="text-xs text-zinc-500">unparseable dice set</span>
                  )}
                  {showUse && (
                    <Button
                      onClick={() => onPick(o)}
                      variant={exact ? "primary" : "default"}
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
