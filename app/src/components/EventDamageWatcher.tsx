import { useEffect, useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { useCharacters } from "@/hooks/useCharacters";
import { useNotes } from "@/hooks/useNotes";
import { useToast } from "@/components/Toast";
import { parseDamage, type DamageParseResult } from "@/lib/damage-parser";

// Story 6.8 — watches the notes store for newly-resolved Event entries.
// On a damage-pattern hit, fires a suggestion toast offering Apply
// (subtracts from active character HP) or Edit (opens a small modal
// that breaks down the matches and lets the player adjust the total).
//
// Conservative: only fires for Event entries — Combat / Loot / Roll
// entries already have their own resolution paths (combat-end summary,
// table auto-resolve). Re-firing is suppressed via a per-mount Set of
// already-processed note ids.

interface PendingApply {
  noteId: string;
  parse: DamageParseResult;
}

export function EventDamageWatcher() {
  const { notes } = useNotes();
  const { active, update } = useCharacters();
  const toast = useToast();
  const [pending, setPending] = useState<PendingApply | null>(null);

  // Track already-processed note ids so repeated renders don't keep
  // firing toasts for the same entry. Seed on first render with every
  // already-resolved Event note — fresh page loads shouldn't re-toast
  // historical traps.
  const seenRef = useRef<Set<string> | null>(null);
  if (seenRef.current === null) {
    seenRef.current = new Set(
      notes.filter((n) => n.entryType === "Event" && n.state === "resolved")
        .map((n) => n.id),
    );
  }

  // Stable refs for callbacks the toast keeps alive.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });

  useEffect(() => {
    if (!seenRef.current) return;
    const seen = seenRef.current;
    for (const n of notes) {
      if (n.entryType !== "Event" || n.state !== "resolved") continue;
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      const parse = parseDamage(n.body);
      if (parse.matches.length === 0) continue;
      const id = toast.suggestion({
        message: `Detected: ${parse.total} damage from ${
          parse.matches.length === 1 ? "trap" : "events"
        }. Apply to HP?`,
        primary: {
          label: "Apply",
          onClick: () => {
            applyDamage(parse.total);
            toast.dismiss(id);
          },
        },
        edit: () => {
          toast.dismiss(id);
          setPending({ noteId: n.id, parse });
        },
      });
    }
    // applyDamage closes over stable refs (activeRef, update); no need
    // to re-fire when its identity flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, toast]);

  function applyDamage(amount: number) {
    const c = activeRef.current;
    if (!c) return;
    const next = Math.max(0, c.hp.current - amount);
    update(c.id, { hp: { ...c.hp, current: next } });
  }

  if (!pending) return null;
  return (
    <DamageEditModal
      parse={pending.parse}
      onApply={(amount) => {
        applyDamage(amount);
        setPending(null);
      }}
      onClose={() => setPending(null)}
    />
  );
}

function DamageEditModal({
  parse,
  onApply,
  onClose,
}: {
  parse: DamageParseResult;
  onApply: (amount: number) => void;
  onClose: () => void;
}) {
  const [amountStr, setAmountStr] = useState(String(parse.total));
  const parsed = parseInt(amountStr, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return (
    <Modal
      title="Trap damage — adjust"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onApply(parsed)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:dark:bg-zinc-700 disabled:dark:text-zinc-500"
          >
            Apply {valid ? parsed : ""}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Detected {parse.matches.length}{" "}
          {parse.matches.length === 1 ? "phrase" : "phrases"}:
        </p>
        <ul className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          {parse.matches.map((m, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                {m.amount}
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">
                "{m.phrase}"
              </span>
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-zinc-500">
            Total damage to apply
          </span>
          <input
            type="number"
            min={0}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
    </Modal>
  );
}
