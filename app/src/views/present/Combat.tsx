import { Link } from "react-router-dom";

import { useEncounter } from "@/hooks/useEncounter";
import { fearfulMomentumBonus } from "@/lib/combat";

// Story 7.4 — chrome-less combat presenter route. Reads the same
// useEncounter store the in-app Combat overlay uses, so the OBS
// browser source updates live as rounds advance, enemies take damage,
// and combat log entries land. No new state plumbing.

const LOG_TAIL = 6;

export default function PresentCombat() {
  const { encounter } = useEncounter();

  if (!encounter || !encounter.active) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-300">
            Awaiting encounter…
          </div>
          <Link
            to="/present"
            className="mt-4 inline-block text-xs text-zinc-500 underline"
          >
            ← presenter index
          </Link>
        </div>
      </main>
    );
  }

  const momentum = fearfulMomentumBonus(encounter.round, !!encounter.r1Kill);
  const tail = (encounter.log ?? []).slice(-LOG_TAIL);

  return (
    <main className="fixed inset-0 flex flex-col gap-4 bg-zinc-950 p-6 text-zinc-100">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Round
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {encounter.round}
            </div>
          </div>
          {encounter.roomLabel && (
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Room
              </div>
              <div className="text-xl font-semibold">{encounter.roomLabel}</div>
            </div>
          )}
          {momentum > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Momentum
              </div>
              <div className="text-xl font-semibold text-emerald-400">
                +{momentum} Shift
              </div>
            </div>
          )}
        </div>
        <Link to="/present" className="text-xs text-zinc-500 underline">
          ← index
        </Link>
      </header>

      <section aria-label="Enemies" className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Enemies ({encounter.enemies.length})
        </h2>
        {encounter.enemies.length === 0 ? (
          <p className="text-sm text-zinc-500">No enemies in roster.</p>
        ) : (
          <ul className="space-y-1.5">
            {encounter.enemies.map((e) => {
              const pct = Math.max(
                0,
                Math.min(1, e.hp.current / Math.max(1, e.hp.max)),
              );
              const dead = e.hp.current <= 0;
              const color =
                pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
              return (
                <li
                  key={e.id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm ${
                    dead
                      ? "border-zinc-800 bg-zinc-900 text-zinc-500 line-through"
                      : "border-zinc-700 bg-zinc-900"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {e.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full"
                        style={{
                          width: `${pct * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums">
                      {e.hp.current}/{e.hp.max}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Combat log" className="min-h-0 flex-1 space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Combat log (last {LOG_TAIL})
        </h2>
        {tail.length === 0 ? (
          <p className="text-sm text-zinc-500">No log entries yet.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {tail.map((l) => (
              <li
                key={l.id}
                className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1"
              >
                <span className="text-zinc-500">R{l.round}</span>{" "}
                <span className={l.kind === "note" ? "text-amber-300" : ""}>
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
