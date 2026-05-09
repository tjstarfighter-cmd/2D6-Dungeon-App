import { useMemo, useState } from "react";

import { useCardsData, useCreaturesData } from "@/data/lazy";
import { cardImageUrl } from "@/lib/cards";
import { enemyInitFromCard, findCreatureForCard } from "@/lib/creatures";
import type { CardRecord } from "@/types/cards";
import type { EnemyState } from "@/types/combat";

// Story 5.2 — shared creature picker. Used by the pre-combat surface
// (Combat.tsx, no encounter yet) AND by EnemiesPanel (mid-fight + Add
// reinforcements). Extracted from views/combat/EnemiesPanel.tsx so the
// two surfaces stay in sync.

export function CreaturePicker({
  defaultLevel,
  addedFilenames,
  onPick,
}: {
  defaultLevel: number;
  /** Filenames already in the roster — render with an "added" badge so
   *  the player can see what's queued without scrolling away. */
  addedFilenames?: ReadonlySet<string>;
  onPick: (init: Partial<EnemyState>, card: CardRecord) => void;
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
            const added = addedFilenames?.has(c.filename) ?? false;
            return (
              <li key={c.filename}>
                <button
                  type="button"
                  onClick={() => onPick(enemyInitFromCard(c, creature), c)}
                  className={`group relative block w-full overflow-hidden rounded-md border text-left transition-shadow hover:shadow-md ${
                    added
                      ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/30"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                  title={c.name}
                >
                  {added && (
                    <span
                      aria-label="Already in roster"
                      className="absolute right-1 top-1 z-10 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                    >
                      ✓ Added
                    </span>
                  )}
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
