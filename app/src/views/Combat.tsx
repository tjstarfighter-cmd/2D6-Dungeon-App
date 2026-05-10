import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { preloadCreatures, useCardsData, useCreaturesData } from "@/data/lazy";
import { useCharacters } from "@/hooks/useCharacters";
import { useEncounter } from "@/hooks/useEncounter";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useActivePin } from "@/components/ActivePin";
import { enemyInitFromCard, findCreatureForCard } from "@/lib/creatures";
import {
  Button,
  Card,
  Field,
  NumberField,
} from "@/components/ui";
import { CombatCloseSummary } from "@/components/combat/CombatCloseSummary";
import { CombatLogPanel } from "@/components/combat/CombatLogPanel";
import { CreaturePicker } from "@/components/combat/CreaturePicker";
import { useRunEnd } from "@/components/RunEnd";
import { NotesPanel } from "@/components/NotesPanel";
import { useNotes } from "@/hooks/useNotes";
import { fearfulMomentumBonus } from "@/lib/combat";
import { cardImageUrl } from "@/lib/cards";
import type { CardRecord } from "@/types/cards";
import type { EnemyState } from "@/types/combat";

import { EnemiesPanel } from "./combat/EnemiesPanel";
import { EnemyTurnPanel } from "./combat/EnemyTurnPanel";
import { PlayerTurnPanel } from "./combat/PlayerTurnPanel";

type TurnTab = "player" | "enemy";

export default function CombatView() {
  const { active, update: updateCharacter } = useCharacters();
  const {
    encounter,
    start,
    end,
    addEnemy,
    removeEnemy,
    updateEnemy,
    damageEnemy,
    nextRound,
    setOutnumbered,
    addManualNote,
  } = useEncounter();
  const { active: activeMap, update: updateMap } = useMapsV2();
  const { create: createNote, notes: allNotes, update: updateNote } = useNotes();
  const [xpAtEnd, setXpAtEnd] = useState(0);
  const [turnTab, setTurnTab] = useState<TurnTab>("player");
  // Story 5.5 — when set, the combat-close summary modal is open.
  const [closing, setClosing] = useState(false);
  // Story 6.10 — combat-path HP→0 funnels into the run-end modal via
  // RunEndContext. Replaces the placeholder modal that shipped with
  // Story 5.6.
  const { triggerRunEnd } = useRunEnd();

  // Warm the creatures.json chunk while the user is on the pre-combat screen
  // so starting combat doesn't suspend the whole view on first load.
  useEffect(() => {
    preloadCreatures();
  }, []);

  // Reset to Player tab whenever the round advances — the player goes first.
  useEffect(() => {
    setTurnTab("player");
  }, [encounter?.round]);

  // Pending / done counts for the Enemy tab badge + auto-flip logic.
  const live = useMemo(
    () => (encounter?.enemies ?? []).filter((e) => e.hp.current > 0),
    [encounter?.enemies],
  );
  const pendingCount = useMemo(() => {
    if (!encounter) return 0;
    return live.filter((e) => e.attackedRound !== encounter.round).length;
  }, [live, encounter]);
  const allAttacked = live.length > 0 && pendingCount === 0;

  // After every enemy has attacked this round, flip back to Player so the
  // user can see the "End round → N+1" prompt without scrolling.
  useEffect(() => {
    if (allAttacked && turnTab === "enemy") {
      setTurnTab("player");
    }
  }, [allAttacked, turnTab]);

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
      <PreCombatPicker
        characterLevel={active.level}
        onStart={(roster) =>
          start(active.id, {
            initialEnemies: roster.length > 0 ? roster : undefined,
          })
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-4 lg:items-start">
        <div className="space-y-4">
      <CombatHeader
        round={encounter.round}
        roomLabel={encounter.roomLabel}
        characterName={active.name}
        characterLevel={active.level}
        characterShift={active.shift}
        characterWeapon={active.weapon}
        characterHpCurrent={active.hp.current}
        characterHpBaseline={active.hp.baseline}
        momentum={fearfulMomentumBonus(encounter.round, !!encounter.r1Kill)}
        outnumberedEnabled={!!encounter.outnumberedEnabled}
        onToggleOutnumbered={setOutnumbered}
        enemies={encounter.enemies}
        onNextRound={nextRound}
        nextRoundNumber={encounter.round + 1}
        xpAtEnd={xpAtEnd}
        onXpAtEndChange={setXpAtEnd}
        onEndCombat={() => setClosing(true)}
      />

      <Card>
        <TurnTabs
          active={turnTab}
          onSelect={setTurnTab}
          pendingCount={pendingCount}
          totalLive={live.length}
        />
        <div className="mt-4">
          {turnTab === "player" ? (
            <PlayerTurnPanel
              characterId={active.id}
              characterShift={active.shift}
              manoeuvres={active.manoeuvres}
              enemies={encounter.enemies}
              round={encounter.round}
              r1Kill={!!encounter.r1Kill}
              onApplyDamage={(enemyId, amount, opts) => {
                damageEnemy(enemyId, amount);
                if (opts?.interruptApplied) {
                  updateEnemy(enemyId, { interruptUsedRound: encounter.round });
                }
                // After the player's strike, hand the floor to the enemies
                // unless they've all been resolved already this round.
                if (live.length > 0 && pendingCount > 0) {
                  setTurnTab("enemy");
                }
              }}
            />
          ) : (
            <EnemyTurnPanel
              characterId={active.id}
              onPlayerDamaged={({ prevHp, newHp, enemyId }) => {
                if (prevHp > 0 && newHp === 0) {
                  const enemy = encounter.enemies.find((e) => e.id === enemyId);
                  triggerRunEnd({
                    kind: "combat",
                    source: enemy?.name ?? "an enemy",
                    roomLabel: encounter.roomLabel ?? undefined,
                  });
                }
              }}
            />
          )}
        </div>
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

      <NotesPanel target={{ kind: "session" as const, id: encounter.id }} compact />
        </div>
        <div className="mt-4 lg:mt-0">
          <CombatLogPanel
            entries={encounter.log ?? []}
            onAddNote={addManualNote}
          />
        </div>
      </div>
      {closing && (
        <CombatCloseSummary
          enemies={encounter.enemies}
          initialXp={xpAtEnd}
          characterName={active.name}
          onCancel={() => {
            // Story 5.5 AC5 — explicit opt-out: end without posting.
            setClosing(false);
            setXpAtEnd(0);
            end();
          }}
          onConfirm={({ summary, notes, xp }) => {
            // Combine summary + notes + XP into the per-room log entry's body.
            const bodyParts = [summary];
            if (notes) bodyParts.push(notes);
            if (xp > 0) bodyParts.push(`+${xp} XP`);
            createNote({
              body: bodyParts.join("\n\n"),
              entryType: "Combat",
              state: "resolved",
              target: encounter.roomId
                ? { kind: "room", id: encounter.roomId }
                : undefined,
            });
            // Story 6.5 — promote any pending Combat entries for this
            // room to resolved so the parser-proposed entries don't
            // double up alongside this summary.
            if (encounter.roomId) {
              for (const n of allNotes) {
                if (
                  n.target?.kind === "room" &&
                  n.target.id === encounter.roomId &&
                  n.entryType === "Combat" &&
                  n.state === "pending"
                ) {
                  updateNote(n.id, { state: "resolved" });
                }
              }
            }
            if (xp > 0) {
              updateCharacter(active.id, { xp: active.xp + xp });
            }
            // Preserve the existing "mark room cleared?" prompt.
            if (encounter.roomId && activeMap) {
              const region = activeMap.regions.find(
                (r) => r.tilesHash === encounter.roomId,
              );
              if (region && !region.cleared) {
                const label =
                  encounter.roomLabel ||
                  region.label ||
                  region.type ||
                  "this room";
                if (confirm(`Mark "${label}" cleared on the map?`)) {
                  const nextRegions = activeMap.regions.map((r) =>
                    r.tilesHash === encounter.roomId
                      ? { ...r, cleared: true }
                      : r,
                  );
                  updateMap(activeMap.id, { regions: nextRegions });
                }
              }
            }
            setClosing(false);
            setXpAtEnd(0);
            end();
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function PreCombatPicker({
  characterLevel,
  onStart,
}: {
  characterLevel: number;
  onStart: (roster: Partial<EnemyState>[]) => void;
}) {
  const [roster, setRoster] = useState<
    { init: Partial<EnemyState>; card: CardRecord; key: string }[]
  >([]);
  const addedFilenames = useMemo(
    () => new Set(roster.map((r) => r.card.filename)),
    [roster],
  );

  // Story 6.5 — pre-populate the roster from any pending Combat entries
  // attached to the active room. Only seeds once (the [] dep) so the
  // player's manual edits from there on aren't blown away.
  const activePin = useActivePin();
  const { notes } = useNotes();
  const cards = useCardsData();
  const creatureStats = useCreaturesData();
  useEffect(() => {
    if (!activePin) return;
    const pending = notes.filter(
      (n) =>
        n.target?.kind === "room" &&
        n.target.id === activePin.tilesHash &&
        n.entryType === "Combat" &&
        n.state === "pending",
    );
    if (pending.length === 0) return;
    const seeded: typeof roster = [];
    pending.forEach((n, idx) => {
      // The note's body is the creature name from the parser (e.g. "Stupid
      // Rat"). Resolve to a card via name match — case-insensitive — since
      // the parser stored the canonical creature name.
      const card = cards.cards.find(
        (c) =>
          c.kind === "creature" &&
          c.name.toLowerCase() === n.body.toLowerCase(),
      );
      if (!card) return;
      const creature = findCreatureForCard(creatureStats, card);
      seeded.push({
        init: enemyInitFromCard(card, creature),
        card,
        key: `pending-${n.id}-${idx}`,
      });
    });
    if (seeded.length > 0) setRoster(seeded);
    // Intentionally only [] — first-mount seed only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          Pick enemies for this encounter
        </h2>
        <span className="text-xs text-zinc-500">
          Tap a creature card to add. {roster.length}{" "}
          {roster.length === 1 ? "enemy" : "enemies"} selected.
        </span>
      </header>
      {roster.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <ul className="flex flex-wrap gap-1.5">
              {roster.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setRoster((prev) => prev.filter((p) => p.key !== r.key))
                    }
                    title={`Remove ${r.card.name} from roster`}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span>{r.card.name}</span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              variant="primary"
              className="ml-auto"
              onClick={() => onStart(roster.map((r) => r.init))}
            >
              Start combat →
            </Button>
          </div>
        </Card>
      )}
      <CreaturePicker
        defaultLevel={characterLevel}
        addedFilenames={addedFilenames}
        onPick={(init, card) =>
          setRoster((prev) => [
            ...prev,
            // Multi-add of the same creature stays distinct via key.
            { init, card, key: `${card.filename}-${prev.length}` },
          ])
        }
      />
      {roster.length === 0 && (
        <p className="text-xs text-zinc-500">
          Or start with no enemies (you can add them mid-fight via{" "}
          <strong>+ Add</strong>).{" "}
          <button
            type="button"
            onClick={() => onStart([])}
            className="underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Start blank →
          </button>
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function CombatHeader({
  round,
  roomLabel,
  characterName,
  characterLevel,
  characterShift,
  characterWeapon,
  characterHpCurrent,
  characterHpBaseline,
  momentum,
  outnumberedEnabled,
  onToggleOutnumbered,
  enemies,
  onNextRound,
  nextRoundNumber,
  xpAtEnd,
  onXpAtEndChange,
  onEndCombat,
}: {
  round: number;
  roomLabel?: string;
  characterName: string;
  characterLevel: number;
  characterShift: number;
  characterWeapon: string;
  characterHpCurrent: number;
  characterHpBaseline: number;
  momentum: number;
  outnumberedEnabled: boolean;
  onToggleOutnumbered: (next: boolean) => void;
  enemies: EnemyState[];
  onNextRound: () => void;
  nextRoundNumber: number;
  xpAtEnd: number;
  onXpAtEndChange: (n: number) => void;
  onEndCombat: () => void;
}) {
  return (
    <Card>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-xl font-semibold">
            Round {round}
            {roomLabel && (
              <span className="rounded bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {roomLabel}
              </span>
            )}
            {momentum > 0 && (
              <span
                className="rounded bg-emerald-200 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100"
                title="Killed an enemy in round 1 of a multi-creature fight (Core Rules p.26)"
              >
                Fearful Momentum +2
              </span>
            )}
          </h2>
          <Button onClick={onNextRound}>End round → {nextRoundNumber}</Button>
        </div>

        {/* Story 5.1 — phone-only vitals strip per UX-DR23. Desktop has
            the Sheet column rendering the same vitals, so hide here to
            avoid duplication (AC4). */}
        <div
          aria-label="Combat vitals"
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm lg:hidden"
        >
          <span className="font-medium">{characterName}</span>
          <span className="text-zinc-500">
            Lvl {characterLevel} · Shift {characterShift} ·{" "}
            {characterWeapon || "—"}
          </span>
          <span className="ml-auto inline-flex items-center gap-2 tabular-nums">
            <span className="text-zinc-500">HP</span>
            <span className="font-mono font-semibold">
              {characterHpCurrent}/{characterHpBaseline}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={outnumberedEnabled}
              onChange={(e) => onToggleOutnumbered(e.target.checked)}
              className="size-3.5"
            />
            Outnumbered{" "}
            <span className="text-zinc-500">
              (optional, p.32 — extra enemy Shift)
            </span>
          </label>
          <div className="flex items-end gap-1">
            <Field label="XP gained">
              <NumberField
                min={0}
                value={xpAtEnd}
                onChange={(e) => onXpAtEndChange(Number(e.target.value) || 0)}
                className="w-20"
              />
            </Field>
            <Button variant="danger" onClick={onEndCombat}>
              End combat
            </Button>
          </div>
        </div>
      </header>

      {enemies.length > 0 && (
        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {enemies.map((e) => (
            <EnemyChip key={e.id} enemy={e} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EnemyChip({ enemy }: { enemy: EnemyState }) {
  const dead = enemy.hp.current <= 0;
  const hpPct =
    enemy.hp.max > 0
      ? Math.max(0, Math.min(100, (enemy.hp.current / enemy.hp.max) * 100))
      : 0;
  const barClass = dead
    ? "bg-zinc-400 dark:bg-zinc-600"
    : hpPct > 50
      ? "bg-emerald-500"
      : hpPct > 25
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div
      className={`flex shrink-0 items-center gap-2 rounded-md border px-2 py-1.5 ${
        dead
          ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
      title={`${enemy.name || "(unnamed)"} — ${enemy.hp.current}/${enemy.hp.max} HP`}
    >
      {enemy.cardId ? (
        <img
          src={cardImageUrl(enemy.cardId)}
          alt=""
          className="size-7 shrink-0 rounded border border-zinc-300 bg-white object-cover dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : (
        <div
          aria-hidden="true"
          className="size-7 shrink-0 rounded border border-dashed border-zinc-300 dark:border-zinc-700"
        />
      )}
      <div className="min-w-0">
        <div
          className={`max-w-[10rem] truncate text-xs font-medium ${
            dead ? "line-through text-zinc-500" : ""
          }`}
        >
          {enemy.name || "(unnamed)"}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <span
              className={`block h-full ${barClass}`}
              style={{ width: `${hpPct}%` }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
            {enemy.hp.current}/{enemy.hp.max}
          </span>
        </div>
      </div>
    </div>
  );
}

function TurnTabs({
  active,
  onSelect,
  pendingCount,
  totalLive,
}: {
  active: TurnTab;
  onSelect: (next: TurnTab) => void;
  pendingCount: number;
  totalLive: number;
}) {
  const items: { id: TurnTab; label: string; badge?: string }[] = [
    { id: "player", label: "Player turn" },
    {
      id: "enemy",
      label: "Enemy turn",
      badge:
        totalLive > 0
          ? `${totalLive - pendingCount}/${totalLive}`
          : undefined,
    },
  ];
  return (
    <div
      role="tablist"
      aria-label="Turn"
      className="grid grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-950/40"
    >
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.id)}
            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white shadow-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-900/40"
            }`}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
