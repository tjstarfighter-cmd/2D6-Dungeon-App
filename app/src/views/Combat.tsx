import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { preloadCreatures } from "@/data/lazy";
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
  evaluateDeflection,
  evaluateEnemyManoeuvres,
  evaluateManoeuvres,
  evaluatePrimeOptions,
  fatigueDieValue,
  fatigueShiftBonus,
  findInterruptMatch,
  formatDiceSet,
  parseDamageFormula,
  parseInterruptTriggers,
  rollD6,
  rollDamage,
  rollsComplete,
  type EnemyManoeuvreOption,
  type InterruptMatch,
  type ManoeuvreOption,
} from "@/lib/combat";
import { useCardsData, useCreaturesData } from "@/data/lazy";
import { cardImageUrl } from "@/lib/cards";
import { enemyInitFromCard, findCreatureForCard } from "@/lib/creatures";
import type { CardRecord } from "@/types/cards";
import type { EnemyState } from "@/types/combat";

export default function CombatView() {
  const { active, update: updateCharacter } = useCharacters();
  const { encounter, start, end, addEnemy, removeEnemy, updateEnemy, damageEnemy, nextRound } =
    useEncounter();
  const [xpAtEnd, setXpAtEnd] = useState(0);

  // Warm the creatures.json chunk while the user is on the pre-combat screen
  // so starting combat doesn't suspend the whole view on first load.
  useEffect(() => {
    preloadCreatures();
  }, []);

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
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={nextRound}>End round → {encounter.round + 1}</Button>
            <div className="flex items-end gap-1">
              <Field label="XP gained">
                <NumberField
                  min={0}
                  value={xpAtEnd}
                  onChange={(e) => setXpAtEnd(Number(e.target.value) || 0)}
                  className="w-20"
                />
              </Field>
              <Button
                variant="danger"
                onClick={() => {
                  const xp = xpAtEnd > 0 ? ` and grant +${xpAtEnd} XP to ${active.name}` : "";
                  if (!confirm(`End combat${xp}?`)) return;
                  if (xpAtEnd > 0) {
                    updateCharacter(active.id, { xp: active.xp + xpAtEnd });
                  }
                  setXpAtEnd(0);
                  end();
                }}
              >
                End combat
              </Button>
            </div>
          </div>
        </header>
      </Card>

      <EnemiesPanel
        enemies={encounter.enemies}
        defaultLevel={active.level}
        onAddBlank={() => addEnemy()}
        onAddInit={(init) => addEnemy(init)}
        onRemove={removeEnemy}
        onUpdate={updateEnemy}
        onDamage={damageEnemy}
      />

      <PlayerTurnPanel
        characterId={active.id}
        characterShift={active.shift}
        manoeuvres={active.manoeuvres}
        enemies={encounter.enemies}
        round={encounter.round}
        onApplyDamage={(enemyId, amount, opts) => {
          damageEnemy(enemyId, amount);
          if (opts?.interruptApplied) {
            updateEnemy(enemyId, { interruptUsedRound: encounter.round });
          }
        }}
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
  defaultLevel,
  onAddBlank,
  onAddInit,
  onRemove,
  onUpdate,
  onDamage,
}: {
  enemies: EnemyState[];
  defaultLevel: number;
  onAddBlank: () => void;
  onAddInit: (init: Partial<EnemyState>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<EnemyState>) => void;
  onDamage: (id: string, amount: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Card
      title={`Enemies (${enemies.length})`}
      action={
        <div className="flex gap-2">
          <Button onClick={onAddBlank}>+ Blank</Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {pickerOpen ? "Close picker" : "+ From card"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <CardPicker
          defaultLevel={defaultLevel}
          onPick={(init) => {
            onAddInit(init);
            setPickerOpen(false);
          }}
        />
      )}

      {enemies.length === 0 && !pickerOpen ? (
        <p className="text-sm text-zinc-500">No enemies. Add one to start.</p>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 ${pickerOpen ? "mt-4" : ""}`}>
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

function CardPicker({
  defaultLevel,
  onPick,
}: {
  defaultLevel: number;
  onPick: (init: Partial<EnemyState>) => void;
}) {
  const [level, setLevel] = useState<number | "all">(defaultLevel);
  const [query, setQuery] = useState("");

  const cards = useCardsData();
  const creatureStats = useCreaturesData();
  const creatureCards = useMemo(
    () =>
      cards.cards.filter((c) => c.kind === "creature") as CardRecord[],
    [cards],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creatureCards.filter((c) => {
      if (level !== "all" && c.level !== level) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [creatureCards, level, query]);

  const levels = useMemo(() => {
    const set = new Set<number>();
    for (const c of creatureCards) if (c.level !== undefined) set.add(c.level);
    return Array.from(set).sort((a, b) => a - b);
  }, [creatureCards]);

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="grow rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">{filtered.length} match</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setLevel("all")}
          className={chipCls(level === "all")}
        >
          All levels
        </button>
        {levels.map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setLevel(lv)}
            className={chipCls(level === lv)}
          >
            L{lv}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No creatures match.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {filtered.map((c) => {
            const creature = findCreatureForCard(creatureStats, c);
            return (
              <li key={c.filename}>
                <button
                  type="button"
                  onClick={() => onPick(enemyInitFromCard(c, creature))}
                  className="group block w-full overflow-hidden rounded-md border border-zinc-200 bg-white text-left transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                  title={c.name}
                >
                  <div className="aspect-[3/4] overflow-hidden bg-zinc-100 dark:bg-zinc-950">
                    <img
                      src={cardImageUrl(c.filename)}
                      alt={c.name}
                      loading="lazy"
                      className="size-full object-contain transition-transform group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="border-t border-zinc-200 px-1.5 py-1 text-xs dark:border-zinc-800">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-zinc-500">
                      L{c.level} · {c.category}
                      {creature && (
                        <span> · HP {creature.hp} · Sh {creature.shift}</span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function chipCls(active: boolean): string {
  return `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;
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
        {enemy.cardId && (
          <Link
            to={`/cards/${encodeURIComponent(enemy.cardId)}`}
            className="block size-12 shrink-0 overflow-hidden rounded border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            title={`View ${enemy.name} card`}
          >
            <img
              src={cardImageUrl(enemy.cardId)}
              alt=""
              className="size-full object-cover"
            />
          </Link>
        )}
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
            {enemy.cardId ? (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                {enemy.interrupt || <span className="text-zinc-400">(none)</span>}
                <span className="ml-2 text-xs text-zinc-400">from card</span>
              </p>
            ) : (
              <TextField
                value={enemy.interrupt}
                onChange={(e) => onUpdate({ interrupt: e.target.value })}
                placeholder='e.g. "1s -2 dmg"'
              />
            )}
          </Field>
          <Field label="Manoeuvres" className="sm:col-span-2">
            {enemy.cardId ? (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                {enemy.manoeuvres || <span className="text-zinc-400">(none)</span>}
                <span className="ml-2 text-xs text-zinc-400">from card</span>
              </p>
            ) : (
              <TextField
                value={enemy.manoeuvres}
                onChange={(e) => onUpdate({ manoeuvres: e.target.value })}
                placeholder='e.g. "FIRE BOMB 4.5 D6 -2 damage; GAS CLOUD 1.5 D6 -2 + special"'
              />
            )}
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
  round,
  onApplyDamage,
}: {
  characterId: string;
  characterShift: number;
  manoeuvres: import("@/types/character").ManoeuvreSlot[];
  enemies: EnemyState[];
  round: number;
  onApplyDamage: (
    enemyId: string,
    amount: number,
    opts?: { interruptApplied?: boolean },
  ) => void;
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

  // Per Core Rules: the Fatigue Die is a deterministic timer (= round, capped
  // at 6). At fatigue 4/5/6 both combatants gain +1/+2/+3 SP this round.
  const fatigueDie = fatigueDieValue(round);
  const fatigueBonus = fatigueShiftBonus(round);
  const fatigueActive = fatigueBonus > 0;
  const effectiveShift = characterShift + fatigueBonus;

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
              {fatigueActive && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  (base {characterShift} + fatigue {fatigueBonus})
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
            Exact Strike, your full Shift{fatigueActive && ` (incl. fatigue +${fatigueBonus})`} adds to the damage,
            and Interrupts cannot reduce it.
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

// ---------------------------------------------------------------------------
// Enemy turn

function EnemyTurnPanel({ characterId }: { characterId: string }) {
  const { active, update } = useCharacters();
  const { encounter } = useEncounter();
  const creaturesData = useCreaturesData();

  const enemies = encounter?.enemies ?? [];
  // `encounter` is reference-stable from the store until something mutates,
  // so the filter is effectively gated by structural changes to the enemy
  // list — no need for useMemo.
  const liveEnemies = enemies.filter((e) => e.hp.current > 0);

  const [selectedEnemyId, setSelectedEnemyId] = useState<string>(
    liveEnemies[0]?.id ?? "",
  );

  // Keep the selection in sync if the chosen enemy dies / disappears.
  useEffect(() => {
    if (!liveEnemies.find((e) => e.id === selectedEnemyId)) {
      setSelectedEnemyId(liveEnemies[0]?.id ?? "");
    }
  }, [liveEnemies, selectedEnemyId]);

  const selectedEnemy = enemies.find((e) => e.id === selectedEnemyId);
  const selectedCardId = selectedEnemy?.cardId;
  const selectedCreature = useMemo(() => {
    if (!selectedCardId) return null;
    const stem = selectedCardId.replace(/\.png$/i, "");
    return creaturesData[stem] ?? null;
  }, [creaturesData, selectedCardId]);
  const auto = selectedCreature !== null;

  // Dice + manoeuvre + damage state.
  const [primary, setPrimary] = useState<number | null>(null);
  const [secondary, setSecondary] = useState<number | null>(null);
  const [chosen, setChosen] = useState<EnemyManoeuvreOption | null>(null);
  const [rolls, setRolls] = useState<number[]>([]);
  const [manualDamage, setManualDamage] = useState(1);

  // Per Core Rules: Fatigue Die is a deterministic timer (= round, capped at
  // 6) and grants +1/+2/+3 SP at fatigue 4/5/6 to *both* combatants.
  const round = encounter?.round ?? 1;
  const fatigueDie = fatigueDieValue(round);
  const fatigueBonus = fatigueShiftBonus(round);
  const fatigueActive = fatigueBonus > 0;

  // Per Core Rules: "You can only deflect damage off one piece of armour
  // once per attack." We track which single armour piece (by index) the
  // helper has applied; null means none.
  const [appliedPieceIdx, setAppliedPieceIdx] = useState<number | null>(null);

  // Reset state when the active character or attacking enemy changes. We
  // don't reset appliedPieceIdx here — the deflections-derived effect below
  // handles it via the cleared dice cascade.
  useEffect(() => {
    setPrimary(null);
    setSecondary(null);
    setChosen(null);
    setRolls([]);
    setManualDamage(1);
  }, [characterId, selectedEnemyId]);

  const enemyShift = selectedEnemy?.shift ?? 0;
  const effectiveEnemyShift = enemyShift + fatigueBonus;

  const isMishap = primary === 1 && secondary === 1;
  const isPrime = primary === 6 && secondary === 6;

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

  // Auto-pick the strongest affordable option as a default.
  useEffect(() => {
    if (chosen) return;
    const best = options.find((o) => o.affordable);
    if (best) setChosen(best);
  }, [options, chosen]);

  const armour = active?.armour ?? [];
  const deflections = useMemo(() => {
    if (primary === null || secondary === null) return [];
    return armour.map((a) =>
      evaluateDeflection(a.diceSet, primary, secondary, a.modifier),
    );
  }, [armour, primary, secondary]);

  // Auto-pick the strongest fully-matching piece. Per Core Rules: "if two
  // pieces of armour match the successful attack Manoeuvre, select the piece
  // of armour you would prefer to use. This would more than likely be the
  // one that deducts the most damage." User can override below.
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
  // Don't surface damage from a positive modifier until the dice are rolled.
  const rollsReady = formula ? rollsComplete(rolls, formula) : true;
  const manoeuvreDamage = formula && rollsReady ? applySixRule(rolls, formula.modifier) : 0;

  // Pick which damage value drives the apply button.
  let computedDamage: number;
  if (auto) {
    if (isMishap || isPrime) {
      // Mishap and Prime effects vary per creature — let the user enter the
      // resulting damage manually after reading the card text.
      computedDamage = manualDamage;
    } else if (chosen?.affordable) {
      computedDamage = manoeuvreDamage;
    } else {
      // No reachable manoeuvre — Core Rules say the attack misses.
      computedDamage = 0;
    }
  } else {
    computedDamage = manualDamage;
  }

  // The Apply button should be inert until the chosen manoeuvre's damage
  // dice have been rolled. Mishap/Prime/manual paths don't go through a
  // formula, so they're never gated.
  const applyBlocked =
    auto && !isMishap && !isPrime && chosen?.affordable && !!formula && !rollsReady;

  // Core Rules: armour cannot deflect Prime damage even if the dice would
  // normally match. Otherwise: at most one piece deflects per attack.
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
    clearRoll();
    setManualDamage(1);
    // appliedPieceIdx clears via the deflections effect when dice go null.
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

  return (
    <Card title="Enemy turn">
      {liveEnemies.length === 1 ? (
        <p className="text-sm text-zinc-500">
          <strong>{selectedEnemy?.name || "Enemy"}</strong> attacks
          {auto && (
            <>
              {" "}· Shift {enemyShift}
              {fatigueActive && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}(+ fatigue {fatigueBonus} → {effectiveEnemyShift})
                </span>
              )}
            </>
          )}
          {!auto && (
            <span className="text-zinc-500">
              {" "}· manual damage entry
              {selectedEnemy?.cardId && " (no creature stats found)"}
            </span>
          )}
        </p>
      ) : (
        <Field label="Attacking enemy">
          <select
            value={selectedEnemyId}
            onChange={(e) => setSelectedEnemyId(e.target.value)}
            className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {liveEnemies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || "(unnamed)"} — {e.hp.current}/{e.hp.max} HP
              </option>
            ))}
          </select>
        </Field>
      )}

      <p className="mt-2 text-sm text-zinc-500">
        {auto
          ? "Enter the rolled D66 for the enemy. The helper picks the best Manoeuvre, rolls damage, and applies armour deflection."
          : "Enter the enemy's attack dice for the deflection helper, or just type the damage your character takes if you'd rather do the math yourself."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      {auto && fatigueActive && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
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

      {auto && primary !== null && secondary !== null && !isMishap && !isPrime && (
        <EnemyManoeuvreList
          options={options}
          chosen={chosen}
          onPick={pickManoeuvre}
          shiftAvailable={effectiveEnemyShift}
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

function DeflectionPanel({
  armour,
  deflections,
  selectedIdx,
  onSelect,
  totalDeflection,
}: {
  armour: import("@/types/character").ArmourSlot[];
  deflections: import("@/lib/combat").DeflectionEval[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  totalDeflection: number;
}) {
  return (
    <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Armour deflection
      </h3>
      <p className="mb-1 text-xs text-zinc-500">
        Pick at most one piece — only one armour deflection applies per attack.
      </p>
      {armour.map((a, i) => {
        const d = deflections[i];
        const selected = selectedIdx === i;
        const matchAny = d.matches.some(Boolean);
        return (
          <label
            key={i}
            className={`mb-1 flex flex-wrap items-center gap-2 rounded px-2 py-1 ${
              d.fullMatch
                ? "bg-emerald-100 dark:bg-emerald-950/40"
                : matchAny
                  ? "bg-amber-50 dark:bg-amber-950/30"
                  : ""
            }`}
          >
            <input
              type="radio"
              name="enemy-deflection-piece"
              checked={selected}
              onChange={() => onSelect(i)}
              className="size-4 border-zinc-400"
            />
            <span className="font-medium">{a.piece || "(unnamed)"}</span>
            <span className="font-mono text-xs">
              {d.diceSet.length === 0 ? (
                <span className="text-zinc-400">unparseable</span>
              ) : (
                d.diceSet.map((die, j) => (
                  <span
                    key={j}
                    className={
                      d.matches[j]
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-500"
                    }
                  >
                    {DICE_FACES[die - 1]}
                    {j < d.diceSet.length - 1 ? " " : ""}
                  </span>
                ))
              )}
            </span>
            <span className="text-xs text-zinc-500">{a.modifier || "—"}</span>
            {d.fullMatch && (
              <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                DEFLECTS
              </span>
            )}
          </label>
        );
      })}
      <label className="mb-1 flex flex-wrap items-center gap-2 rounded px-2 py-1">
        <input
          type="radio"
          name="enemy-deflection-piece"
          checked={selectedIdx === null}
          onChange={() => onSelect(null)}
          className="size-4 border-zinc-400"
        />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          None — take the full hit
        </span>
      </label>
      <p className="mt-2 text-sm">
        Deflection:{" "}
        <strong className="text-emerald-700 dark:text-emerald-400">
          −{totalDeflection}
        </strong>
      </p>
    </div>
  );
}

function EnemyManoeuvreList({
  options,
  chosen,
  onPick,
  shiftAvailable,
}: {
  options: EnemyManoeuvreOption[];
  chosen: EnemyManoeuvreOption | null;
  onPick: (opt: EnemyManoeuvreOption) => void;
  shiftAvailable: number;
}) {
  if (options.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Enemy manoeuvre options
      </h3>
      <ul className="space-y-1">
        {options.map((o) => {
          const isPicked = chosen?.index === o.index;
          const cls = isPicked
            ? "border-rose-500 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/40"
            : o.exact
              ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
              : !o.affordable
                ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950/30"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
          return (
            <li key={o.index} className={`rounded-md border p-2 ${cls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{o.manoeuvre.name}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {DICE_FACES[o.manoeuvre.primary - 1]}{" "}
                    {DICE_FACES[o.manoeuvre.secondary - 1]}
                  </span>
                  <span className="text-xs text-zinc-500">{o.manoeuvre.formula}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {o.exact ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                      EXACT
                    </span>
                  ) : (
                    <span
                      className={`text-xs font-medium ${
                        o.affordable
                          ? "text-zinc-600 dark:text-zinc-400"
                          : "text-red-600"
                      }`}
                    >
                      {o.cost} SP
                      {!o.affordable ? ` (have ${shiftAvailable})` : ""}
                    </span>
                  )}
                  <Button
                    onClick={() => onPick(o)}
                    variant={isPicked ? "primary" : "default"}
                    disabled={!o.affordable}
                  >
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
