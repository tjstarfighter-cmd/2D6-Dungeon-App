import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type {
  Backpack,
  Character,
  SideQuest,
  SideQuestStatus,
} from "@/types/character";
import { LARGE_ITEM_SLOTS } from "@/lib/character";
import {
  Button,
  Card,
  Field,
  NumberField,
  Stepper,
  TextArea,
  TextField,
} from "@/components/ui";

// Story 1.8 — Pack sub-tab cards. Backpack (5 slots + free-text caches),
// Resources (coins + treasure + liberated prisoners), and the structured
// SideQuests list.
//
// SideQuest schema lives on Character.sideQuests as `SideQuest[]`; legacy
// freeform strings are migrated by `normalizeCharacter` on read.

interface CardProps {
  character: Character;
  onPatch: (patch: Partial<Character>) => void;
}

// ---- Backpack -------------------------------------------------------------

export function PackBackpackCard({ character, onPatch }: CardProps) {
  function patchBackpack(patch: Partial<Backpack>) {
    onPatch({ backpack: { ...character.backpack, ...patch } });
  }
  function setLargeItem(i: number, value: string) {
    const next = character.backpack.largeItems.slice();
    next[i] = value;
    patchBackpack({ largeItems: next });
  }

  // Display only the first LARGE_ITEM_SLOTS slots; existing characters with
  // longer arrays keep their data on disk but only see the first 5 here.
  const slots = Array.from({ length: LARGE_ITEM_SLOTS }, (_, i) =>
    character.backpack.largeItems[i] ?? "",
  );

  return (
    <Card title="Backpack" collapsible>
      <div>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Large &amp; Heavy Items ({LARGE_ITEM_SLOTS} slots)
        </span>
        <ol className="space-y-1 text-sm">
          {slots.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-zinc-400">{i + 1}.</span>
              <TextField
                value={item}
                onChange={(e) => setLargeItem(i, e.target.value)}
                placeholder={`Empty slot ${i + 1}`}
              />
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Small Items">
          <TextArea
            rows={3}
            value={character.backpack.smallItems}
            onChange={(e) => patchBackpack({ smallItems: e.target.value })}
          />
        </Field>
        <Field label="Rations">
          <TextArea
            rows={3}
            value={character.backpack.rations}
            onChange={(e) => patchBackpack({ rations: e.target.value })}
          />
        </Field>
        <Field label="Loot Lockup">
          <TextArea
            rows={3}
            value={character.backpack.lootLockup}
            onChange={(e) => patchBackpack({ lootLockup: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <TextArea
            rows={3}
            value={character.backpack.additionalNotes}
            onChange={(e) =>
              patchBackpack({ additionalNotes: e.target.value })
            }
          />
        </Field>
      </div>
    </Card>
  );
}

// ---- Resources ------------------------------------------------------------

export function PackResourcesCard({ character, onPatch }: CardProps) {
  function patchCoins(patch: Partial<Character["coins"]>) {
    onPatch({ coins: { ...character.coins, ...patch } });
  }
  return (
    <Card title="Resources" collapsible>
      <div className="grid grid-cols-3 gap-2">
        <Field label="GC (gold)">
          <NumberField
            value={character.coins.gc}
            onChange={(e) => patchCoins({ gc: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="SC (silver)">
          <NumberField
            value={character.coins.sc}
            onChange={(e) => patchCoins({ sc: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="CC (copper)">
          <NumberField
            value={character.coins.cc}
            onChange={(e) => patchCoins({ cc: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <Field label="Treasure" className="mt-3">
        <TextArea
          rows={3}
          value={character.treasure}
          onChange={(e) => onPatch({ treasure: e.target.value })}
        />
      </Field>
      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Liberated Prisoners
        </span>
        <Stepper
          value={character.liberatedPrisoners}
          onChange={(n) => onPatch({ liberatedPrisoners: n })}
          ariaLabel="Liberated prisoners"
          width="w-16"
        />
      </div>
    </Card>
  );
}

// ---- Side Quests ----------------------------------------------------------

const STATUS_CHIP: Record<
  SideQuestStatus,
  { label: string; className: string }
> = {
  active: {
    label: "active",
    className:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  },
  complete: {
    label: "complete",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  abandoned: {
    label: "abandoned",
    className:
      "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400",
  },
};

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SideQuestsCard({ character, onPatch }: CardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function setQuests(next: SideQuest[]) {
    onPatch({ sideQuests: next });
  }

  function patchQuest(id: string, patch: Partial<SideQuest>) {
    setQuests(
      character.sideQuests.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );
  }

  function setStatus(id: string, status: SideQuestStatus) {
    const completedAt =
      status === "active" ? undefined : new Date().toISOString();
    patchQuest(id, { status, completedAt });
  }

  function remove(id: string) {
    setQuests(character.sideQuests.filter((q) => q.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function add(text: string, description: string) {
    const next: SideQuest = {
      id: genId(),
      text,
      description: description.trim() || undefined,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    setQuests([...character.sideQuests, next]);
    setAdding(false);
  }

  return (
    <Card title="Side Quests" collapsible>
      {character.sideQuests.length === 0 ? (
        <p className="text-sm text-zinc-500">No side quests yet.</p>
      ) : (
        <ul className="space-y-2">
          {character.sideQuests.map((q) => (
            <SideQuestRow
              key={q.id}
              quest={q}
              editing={editingId === q.id}
              onStartEdit={() => setEditingId(q.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => {
                patchQuest(q.id, patch);
                setEditingId(null);
              }}
              onComplete={() => setStatus(q.id, "complete")}
              onAbandon={() => setStatus(q.id, "abandoned")}
              onReactivate={() => setStatus(q.id, "active")}
              onRemove={() => remove(q.id)}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <NewQuestEditor
          onAdd={add}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="mt-3">
          <Button onClick={() => setAdding(true)}>+ Add quest</Button>
        </div>
      )}
    </Card>
  );
}

function SideQuestRow({
  quest,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onComplete,
  onAbandon,
  onReactivate,
  onRemove,
}: {
  quest: SideQuest;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<SideQuest>) => void;
  onComplete: () => void;
  onAbandon: () => void;
  onReactivate: () => void;
  onRemove: () => void;
}) {
  const dim = quest.status !== "active";
  const chip = STATUS_CHIP[quest.status];

  if (editing) {
    return (
      <li className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
        <QuestEditor
          initialText={quest.text}
          initialDescription={quest.description ?? ""}
          onSave={(text, description) =>
            onSave({ text, description: description.trim() || undefined })
          }
          onCancel={onCancelEdit}
          onRemove={onRemove}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900 ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start gap-2 text-sm">
        <span
          className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${chip.className}`}
        >
          {chip.label}
        </span>
        <div className="min-w-0 grow">
          <p className="text-zinc-900 dark:text-zinc-100">{quest.text}</p>
          {quest.description && (
            <p className="mt-0.5 text-xs text-zinc-500">{quest.description}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {quest.status === "active" ? (
          <>
            <Button onClick={onComplete} title="Mark complete">
              ✓ Complete
            </Button>
            <Button onClick={onAbandon} title="Abandon quest">
              ✗ Abandon
            </Button>
          </>
        ) : (
          <Button onClick={onReactivate} title="Reactivate">
            ↺ Reactivate
          </Button>
        )}
        <Button onClick={onStartEdit}>Edit</Button>
      </div>
    </li>
  );
}

function NewQuestEditor({
  onAdd,
  onCancel,
}: {
  onAdd: (text: string, description: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
      <QuestEditor
        initialText=""
        initialDescription=""
        onSave={(text, description) => onAdd(text, description)}
        onCancel={onCancel}
      />
    </div>
  );
}

function QuestEditor({
  initialText,
  initialDescription,
  onSave,
  onCancel,
  onRemove,
}: {
  initialText: string;
  initialDescription: string;
  onSave: (text: string, description: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [description, setDescription] = useState(initialDescription);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed, description);
  }

  return (
    <div className="space-y-2">
      <Field label="Quest">
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Recover the priest's stolen relic"
          autoFocus
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
      </Field>
      <Field label="Description (optional)">
        <TextArea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes about who, where, what's at stake…"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={commit} disabled={!text.trim()} variant="primary">
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        {onRemove && (
          <Button onClick={onRemove} variant="danger" className="ml-auto">
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
