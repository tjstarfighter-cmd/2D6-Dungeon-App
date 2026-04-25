import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useCardsData } from "@/data/lazy";
import {
  applyFilter,
  cardImageUrl,
  CATEGORY_ORDER,
  DEFAULT_FILTER,
  findCard,
  KIND_LABELS,
  KIND_ORDER,
  metaLine,
  type CardFilter,
} from "@/lib/cards";
import { Button, Card } from "@/components/ui";
import { NotesPanel } from "@/components/NotesPanel";
import type { CardRecord } from "@/types/cards";

export default function CardsView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CardFilter>(DEFAULT_FILTER);
  const cards = useCardsData();

  const filtered = useMemo(() => applyFilter(cards.cards, filter), [cards, filter]);
  const lightboxCard = id ? findCard(cards.cards, id) : null;

  // Keyboard / scroll lock for the lightbox.
  useEffect(() => {
    if (!lightboxCard) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") navigate("/cards");
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxCard, navigate]);

  return (
    <section className="mx-auto max-w-7xl space-y-4">
      <Card>
        <FilterBar filter={filter} onChange={setFilter} totalCount={cards.cards.length} matchCount={filtered.length} />
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">No cards match these filters.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => (
            <CardThumbnail key={c.filename} card={c} />
          ))}
        </ul>
      )}

      {lightboxCard && (
        <Lightbox card={lightboxCard} onClose={() => navigate("/cards")} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  onChange,
  totalCount,
  matchCount,
}: {
  filter: CardFilter;
  onChange: (next: CardFilter) => void;
  totalCount: number;
  matchCount: number;
}) {
  const cards = useCardsData();
  const levels = useMemo(() => {
    const set = new Set<number>();
    for (const c of cards.cards) if (c.level !== undefined) set.add(c.level);
    return Array.from(set).sort((a, b) => a - b);
  }, [cards]);
  const categories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => cards.cards.some((c) => c.category === cat)),
    [cards],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          placeholder={`Search ${totalCount} cards by name…`}
          className="grow rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">
          {matchCount} / {totalCount}
        </span>
      </div>

      <ChipRow label="Kind">
        <Chip
          active={filter.kind === "all"}
          onClick={() => onChange({ ...filter, kind: "all" })}
        >
          All
        </Chip>
        {KIND_ORDER.map((k) => (
          <Chip
            key={k}
            active={filter.kind === k}
            onClick={() => onChange({ ...filter, kind: k })}
          >
            {KIND_LABELS[k]}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="Level">
        <Chip
          active={filter.level === "all"}
          onClick={() => onChange({ ...filter, level: "all" })}
        >
          All
        </Chip>
        {levels.map((lv) => (
          <Chip
            key={lv}
            active={filter.level === lv}
            onClick={() => onChange({ ...filter, level: lv })}
          >
            L{lv}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="Category">
        <Chip
          active={filter.category === "all"}
          onClick={() => onChange({ ...filter, category: "all" })}
        >
          All
        </Chip>
        {categories.map((cat) => (
          <Chip
            key={cat}
            active={filter.category === cat}
            onClick={() => onChange({ ...filter, category: cat })}
          >
            {cat}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

function CardThumbnail({ card }: { card: CardRecord }) {
  return (
    <li>
      <Link
        to={`/cards/${encodeURIComponent(card.filename)}`}
        className="group block overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-zinc-100 dark:bg-zinc-950">
          <img
            src={cardImageUrl(card.filename)}
            alt={card.name}
            loading="lazy"
            className="size-full object-contain transition-transform group-hover:scale-[1.02]"
          />
        </div>
        <div className="border-t border-zinc-200 p-2 text-sm dark:border-zinc-800">
          <div className="truncate font-medium" title={card.name}>
            {card.name}
          </div>
          <div className="text-xs text-zinc-500">{metaLine(card)}</div>
        </div>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------

function Lightbox({ card, onClose }: { card: CardRecord; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Card: ${card.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="grid max-h-[92vh] w-full max-w-6xl grid-rows-[auto_1fr] gap-4 overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-[1fr_22rem] md:grid-rows-1 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">{card.name}</h2>
            <p className="text-xs text-zinc-500">{metaLine(card)}</p>
          </div>
          <Button onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>

        <div className="flex items-center justify-center overflow-auto bg-zinc-100 p-2 dark:bg-zinc-950">
          <img
            src={cardImageUrl(card.filename)}
            alt={card.name}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <aside className="flex flex-col overflow-auto border-zinc-200 p-4 md:border-l dark:border-zinc-800">
          <header className="mb-4 hidden items-start justify-between gap-2 md:flex">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold" title={card.name}>
                {card.name}
              </h2>
              <p className="text-xs text-zinc-500">{metaLine(card)}</p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-400">
                {card.filename}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={`/present/card/${encodeURIComponent(card.filename)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                title="Open in presenter view (new tab)"
              >
                🖥️ Present ↗
              </a>
              <Button onClick={onClose} aria-label="Close">
                ✕
              </Button>
            </div>
          </header>
          <div className="grow">
            <NotesPanel
              compact
              target={{
                kind: card.kind === "creature" ? "creature" : "card",
                id: card.filename,
              }}
              title="Notes"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
