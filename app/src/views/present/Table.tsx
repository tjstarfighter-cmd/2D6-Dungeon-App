import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useTablesData } from "@/data/lazy";
import {
  rollKindFor,
  rollRandom,
  rollValuesFor,
  rowMatchesRoll,
  type RollValue,
} from "@/lib/tables";
import type { TableRow } from "@/types/tables";
import { NotFound } from "@/views/present/Map";

/**
 * Full-bleed table view tuned for video readability. Optional ?roll=
 * URL param highlights the matching row (so OBS can show a roll result
 * with one click from the regular Tables view in the future).
 */
export default function PresentTable() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tables = useTablesData();
  const table = id ? tables[id] : undefined;
  const kind = table ? rollKindFor(table) : "reference";

  // Allow ?roll=8 for 2D6, ?roll=⚂%20⚄ for D66, etc. Falls back to local
  // state if no URL param is set, so the in-presenter dice picker still
  // works offline.
  const urlRoll = searchParams.get("roll");
  const [localRoll, setLocalRoll] = useState<RollValue | null>(null);
  const roll = urlRoll !== null ? coerceRoll(urlRoll) : localRoll;

  function setRoll(v: RollValue | null) {
    if (v === null) {
      setSearchParams({});
      setLocalRoll(null);
      return;
    }
    setSearchParams({ roll: String(v) });
    setLocalRoll(v);
  }

  if (!table) {
    return (
      <NotFound title="Table not found">
        The id <code>{id}</code> doesn't match any table in the codex.
      </NotFound>
    );
  }

  const cols = table.data[0] ? Object.keys(table.data[0]) : [];

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3 text-sm">
        <div>
          <span className="text-base font-semibold">{table.title}</span>
          <span className="ml-3 font-mono text-xs text-zinc-500">{id}</span>
        </div>
        <Link to="/present" className="text-xs text-zinc-400 underline">
          ← index
        </Link>
      </header>

      {(table.notes || table.flavorText) && (
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-2 text-sm">
          {table.notes && (
            <p className="text-amber-300">
              <strong>Notes:</strong> {table.notes}
            </p>
          )}
          {table.flavorText && (
            <p className="mt-1 italic text-fuchsia-300">{table.flavorText}</p>
          )}
        </div>
      )}

      {kind !== "reference" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-6 py-3">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Roll {kind}
          </span>
          <button
            type="button"
            onClick={() => {
              const r = rollRandom(kind);
              if (r !== null) setRoll(r);
            }}
            className="rounded-md border border-emerald-700 bg-emerald-900 px-3 py-1 text-sm hover:bg-emerald-800"
          >
            🎲 Roll
          </button>
          {roll !== null && (
            <>
              <span className="text-sm text-zinc-400">Result:</span>
              <span className="text-2xl font-bold text-emerald-400">
                {String(roll)}
              </span>
              <button
                type="button"
                onClick={() => setRoll(null)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
              >
                Clear
              </button>
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-1">
            {rollValuesFor(kind).map((v) => {
              const selected = roll !== null && String(v) === String(roll);
              return (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setRoll(v)}
                  className={`min-w-8 rounded-md border px-2 py-0.5 text-xs ${
                    selected
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-zinc-700 bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {String(v)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grow overflow-auto px-6 py-4">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="border-b border-zinc-700">
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.data.map((row, i) => {
              const isMatch = rowMatchesRoll(row, roll);
              return (
                <tr
                  key={i}
                  className={`border-b border-zinc-800 ${
                    isMatch
                      ? "bg-emerald-900/40 text-emerald-100"
                      : ""
                  }`}
                >
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      <Cell value={row[c]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Cell({ value }: { value: TableRow[string] }) {
  if (value === undefined || value === null) {
    return <span className="text-zinc-500">—</span>;
  }
  if (Array.isArray(value)) {
    // Nested rows (WMT1 weapon manoeuvres) — render as compact
    // sub-table so the presenter still shows usable data.
    const innerCols = Object.keys(value[0] ?? {});
    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
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
                  {String((r as TableRow)[c] ?? "")}
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

function coerceRoll(s: string): RollValue {
  const n = Number(s);
  return Number.isFinite(n) && /^\d+$/.test(s) ? n : s;
}
