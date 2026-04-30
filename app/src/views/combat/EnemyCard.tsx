import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Field,
  NumberField,
  Stepper,
  TextField,
} from "@/components/ui";
import { cardImageUrl } from "@/lib/cards";
import type { EnemyState } from "@/types/combat";

export function EnemyCard({
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
  const [open, setOpen] = useState(false);
  const [dmg, setDmg] = useState(1);

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
      className={`overflow-hidden rounded-md border ${
        dead
          ? "border-zinc-300 bg-zinc-100 opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40"
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 grow items-center gap-2 p-2 text-left"
        >
          {enemy.cardId ? (
            <img
              src={cardImageUrl(enemy.cardId)}
              alt=""
              className="size-10 shrink-0 rounded border border-zinc-300 bg-white object-cover dark:border-zinc-700 dark:bg-zinc-900"
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-10 shrink-0 rounded border border-dashed border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
          <div className="min-w-0 grow">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium">
                {enemy.name || (
                  <span className="italic text-zinc-400">(unnamed)</span>
                )}
              </span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {enemy.hp.current}/{enemy.hp.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-full ${barClass}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
          <span aria-hidden="true" className="shrink-0 text-zinc-400">
            {open ? "▾" : "▸"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDamage(1)}
          disabled={dead}
          aria-label="Apply 1 damage"
          className="shrink-0 border-l border-zinc-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-zinc-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
        >
          −1
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {enemy.cardId && (
            <Link
              to={`/cards/${encodeURIComponent(enemy.cardId)}`}
              className="inline-block text-xs font-medium text-zinc-600 underline dark:text-zinc-300"
            >
              View {enemy.name || "creature"} card →
            </Link>
          )}

          <Field label="Name">
            <TextField
              value={enemy.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Enemy name"
            />
          </Field>

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
                  onUpdate({
                    hp: { current: Math.min(enemy.hp.current, n), max: n },
                  })
                }
                min={1}
                max={9999}
              />
            </Field>
          </div>

          <div className="flex items-end gap-2">
            <Field label="Quick damage" className="grow">
              <input
                type="number"
                min={1}
                value={dmg}
                onChange={(e) =>
                  setDmg(Math.max(1, Number(e.target.value) || 1))
                }
                className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
            <Button onClick={() => onDamage(dmg)} disabled={dead}>
              − Apply
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Shift">
              <NumberField
                value={enemy.shift}
                onChange={(e) =>
                  onUpdate({ shift: Number(e.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Interrupt">
              {enemy.cardId ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300">
                  {enemy.interrupt || (
                    <span className="text-zinc-400">(none)</span>
                  )}
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
                  {enemy.manoeuvres || (
                    <span className="text-zinc-400">(none)</span>
                  )}
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

          <div className="flex justify-end">
            <Button variant="danger" onClick={onRemove}>
              Remove enemy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
