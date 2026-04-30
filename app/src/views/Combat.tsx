import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { preloadCreatures } from "@/data/lazy";
import { useCharacters } from "@/hooks/useCharacters";
import { useEncounter } from "@/hooks/useEncounter";
import { useMapsV2 } from "@/hooks/useMapsV2";
import {
  Button,
  Card,
  Field,
  NumberField,
} from "@/components/ui";
import { NotesPanel } from "@/components/NotesPanel";
import { fearfulMomentumBonus } from "@/lib/combat";
import { cardImageUrl } from "@/lib/cards";
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
  } = useEncounter();
  const { active: activeMap, update: updateMap } = useMapsV2();
  const [xpAtEnd, setXpAtEnd] = useState(0);
  const [turnTab, setTurnTab] = useState<TurnTab>("player");

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
        onEndCombat={() => {
          const xp = xpAtEnd > 0 ? ` and grant +${xpAtEnd} XP to ${active.name}` : "";
          if (!confirm(`End combat${xp}?`)) return;
          if (xpAtEnd > 0) {
            updateCharacter(active.id, { xp: active.xp + xpAtEnd });
          }
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
          setXpAtEnd(0);
          end();
        }}
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
            <EnemyTurnPanel characterId={active.id} />
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
  const hpPct =
    characterHpBaseline > 0
      ? Math.max(
          0,
          Math.min(100, (characterHpCurrent / characterHpBaseline) * 100),
        )
      : 0;
  const hpBarClass =
    hpPct > 50
      ? "bg-emerald-500"
      : hpPct > 25
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <Card>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 grow">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
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
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
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
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <span
                  className={`block h-full ${hpBarClass}`}
                  style={{ width: `${hpPct}%` }}
                />
              </span>
            </span>
          </div>
          <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={onNextRound}>End round → {nextRoundNumber}</Button>
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
