import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatch } from "react-router-dom";

import { Button, Card } from "@/components/ui";
import { useRegisterTablesSearch } from "@/components/TablesSearch";
import { useTablesData } from "@/data/lazy";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import { useTablesPrefs } from "@/hooks/useTablesPrefs";
import {
  categoryFor,
  extractReferencedTableIds,
  groupByCategory,
  isNestedRows,
  rollKindFor,
  rollRandom,
  rollValuesFor,
  rowMatchesRoll,
  searchTablesByRelevance,
  type RollKind,
  type RollValue,
} from "@/lib/tables";
import type { CodexTable, TableRow } from "@/types/tables";

export default function TablesView() {
  // useMatch resolves the table id from the URL whether Tables is mounted
  // via the legacy /tables/:id route or rendered directly inside the new
  // shell's right column.
  const id = useMatch("/tables/:id")?.params.id;
  const [query, setQuery] = useState("");
  const tables = useTablesData();
  // Story 3.1 — Pinned + Recent sections.
  const { pinned, recent, togglePinned, pushRecent } = useTablesPrefs();
  // Story 3.3 — inline expansion. Multiple tables can be open at once.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (k: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Story 3.4 — NEXT entries. Cascade up to 2 levels deep.
  const [nextEntries, setNextEntries] = useState<
    Array<{ id: string; from: string; depth: number }>
  >([]);
  const handleResolveRoll = useCallback(
    (sourceKey: string, matchedText: string) => {
      const knownIds = Object.keys(tables);
      const refs = extractReferencedTableIds(matchedText, knownIds).filter(
        (refId) => refId !== sourceKey,
      );
      if (refs.length === 0) return;
      setNextEntries((prev) => {
        const sourceEntry = prev.find((e) => e.id === sourceKey);
        const sourceDepth = sourceEntry?.depth ?? 0;
        const newDepth = sourceDepth + 1;
        if (newDepth > 2) return prev;
        const next = prev.slice();
        for (const refId of refs) {
          const idx = next.findIndex((e) => e.id === refId);
          const entry = { id: refId, from: sourceKey, depth: newDepth };
          if (idx >= 0) next[idx] = entry;
          else next.push(entry);
        }
        return next;
      });
      // Auto-expand cascaded entries so the player sees them ready to roll.
      setExpanded((s) => {
        const next = new Set(s);
        for (const refId of refs) next.add(refId);
        return next;
      });
    },
    [tables],
  );

  const allKeys = useMemo(() => Object.keys(tables), [tables]);
  const filteredKeys = useMemo(() => {
    if (!query.trim()) return allKeys;
    const q = query.toLowerCase();
    return allKeys.filter((k) => {
      const t = tables[k];
      return (
        k.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      );
    });
  }, [query, allKeys]);

  const grouped = useMemo(() => groupByCategory(filteredKeys), [filteredKeys]);

  // Collapsible category groups in the list. Default closed; auto-open the
  // category containing the active table; force-open all categories while
  // a search query is non-empty so filtered hits are visible.
  const searching = query.trim().length > 0;
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!id) return;
    const cat = grouped.find((g) => g.keys.includes(id))?.category;
    if (!cat) return;
    setOpenCats((s) => {
      if (s.has(cat)) return s;
      const next = new Set(s);
      next.add(cat);
      return next;
    });
  }, [id, grouped]);

  // Story 1.12 — expose the search input to Shell hotkeys (Cmd/Ctrl+K, /).
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useRegisterTablesSearch(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  });

  // Story 3.1 — push to Recent when the active table changes (URL-driven).
  // Story 3.3 — also auto-expand the URL id so /tables/:id deep-links from
  // Rules markdown still surface that table inline.
  useEffect(() => {
    if (!id || !tables[id]) return;
    pushRecent(id);
    setExpanded((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, [id, tables, pushRecent]);

  // Story 3.6 — scroll the targeted row into view after it's been added
  // to expanded/Recent. The first DOM match wins (NEXT renders first), so
  // a target already in NEXT scrolls there without a duplicate render.
  // Unknown ids quietly no-op since the selector finds nothing.
  useEffect(() => {
    if (!id) return;
    const target = document.querySelector(
      `[data-table-row-id="${CSS.escape(id)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [id, nextEntries, expanded]);

  // Filter Pinned / Recent to ids that still exist in the codex (stale ids
  // from old saves get hidden silently).
  const pinnedIds = useMemo(
    () => Array.from(pinned).filter((k) => tables[k]),
    [pinned, tables],
  );
  const recentIds = useMemo(
    () => recent.filter((k) => tables[k]),
    [recent, tables],
  );

  // Story 3.2 — relevance-ordered flat results when searching.
  const searchResults = useMemo(
    () => (query.trim() ? searchTablesByRelevance(tables, query) : []),
    [query, tables],
  );


  return (
    <section>
      <div>
        <div className="space-y-3">
          <input
            ref={searchInputRef}
            type="search"
            placeholder={`Search ${allKeys.length} tables…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {/* Story 3.4 — NEXT section. Auto-populated when a roll on an
              expanded table resolves to text containing other table IDs.
              Hidden when empty per AC. */}
          {!searching && nextEntries.length > 0 && (
            <section aria-label="NEXT tables" className="space-y-1">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                NEXT
              </h3>
              <ul>
                {nextEntries.map((e) =>
                  tables[e.id] ? (
                    <TableRow
                      key={`next-${e.id}`}
                      id={e.id}
                      table={tables[e.id]}
                      pinned={pinned.has(e.id)}
                      expanded={expanded.has(e.id)}
                      onTogglePin={() => togglePinned(e.id)}
                      onToggleExpand={() => toggleExpand(e.id)}
                      onResolveRoll={handleResolveRoll}
                      onDismiss={() =>
                        setNextEntries((prev) =>
                          prev.filter((p) => p.id !== e.id),
                        )
                      }
                      badge={`from ${e.from}`}
                    />
                  ) : null,
                )}
              </ul>
            </section>
          )}

          {/* Pinned section (hidden when empty per AC). */}
          {!searching && pinnedIds.length > 0 && (
            <section aria-label="Pinned tables" className="space-y-1">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                ★ Pinned
              </h3>
              <ul>
                {pinnedIds.map((k) => (
                  <TableRow
                    key={`pin-${k}`}
                    id={k}
                    table={tables[k]}
                    pinned={true}
                    expanded={expanded.has(k)}
                    onTogglePin={() => togglePinned(k)}
                    onToggleExpand={() => toggleExpand(k)}
                    onResolveRoll={handleResolveRoll}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Recent section (hidden when empty per AC). */}
          {!searching && recentIds.length > 0 && (
            <section aria-label="Recent tables" className="space-y-1">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Recent
              </h3>
              <ul>
                {recentIds.map((k) => (
                  <TableRow
                    key={`rec-${k}`}
                    id={k}
                    table={tables[k]}
                    pinned={pinned.has(k)}
                    expanded={expanded.has(k)}
                    onTogglePin={() => togglePinned(k)}
                    onToggleExpand={() => toggleExpand(k)}
                    onResolveRoll={handleResolveRoll}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Story 3.2: when searching, render a flat relevance-ordered
              list instead of the categorized tree (Pinned/Recent are
              already hidden when searching per Story 3.1 gates). */}
          {searching && (
            <section aria-label="Search results">
              {searchResults.length === 0 ? (
                <p className="px-2 text-sm text-zinc-500">
                  No tables match.
                </p>
              ) : (
                <ul>
                  {searchResults.map((k) => (
                    <TableRow
                      key={`s-${k}`}
                      id={k}
                      table={tables[k]}
                      pinned={pinned.has(k)}
                      expanded={expanded.has(k)}
                      onTogglePin={() => togglePinned(k)}
                      onToggleExpand={() => toggleExpand(k)}
                      onResolveRoll={handleResolveRoll}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {!searching && grouped.length === 0 && (
            <p className="text-sm text-zinc-500">No tables match.</p>
          )}
          {!searching && grouped.map((g) => {
            const isOpen = searching || openCats.has(g.category);
            return (
              <details
                key={g.category}
                open={isOpen}
                onToggle={(e) => {
                  if (searching) return; // forced open while filtering
                  const browserOpen = e.currentTarget.open;
                  setOpenCats((s) => {
                    const next = new Set(s);
                    if (browserOpen) next.add(g.category);
                    else next.delete(g.category);
                    return next;
                  });
                }}
                className="group"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="text-[0.7em] text-zinc-400 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    {g.category}
                    <span className="font-normal text-zinc-400">
                      ({g.keys.length})
                    </span>
                  </span>
                </summary>
                <ul className="mt-1">
                  {g.keys.map((k) => (
                    <TableRow
                      key={k}
                      id={k}
                      table={tables[k]}
                      pinned={pinned.has(k)}
                      expanded={expanded.has(k)}
                      onTogglePin={() => togglePinned(k)}
                      onToggleExpand={() => toggleExpand(k)}
                      onResolveRoll={handleResolveRoll}
                    />
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function TableRow({
  id,
  table,
  pinned,
  expanded,
  onTogglePin,
  onToggleExpand,
  onResolveRoll,
  onDismiss,
  badge,
}: {
  id: string;
  table: CodexTable;
  pinned: boolean;
  expanded: boolean;
  onTogglePin: () => void;
  onToggleExpand: () => void;
  onResolveRoll?: (sourceKey: string, matchedText: string) => void;
  onDismiss?: () => void;
  badge?: string;
}) {
  // Strip a leading "ID - " prefix so the visible title isn't redundant
  // with the small mono ID rendered alongside it.
  const cleanTitle = table.title.replace(
    new RegExp(`^${id}\\s*-\\s*`, "i"),
    "",
  );
  return (
    <li data-table-row-id={id}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className={`flex flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm ${
            expanded
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <span
            aria-hidden="true"
            className={`text-[0.7em] text-zinc-400 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <span className="font-mono text-xs text-zinc-400">{id}</span>
          <span className="truncate">{cleanTitle}</span>
          {badge && (
            <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {badge}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label={pinned ? `Unpin ${id}` : `Pin ${id}`}
          title={pinned ? "Unpin" : "Pin to favorites"}
          className={`ml-1 shrink-0 rounded px-1.5 text-base ${
            pinned
              ? "text-amber-500 hover:text-amber-600"
              : "text-zinc-300 hover:text-amber-500 dark:text-zinc-600"
          }`}
        >
          {pinned ? "★" : "☆"}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDismiss();
            }}
            aria-label={`Dismiss ${id} from NEXT`}
            title="Dismiss from NEXT"
            className="ml-1 shrink-0 rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        )}
      </div>
      {expanded && (
        <div className="my-2">
          <TableDetail
            tableKey={id}
            table={table}
            onResolveRoll={onResolveRoll}
          />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

function TableDetail({
  tableKey,
  table,
  onResolveRoll,
}: {
  tableKey: string;
  table: CodexTable;
  onResolveRoll?: (sourceKey: string, matchedText: string) => void;
}) {
  const kind = rollKindFor(table);
  const [roll, setRoll] = useState<RollValue | null>(null);
  const { publishResolved: publishRollResolved } = useCurrentRoll();

  // Publish to the OBS roll overlay whenever the user lands on a roll
  // for this table. We summarise the matched row by joining all but the
  // first column (the first column is the roll/range, the rest is the
  // result the viewer cares about). Story 3.4 also forwards that text
  // to onResolveRoll so the parent can mine it for table-id references.
  useEffect(() => {
    if (roll === null) return;
    const matched = table.data.find((r) => rowMatchesRoll(r, roll));
    let headline = "(no matching row)";
    if (matched) {
      const cols = Object.keys(matched);
      const resultCols = cols.slice(1);
      const parts = resultCols
        .map((c) => {
          const v = matched[c];
          if (v === undefined || v === null) return "";
          if (Array.isArray(v)) return "(see table)";
          return String(v);
        })
        .filter(Boolean);
      if (parts.length > 0) headline = parts.join(" · ");
    }
    publishRollResolved({
      source: "table",
      label: table.title,
      dice: kind.toUpperCase(),
      value: String(roll),
      result: { headline, sub: tableKey },
    });
    if (onResolveRoll && headline !== "(no matching row)") {
      onResolveRoll(tableKey, headline);
    }
  }, [roll, table, tableKey, kind, publishRollResolved, onResolveRoll]);

  return (
    <Card>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{table.title}</h2>
          <span className="font-mono text-xs text-zinc-500">
            {tableKey} · {categoryFor(tableKey)} · {kind.toUpperCase()}
          </span>
        </div>
        <a
          href={`/present/table/${tableKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          title="Open in presenter view (new tab)"
        >
          🖥️ Present ↗
        </a>
      </header>

      {table.notes && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong className="mr-1">Notes:</strong>
          {table.notes}
        </div>
      )}
      {table.flavorText && (
        <div className="mb-3 rounded-md border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-sm italic text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-200">
          {table.flavorText}
        </div>
      )}

      {kind !== "reference" && (
        <RollPicker
          kind={kind}
          value={roll}
          onChange={setRoll}
          onClear={() => setRoll(null)}
        />
      )}

      <div className="mt-4">
        {tableKey === "WMT1" ? (
          <WeaponManoeuvresTable table={table} />
        ) : (
          <FlatTable table={table} highlightRoll={roll} />
        )}
      </div>
    </Card>
  );
}

// ----- Roll picker ---------------------------------------------------------

function RollPicker({
  kind,
  value,
  onChange,
  onClear,
}: {
  kind: RollKind;
  value: RollValue | null;
  onChange: (v: RollValue) => void;
  onClear: () => void;
}) {
  const values = rollValuesFor(kind);
  const gridCls =
    kind === "d66"
      ? "grid grid-cols-6 gap-1"
      : "flex flex-wrap gap-1";
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {kind.toUpperCase()} — tap your roll
        </span>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const r = rollRandom(kind);
              if (r !== null) onChange(r);
            }}
            title="Random roll for me"
          >
            🎲 Roll
          </Button>
          {value !== null && (
            <Button onClick={onClear} title="Clear selected roll">
              Clear
            </Button>
          )}
        </div>
      </div>
      <div className={gridCls}>
        {values.map((v) => {
          const selected = value !== null && String(v) === String(value);
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={selected}
              className={`rounded-md border text-center text-sm transition-colors ${
                kind === "d66"
                  ? "px-1 py-1 font-mono"
                  : "min-w-10 px-2 py-1 font-semibold"
              } ${
                selected
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {String(v)}
            </button>
          );
        })}
      </div>
      {value !== null && (
        <div className="mt-2 text-sm">
          <span className="text-zinc-500">Selected:</span>{" "}
          <strong className="font-mono text-emerald-700 dark:text-emerald-400">
            {String(value)}
          </strong>
        </div>
      )}
    </div>
  );
}

// ----- Generic flat table render ------------------------------------------

function FlatTable({
  table,
  highlightRoll,
}: {
  table: CodexTable;
  highlightRoll: RollValue | null;
}) {
  const cols = useMemo(
    () => (table.data[0] ? Object.keys(table.data[0]) : []),
    [table],
  );
  if (cols.length === 0) {
    return <p className="text-sm text-zinc-500">No data in this table.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-300 dark:border-zinc-700">
            {cols.map((c) => (
              <th
                key={c}
                className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.data.map((row, i) => {
            const isMatch = rowMatchesRoll(row, highlightRoll);
            return (
              <tr
                key={i}
                className={`border-b border-zinc-200 dark:border-zinc-800 ${
                  isMatch
                    ? "bg-emerald-100 dark:bg-emerald-900/40"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1.5 align-top">
                    <Cell value={row[c]} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value }: { value: TableRow[string] }) {
  if (value === undefined || value === null) return <span className="text-zinc-400">—</span>;
  if (isNestedRows(value)) {
    // Generic fallback for tables we haven't special-cased: render the
    // nested rows as a compact inner table.
    const innerCols = Object.keys(value[0] ?? {});
    return (
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            {innerCols.map((c) => (
              <th key={c} className="px-1 py-0.5 text-left text-zinc-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.map((r, i) => (
            <tr key={i}>
              {innerCols.map((c) => (
                <td key={c} className="px-1 py-0.5">
                  {String(r[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <span>{String(value)}</span>;
}

// ----- Weapon Manoeuvres special case (WMT1) -------------------------------

function WeaponManoeuvresTable({ table }: { table: CodexTable }) {
  // Each row in WMT1 is one weapon with 3 nested manoeuvre arrays
  // (Level 1/2/3). Render each weapon as a card with three sub-tables.
  return (
    <div className="space-y-4">
      {table.data.map((row, i) => {
        const weapon = String(row.WEAPON ?? "");
        return (
          <div
            key={i}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <h3 className="mb-2 text-base font-semibold">{weapon}</h3>
            <div className="grid gap-3 lg:grid-cols-3">
              {(["Level 1 Manoeuvres", "Level 2 Manoeuvres", "Level 3 Manoeuvres"] as const).map(
                (col) => {
                  const subs = row[col];
                  if (!isNestedRows(subs)) return null;
                  const innerCols = Object.keys(subs[0] ?? {});
                  return (
                    <div key={col}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {col}
                      </h4>
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            {innerCols.map((c) => (
                              <th key={c} className="px-1 py-1 text-left text-zinc-500">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subs.map((r, j) => (
                            <tr
                              key={j}
                              className="border-b border-zinc-100 dark:border-zinc-900"
                            >
                              {innerCols.map((c) => (
                                <td key={c} className="px-1 py-1 align-top">
                                  {String(r[c] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
