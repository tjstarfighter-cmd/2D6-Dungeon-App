import type { Character } from "@/types/character";
import { Modal } from "@/components/Modal";
import { useShellNav } from "@/components/Shell";
import { Button } from "@/components/ui";
import { useCharacters } from "@/hooks/useCharacters";
import { useReadOnly } from "@/hooks/useReadOnly";
import { useMapsV2 } from "@/hooks/useMapsV2";
import { useNotes } from "@/hooks/useNotes";
import {
  downloadText,
  parseImport,
  pickJsonFile,
  serialiseBackup,
} from "@/lib/io";

// Story 1.10 — purpose-built CharacterSwitcher modal. Replaces the wrapped
// legacy form with a per-character row UI. Each row carries Switch / Export
// / Delete actions; the modal also surfaces a Past runs section that will
// fill with data once Epic 6's death/exit-shaft archive ships.
//
// Per-character export is additive on the import side — picking a JSON
// merges by id with the existing store rather than replacing it, so
// adding a friend's character doesn't wipe your own.

export function CharacterSwitcherModal({ onClose }: { onClose: () => void }) {
  const { characters, active, remove, setActive, replaceAll } =
    useCharacters();
  const { notes, replaceAll: replaceAllNotes } = useNotes();
  const { maps, replaceAll: replaceAllMaps } = useMapsV2();
  const nav = useShellNav();
  const readOnly = useReadOnly();

  function handleSwitch(id: string) {
    setActive(id);
    onClose();
  }

  function handleNew() {
    // Story 6.2 — close the switcher and hand off to the wizard. The
    // wizard lives in Shell so it can survive any other modal swap and
    // route the new character to its post-creation Sheet view.
    onClose();
    nav.openWizard();
  }

  function handleExport(c: Character) {
    const text = serialiseBackup([c], [], []);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = c.name.replace(/[^a-z0-9]+/gi, "_") || "character";
    downloadText(`2d6d-${safeName}-${stamp}.json`, text);
  }

  async function handleImport() {
    const text = await pickJsonFile();
    if (text == null) return;
    const result = parseImport(text);
    if (result.errors.length > 0) {
      alert(`Import had problems:\n${result.errors.join("\n")}`);
      if (
        result.characters.length === 0 &&
        result.notes.length === 0 &&
        result.maps.length === 0
      ) {
        return;
      }
    }
    // Additive merge — by id, the import wins over the existing record so
    // re-importing an updated copy of an existing character upserts it.
    const charsById = new Map(characters.map((c) => [c.id, c]));
    for (const c of result.characters) charsById.set(c.id, c);
    const notesById = new Map(notes.map((n) => [n.id, n]));
    for (const n of result.notes) notesById.set(n.id, n);
    const mapsById = new Map(maps.map((m) => [m.id, m]));
    for (const m of result.maps) mapsById.set(m.id, m);

    replaceAll(Array.from(charsById.values()));
    replaceAllNotes(Array.from(notesById.values()));
    replaceAllMaps(Array.from(mapsById.values()));
  }

  function handleDelete(c: Character) {
    if (active && c.id === active.id) {
      // Story 1.10's explicit guardrail. Story 6.x extends to dead-state
      // characters where deletion is allowed without switching.
      alert("Switch to a different character first.");
      return;
    }
    if (
      confirm(
        `Delete character "${c.name}"? This cannot be undone — export first if you want a backup.`,
      )
    ) {
      remove(c.id);
    }
  }

  return (
    <Modal title="Character switcher" onClose={onClose}>
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Characters
        </h3>
        {characters.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No characters yet. Create one to start tracking runs.
          </p>
        ) : (
          <ul className="space-y-2">
            {characters.map((c) => (
              <CharacterRow
                key={c.id}
                character={c}
                isActive={active?.id === c.id}
                onSwitch={() => handleSwitch(c.id)}
                onExport={() => handleExport(c)}
                onDelete={() => handleDelete(c)}
              />
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={handleNew} variant="primary">
            + New character
          </Button>
          {/* Story 6.13 — Import disabled while the active character
              is dead so the read-only run can't be polluted. */}
          <Button onClick={handleImport} disabled={readOnly}>
            Import…
          </Button>
        </div>
      </section>

      <section className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Past runs
        </h3>
        <PastRunsList characters={characters} />
      </section>
    </Modal>
  );
}

function CharacterRow({
  character: c,
  isActive,
  onSwitch,
  onExport,
  onDelete,
}: {
  character: Character;
  isActive: boolean;
  onSwitch: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`rounded-md border p-2 ${
        isActive
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-950/40"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold">{c.name}</span>
        <span className="text-xs text-zinc-500">Lvl {c.level}</span>
        {isActive && (
          <span className="rounded-full border border-zinc-900 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900">
            Active
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500 tabular-nums">
          HP {c.hp.current}/{c.hp.baseline} · XP {c.xp}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={onSwitch} disabled={isActive} title={isActive ? "Already active" : "Switch to this character"}>
          Switch
        </Button>
        <Button onClick={onExport} title="Download this character as JSON">
          Export
        </Button>
        <Button
          onClick={onDelete}
          variant="danger"
          disabled={isActive}
          title={
            isActive
              ? "Switch to a different character first"
              : "Delete this character"
          }
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

// Story 6.12 — Past Runs section. Renders one row per archived run
// across all characters, newest first. View read-only / Export PDF
// land in Story 6.13 / Epic 8 — placeholders for now.
function PastRunsList({ characters }: { characters: Character[] }) {
  const rows = characters
    .flatMap((c) =>
      (c.runs ?? []).map((r) => ({ character: c, run: r })),
    )
    .sort((a, b) => b.run.endedAt.localeCompare(a.run.endedAt));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No past runs yet. Archived runs from death or dungeon exit appear here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map(({ character, run }) => {
        const stats = run.summaryStats;
        const treasure = formatCoinsLine(stats.treasureCoins);
        const causeWord = stats.cause.kind === "combat" ? "Killed by" : "Fell to";
        return (
          <li
            key={run.id}
            className="rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {character.name} · Lvl {stats.levelsReached}
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {causeWord} {stats.cause.source}
                  {stats.cause.roomLabel ? ` in ${stats.cause.roomLabel}` : ""}
                  {" · "}
                  {new Date(run.endedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() =>
                    alert(
                      "Read-only run viewer ships in Story 6.13. For now this is a placeholder.",
                    )
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  View read-only
                </button>
                <button
                  type="button"
                  onClick={() =>
                    alert(
                      "PDF export ships in Epic 8. For now this is a placeholder.",
                    )
                  }
                  className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Export PDF
                </button>
              </div>
            </div>
            <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                <dt className="inline font-medium text-zinc-500">Rooms</dt>{" "}
                <dd className="inline tabular-nums">{stats.roomsEntered}</dd>
              </span>
              <span>
                <dt className="inline font-medium text-zinc-500">Kills</dt>{" "}
                <dd className="inline tabular-nums">{stats.killsTotal}</dd>
              </span>
              <span>
                <dt className="inline font-medium text-zinc-500">XP</dt>{" "}
                <dd className="inline tabular-nums">{stats.xp}</dd>
              </span>
              {treasure && (
                <span>
                  <dt className="inline font-medium text-zinc-500">Treasure</dt>{" "}
                  <dd className="inline">{treasure}</dd>
                </span>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function formatCoinsLine(c: { gc: number; sc: number; cc: number }): string {
  const parts: string[] = [];
  if (c.gc) parts.push(`${c.gc}gc`);
  if (c.sc) parts.push(`${c.sc}sc`);
  if (c.cc) parts.push(`${c.cc}cc`);
  return parts.join(" · ");
}
