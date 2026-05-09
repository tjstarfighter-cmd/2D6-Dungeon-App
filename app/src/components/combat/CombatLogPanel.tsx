import { useEffect, useRef, useState } from "react";

import type { CombatLogEntry } from "@/types/combat";

// Story 5.4 — internal combat log panel.
// Desktop: vertical sidebar that lives next to the active-combat surface.
// Phone: a collapsible bottom strip that summarises the last two entries
// when collapsed and expands to a full-height list on tap. Auto-scrolls
// to the newest entry on append.

export function CombatLogPanel({
  entries,
  onAddNote,
}: {
  entries: CombatLogEntry[];
  onAddNote: (text: string) => void;
}) {
  const [phoneExpanded, setPhoneExpanded] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to the newest entry on every append.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  useEffect(() => {
    if (drafting) inputRef.current?.focus();
  }, [drafting]);

  function commitDraft() {
    if (draft.trim()) onAddNote(draft);
    setDraft("");
    setDrafting(false);
  }

  // Last 1–2 entries summarised for the collapsed phone strip.
  const lastTwo = entries.slice(-2);

  return (
    <>
      {/* Desktop sidebar: always-visible vertical column. */}
      <aside
        aria-label="Combat log"
        className="hidden h-[70vh] flex-col rounded-md border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Combat log
          </h3>
          <span className="font-mono text-xs text-zinc-400">
            {entries.length}
          </span>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2">
          {entries.length === 0 ? (
            <p className="px-2 py-4 text-xs text-zinc-500">
              Round transitions, damage, and your manual notes will appear here.
            </p>
          ) : (
            <ul className="space-y-1">
              {entries.map((e) => (
                <LogEntryLine key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">
          <NoteEditor
            drafting={drafting}
            draft={draft}
            inputRef={inputRef}
            onChangeDraft={setDraft}
            onStart={() => setDrafting(true)}
            onCommit={commitDraft}
            onCancel={() => {
              setDraft("");
              setDrafting(false);
            }}
          />
        </div>
      </aside>

      {/* Phone collapsible strip — pinned to the bottom of the column. */}
      <aside
        aria-label="Combat log (phone)"
        className="rounded-md border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 lg:hidden"
      >
        <button
          type="button"
          onClick={() => setPhoneExpanded((v) => !v)}
          aria-expanded={phoneExpanded}
          className="flex w-full items-center justify-between border-b border-zinc-200 px-3 py-1.5 text-left dark:border-zinc-800"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Combat log{" "}
            <span className="font-mono normal-case text-zinc-400">
              ({entries.length})
            </span>
          </span>
          <span aria-hidden="true" className="text-zinc-400">
            {phoneExpanded ? "▾" : "▸"}
          </span>
        </button>
        {!phoneExpanded ? (
          <div className="px-2 py-1.5">
            {lastTwo.length === 0 ? (
              <p className="text-xs text-zinc-500">No entries yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {lastTwo.map((e) => (
                  <LogEntryLine key={e.id} entry={e} compact />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="max-h-[40vh] overflow-y-auto px-2 py-2">
              {entries.length === 0 ? (
                <p className="px-2 py-4 text-xs text-zinc-500">
                  Round transitions, damage, and your manual notes will appear here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {entries.map((e) => (
                    <LogEntryLine key={e.id} entry={e} />
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
              <NoteEditor
                drafting={drafting}
                draft={draft}
                inputRef={inputRef}
                onChangeDraft={setDraft}
                onStart={() => setDrafting(true)}
                onCommit={commitDraft}
                onCancel={() => {
                  setDraft("");
                  setDrafting(false);
                }}
              />
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function LogEntryLine({
  entry,
  compact = false,
}: {
  entry: CombatLogEntry;
  compact?: boolean;
}) {
  const isNote = entry.kind === "note";
  return (
    <li
      className={`flex items-baseline gap-2 ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      <span className="shrink-0 rounded bg-zinc-100 px-1.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        R{entry.round}
      </span>
      {isNote && (
        <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          note
        </span>
      )}
      <span
        className={
          isNote
            ? "text-zinc-800 dark:text-zinc-200"
            : "text-zinc-600 dark:text-zinc-300"
        }
      >
        {entry.text}
      </span>
    </li>
  );
}

function NoteEditor({
  drafting,
  draft,
  inputRef,
  onChangeDraft,
  onStart,
  onCommit,
  onCancel,
}: {
  drafting: boolean;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChangeDraft: (v: string) => void;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (!drafting) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        + Note
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => onChangeDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Note (Enter to save, Esc to cancel)"
        className="flex-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="button"
        onClick={onCommit}
        className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        ✕
      </button>
    </div>
  );
}
