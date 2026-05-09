import { Link, useParams } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { STATUS_PIPS } from "@/lib/character";
import { tierFor } from "@/lib/level-up";
import { NotFound } from "@/views/present/Map";

// Story 7.3 — chrome-less vitals presenter route. Built for OBS Browser
// Source: full-bleed dark layout, no app shell, live-updates via the
// shared useCharacters store. No new state plumbing — only a new
// rendering layer on top of the existing data hooks.

export default function PresentVitals() {
  const { characterId } = useParams();
  const { characters } = useCharacters();
  const character = characters.find((c) => c.id === characterId);

  if (!character) {
    return (
      <NotFound title="Character not found">
        Characters live in this browser's localStorage. If you're opening
        this URL in OBS or a different session, the character ID won't
        be recognised. Open the Character Switcher in the main app and
        verify the id.
      </NotFound>
    );
  }

  const tier = tierFor(character.level);
  const hpPct = Math.max(
    0,
    Math.min(1, character.hp.current / Math.max(1, character.hp.baseline)),
  );
  const hpColor =
    hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#eab308" : "#ef4444";

  return (
    <main className="fixed inset-0 flex flex-col gap-4 bg-zinc-950 p-6 text-zinc-100">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-3xl font-bold">{character.name}</div>
          <div className="text-base text-zinc-400">
            Lvl {character.level} {tier.tier}
          </div>
        </div>
        <Link to="/present" className="text-xs text-zinc-500 underline">
          ← index
        </Link>
      </header>

      <section aria-label="HP" className="space-y-1">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-400">HP</span>
          <span className="font-mono text-2xl font-bold tabular-nums">
            {character.hp.current}
            <span className="text-zinc-500">/{character.hp.baseline}</span>
          </span>
        </div>
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={character.hp.current}
          aria-valuemin={0}
          aria-valuemax={character.hp.baseline}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${hpPct * 100}%`,
              backgroundColor: hpColor,
            }}
          />
        </div>
      </section>

      <section
        aria-label="Status pips"
        className="grid grid-cols-2 gap-3 text-sm"
      >
        <PipRow
          label="Bloodied"
          color="#ef4444"
          count={STATUS_PIPS}
          filled={character.status.bloodied}
        />
        <PipRow
          label="Soaked"
          color="#3b82f6"
          count={STATUS_PIPS}
          filled={character.status.soaked}
        />
      </section>

      <section
        aria-label="Status conditions"
        className="flex flex-wrap items-center gap-3 text-sm"
      >
        <StatusIcon
          label="Fever"
          glyph="🔥"
          active={character.status.fever}
        />
        <StatusIcon
          label="Pneumonia"
          glyph="🌫"
          active={character.status.pneumonia}
        />
      </section>
    </main>
  );
}

function PipRow({
  label,
  color,
  count,
  filled,
}: {
  label: string;
  color: string;
  count: number;
  filled: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-xs text-zinc-500">
          {filled}/{count}
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-3 w-3 rounded-full border"
            style={{
              backgroundColor: i < filled ? color : "transparent",
              borderColor: color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatusIcon({
  label,
  glyph,
  active,
}: {
  label: string;
  glyph: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${
        active
          ? "border-amber-700 bg-amber-950/40 text-amber-200"
          : "border-zinc-800 bg-zinc-900 text-zinc-600"
      }`}
    >
      <span aria-hidden="true" className="text-base">
        {glyph}
      </span>
      <span>{label}</span>
      <span className="ml-1 text-xs uppercase tracking-wide">
        {active ? "yes" : "—"}
      </span>
    </div>
  );
}
