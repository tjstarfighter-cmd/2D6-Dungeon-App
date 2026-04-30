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
