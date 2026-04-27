import { Link } from "react-router-dom";

import { useCurrentRoll } from "@/hooks/useCurrentRoll";
import type { CurrentRoll } from "@/types/currentRoll";

/**
 * Chrome-less roll-context overlay. Designed to be added as an OBS
 * Browser Source over a webcam scene — the page background is
 * transparent so OBS can composite it on top of camera feeds.
 *
 * Position the source in OBS to taste (corner overlay is the intended
 * use). Toggle visibility with an OBS hotkey when you want it off.
 */
export default function PresentRoll() {
  const { current } = useCurrentRoll();

  return (
    <main
      className="fixed inset-0 text-zinc-100"
      // Transparent so OBS Browser Source composites cleanly over a
      // webcam scene. Tailwind's `bg-transparent` would also work.
      style={{ background: "transparent" }}
    >
      <Link
        to="/present"
        // Tiny dev affordance — invisible in OBS once the source is
        // cropped to the overlay pill, but useful when testing in a
        // regular browser.
        className="fixed right-3 top-3 rounded-md bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-400 underline"
      >
        ← index
      </Link>

      {current ? <RollPill roll={current} /> : <IdlePill />}
    </main>
  );
}

function IdlePill() {
  return (
    <div className="fixed bottom-6 left-6 max-w-sm">
      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 px-5 py-3 text-zinc-400 shadow-2xl backdrop-blur-sm ring-2 ring-zinc-700/20">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Waiting for a roll
        </div>
        <div className="mt-1 text-sm">
          Tap dice in Combat or a roll on a Table — this overlay updates live.
        </div>
        <div className="mt-1 text-[10px] text-zinc-600">
          Background is transparent — composites over a webcam feed in OBS.
        </div>
      </div>
    </div>
  );
}

function RollPill({ roll }: { roll: CurrentRoll }) {
  const isPending = roll.status === "pending";
  const accent = isPending
    ? "border-amber-500/70 ring-amber-500/20"
    : "border-emerald-500/70 ring-emerald-500/20";

  return (
    <div className="fixed bottom-6 left-6 max-w-lg">
      <div
        className={`rounded-2xl border bg-zinc-950/85 px-6 py-4 shadow-2xl backdrop-blur-sm ring-2 ${accent}`}
      >
        <div className="flex items-baseline gap-3">
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
              isPending ? "text-amber-300" : "text-emerald-300"
            }`}
          >
            {isPending ? "Rolling" : "Result"}
          </span>
          <span className="text-xs font-medium text-zinc-400">
            {roll.label}
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase text-zinc-500">
            {roll.dice}
          </span>
        </div>

        {isPending ? (
          <div className="mt-2 text-2xl font-bold text-zinc-100">
            Roll <span className="font-mono text-amber-300">{roll.dice}</span>
          </div>
        ) : (
          <>
            {roll.value !== undefined && (
              <div className="mt-1 font-mono text-4xl font-bold leading-tight text-emerald-300">
                {roll.value}
              </div>
            )}
            {roll.result?.headline && (
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {roll.result.headline}
              </div>
            )}
            {roll.result?.sub && (
              <div className="mt-0.5 text-sm text-zinc-400">
                {roll.result.sub}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
