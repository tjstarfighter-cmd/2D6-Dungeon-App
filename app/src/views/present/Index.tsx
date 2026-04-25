import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMaps } from "@/hooks/useMaps";
import { useTablesData, useCardsData } from "@/data/lazy";
import { useTheme } from "@/hooks/useTheme";

/**
 * Presenter index: a chrome-less directory for picking which view to
 * mirror in OBS. Each link is a stable URL you can copy into a
 * Browser Source. Edits in the main app reflect live here.
 */
export default function PresentIndex() {
  // Force-set the theme to match presenter aesthetic. Default-on at
  // dark; user can flip if they really want light.
  const [theme, setTheme] = useTheme();

  const { maps } = useMaps();
  const tables = useTablesData();
  const cards = useCardsData();
  const [cardQuery, setCardQuery] = useState("");
  const [tableQuery, setTableQuery] = useState("");

  const filteredCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return cards.cards.filter((c) =>
      !q ? true : c.name.toLowerCase().includes(q),
    ).slice(0, 60);
  }, [cards, cardQuery]);

  const filteredTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    return Object.entries(tables)
      .filter(([k, t]) =>
        !q
          ? true
          : k.toLowerCase().includes(q) || t.title.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [tables, tableQuery]);

  return (
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Presenter index</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Pick a target — copy the URL of any link below and add it as a
            Browser Source in OBS. Live data; the presenter updates whenever
            you edit in the main app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="text-sm underline">
            ← Back to app
          </Link>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6">
        <Section title={`Maps (${maps.length})`}>
          {maps.length === 0 ? (
            <Empty>No maps yet — create one in the Map view.</Empty>
          ) : (
            <ul className="space-y-2">
              {maps.map((m) => (
                <PresenterRow
                  key={m.id}
                  to={`/present/map/${m.id}`}
                  title={m.name}
                  subtitle={`Level ${m.level} · ${m.ancestry} · ${m.rooms.length} rooms · ${m.exits.length} exits`}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Cards (${cards.cards.length})`}>
          <input
            type="search"
            value={cardQuery}
            onChange={(e) => setCardQuery(e.target.value)}
            placeholder="Filter cards by name…"
            className="mb-3 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredCards.map((c) => (
              <PresenterRow
                key={c.filename}
                to={`/present/card/${encodeURIComponent(c.filename)}`}
                title={c.name}
                subtitle={
                  c.kind === "creature"
                    ? `Level ${c.level} · ${c.category ?? ""}`
                    : c.kind
                }
              />
            ))}
          </ul>
          {cardQuery === "" && cards.cards.length > 60 && (
            <p className="mt-2 text-xs text-zinc-500">
              Showing first 60 — search to narrow down.
            </p>
          )}
        </Section>

        <Section title={`Tables (${Object.keys(tables).length})`}>
          <input
            type="search"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="Filter tables by ID or title…"
            className="mb-3 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <ul className="space-y-2">
            {filteredTables.map(([key, t]) => (
              <PresenterRow
                key={key}
                to={`/present/table/${key}`}
                title={t.title}
                subtitle={key}
              />
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PresenterRow({
  to,
  title,
  subtitle,
}: {
  to: string;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{title}</span>{" "}
          <span className="text-zinc-500">— {subtitle}</span>
        </span>
        <span className="ml-2 shrink-0 text-zinc-400">▶</span>
      </Link>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}
