import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Card } from "@/components/ui";
import { useCardsData, useRulesData, useTablesData } from "@/data/lazy";
import { search, type HitSource, type SearchHit } from "@/lib/search";

const SOURCE_LABEL: Record<HitSource, string> = {
  rule: "Rules",
  table: "Tables",
  card: "Cards",
};

const SOURCE_COLOUR: Record<HitSource, string> = {
  rule: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  table: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  card: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export default function SearchView() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Pulling all three corpora here means the SearchView's Suspense
  // boundary covers the data load. Once resolved, the search runs in
  // memory on every keystroke (small corpus, no need to debounce).
  const tables = useTablesData();
  const cards = useCardsData();
  const rules = useRulesData();
  const results = useMemo(
    () => search(q, { tables, cards, rules }),
    [q, tables, cards, rules],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function setQ(next: string) {
    if (next) setParams({ q: next });
    else setParams({});
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <Card>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rules, tables, cards…"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-2 text-xs text-zinc-500">
          {q.length < 2
            ? "Type at least 2 characters."
            : `${results.total} match${results.total === 1 ? "" : "es"} for ${JSON.stringify(q)}.`}
        </p>
      </Card>

      {q.length >= 2 && results.total === 0 && (
        <Card>
          <p className="text-sm text-zinc-500">
            No matches across the rules, the {Object.keys({}).length || 64}{" "}
            tables, or the 111 card names. Try a shorter / different term.
          </p>
        </Card>
      )}

      <ResultGroup source="rule" hits={results.rules} />
      <ResultGroup source="table" hits={results.tables} />
      <ResultGroup source="card" hits={results.cards} />
    </section>
  );
}

function ResultGroup({
  source,
  hits,
}: {
  source: HitSource;
  hits: SearchHit[];
}) {
  if (hits.length === 0) return null;
  return (
    <Card title={`${SOURCE_LABEL[source]} (${hits.length})`}>
      <ul className="space-y-2">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              to={hit.to}
              className="block rounded-md border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{hit.title}</span>
                {hit.subtitle && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLOUR[source]}`}
                  >
                    {hit.subtitle}
                  </span>
                )}
              </header>
              {hit.snippet && (
                <p
                  className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
                  // We trust the snippet (it came from our own data) so it's
                  // safe to inject the highlight markup.
                  dangerouslySetInnerHTML={{
                    __html: highlightMatch(hit.snippet, hit.match),
                  }}
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
      {/* If we hit the per-source cap, hint at it */}
      {hits.length >= 30 && (
        <p className="mt-2 text-xs text-zinc-500">
          Showing first 30 — refine the query for fewer.
        </p>
      )}
    </Card>
  );
}

function highlightMatch(text: string, match: string): string {
  if (!match) return escapeHtml(text);
  const safe = escapeHtml(text);
  const re = new RegExp(`(${escapeRegex(match)})`, "gi");
  return safe.replace(
    re,
    '<mark class="bg-yellow-200 px-0.5 dark:bg-yellow-700/60">$1</mark>',
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
