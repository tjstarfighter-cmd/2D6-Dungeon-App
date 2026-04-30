import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";

import { Button, Card } from "@/components/ui";
import { NotesPanel } from "@/components/NotesPanel";
import { useTablesData } from "@/data/lazy";
import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import {
  categoryFor,
  groupByCategory,
  isNestedRows,
  rollKindFor,
  rollRandom,
  rollValuesFor,
  rowMatchesRoll,
  type RollKind,
  type RollValue,
} from "@/lib/tables";
import type { CodexTable, TableRow } from "@/types/tables";

export default function TablesView() {
  const { id } = useParams();
  const [query, setQuery] = useState("");
  const tables = useTablesData();

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

  const active = id ? tables[id] : undefined;

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

  return (
    <section className="mx-auto max-w-7xl">
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* List */}
        <div className="space-y-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-auto lg:pr-2">
          <input
            type="search"
            placeholder={`Search ${allKeys.length} tables…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {grouped.length === 0 && (
            <p className="text-sm text-zinc-500">No tables match.</p>
          )}
          {grouped.map((g) => {
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
                    <li key={k}>
                      <NavLink
                        to={`/tables/${k}`}
                        className={({ isActive }) =>
                          `block rounded px-2 py-1 text-sm ${
                            isActive
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`
                        }
                      >
                        <span className="font-mono text-xs text-zinc-400">{k}</span>{" "}
                        {tables[k].title.replace(new RegExp(`^${k}\\s*-\\s*`, "i"), "")}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {!active ? (
            <IntroPanel />
          ) : (
            <TableDetail tableKey={id!} table={active} />
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function IntroPanel() {
  const tables = useTablesData();
  const sample = ["L1HA_Rooms", "AT1", "WMT1", "MIT1", "ENP1"];
  return (
    <Card title="Tables">
      <p className="text-sm">
        Pick a table from the list. <strong>Lookup mode</strong> is the default
        — tap your rolled value to highlight the matching row. The
        &quot;Roll for me&quot; button is there if you'd rather the app rolled.
      </p>
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Try one of these
        </h3>
        <div className="flex flex-wrap gap-2">
          {sample.map((k) => (
            <Link
              key={k}
              to={`/tables/${k}`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="font-mono text-xs text-zinc-400">{k}</span>{" "}
              {tables[k].title}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TableDetail({ tableKey, table }: { tableKey: string; table: CodexTable }) {
  const kind = rollKindFor(table);
  const [roll, setRoll] = useState<RollValue | null>(null);
  const { publishResolved: publishRollResolved } = useCurrentRoll();

  // Publish to the OBS roll overlay whenever the user lands on a roll
  // for this table. We summarise the matched row by joining all but the
  // first column (the first column is the roll/range, the rest is the
  // result the viewer cares about).
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
  }, [roll, table, tableKey, kind, publishRollResolved]);

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

      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <NotesPanel
          compact
          target={{ kind: "table", id: tableKey }}
          title={`Notes for ${tableKey}`}
        />
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
