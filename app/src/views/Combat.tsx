import { useEffect, useState } from "react";
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

import { EnemiesPanel } from "./combat/EnemiesPanel";
import { EnemyTurnPanel } from "./combat/EnemyTurnPanel";
import { PlayerTurnPanel } from "./combat/PlayerTurnPanel";

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
            <h2 className="text-xl font-semibold">
              Combat — Round {encounter.round}
              {encounter.roomLabel && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {encounter.roomLabel}
                </span>
              )}
              {fearfulMomentumBonus(encounter.round, !!encounter.r1Kill) > 0 && (
                <span
                  className="ml-2 rounded bg-emerald-200 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100"
                  title="Killed an enemy in round 1 of a multi-creature fight (Core Rules p.26)"
                >
                  Fearful Momentum +2
                </span>
              )}
            </h2>
            <p className="text-sm text-zinc-500">
              {active.name} · Shift {active.shift} · Weapon: {active.weapon || "—"} · HP{" "}
              {active.hp.current}/{active.hp.baseline}
            </p>
            <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={!!encounter.outnumberedEnabled}
                onChange={(e) => setOutnumbered(e.target.checked)}
                className="size-3.5"
              />
              Outnumbered{" "}
              <span className="text-zinc-500">
                (optional, p.32 — extra enemy Shift)
              </span>
            </label>
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
                  // If combat was started in a map region, offer to mark it
                  // cleared. Skip silently if the region isn't in the active
                  // map (walls reshaped, different map active, etc.) or is
                  // already cleared.
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
        r1Kill={!!encounter.r1Kill}
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
