import { Suspense, useEffect, useState, type ReactNode } from "react";

import type { Character, PotionSlot, ScrollSlot } from "@/types/character";
import { Button, Card, Field, TextField } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { tryApplyMagicEffect } from "@/lib/magic";
import { preloadTables } from "@/data/lazy";
import { PotionPicker, ScrollPicker } from "@/views/Sheet";

// Story 1.7 — Magic sub-tab cards. Compact rows show name + [Use] + ✕ +
// disclosure; expanded rows surface the full editable fields. The [Use]
// action runs the magic interpreter (lib/magic) and either auto-applies
// + removes the row, or fires a "you decide" suggestion toast and leaves
// the row in place.

const POTION_CAP = 5;

interface CardProps {
  character: Character;
  onPatch: (patch: Partial<Character>) => void;
}

// ---- Scrolls --------------------------------------------------------------

export function MagicScrollsCard({ character, onPatch }: CardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<ScrollSlot>) {
    const next = character.scrolls.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ scrolls: next });
  }
  function addBlank() {
    onPatch({
      scrolls: [
        ...character.scrolls,
        { name: "", orbit: "", dispelDoubles: "", effectModifier: "" },
      ],
    });
  }
  function addFromTable(slot: ScrollSlot) {
    onPatch({ scrolls: [...character.scrolls, slot] });
  }
  function remove(i: number) {
    onPatch({ scrolls: character.scrolls.filter((_, idx) => idx !== i) });
  }
  function use(i: number) {
    const s = character.scrolls[i];
    const applied = tryApplyMagicEffect(s.name, s.effectModifier, character);
    if (applied) {
      onPatch({
        ...applied.patch,
        scrolls: character.scrolls.filter((_, idx) => idx !== i),
      });
      toast.success({
        message: `Used ${s.name || "scroll"} — ${applied.description}`,
      });
    } else {
      toast.suggestion({
        message: `${s.name || "Scroll"}: you decide. ${
          s.effectModifier || "Effect not auto-applied."
        }`,
        primary: { label: "Remove", onClick: () => remove(i) },
      });
    }
  }

  return (
    <Card
      title="Magic Scrolls"
      collapsible
      action={
        <div className="flex gap-2">
          <Button onClick={addBlank} title="Add a blank scroll row">
            + Custom
          </Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
            title="Pick from the MST1 scroll catalog"
          >
            {pickerOpen ? "Close picker" : "+ From table"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <Suspense fallback={<PickerLoading label="Loading scrolls…" />}>
          <ScrollPicker
            level={character.level}
            existing={character.scrolls}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}
      {character.scrolls.length === 0
        ? !pickerOpen && <Empty text="No scrolls." />
        : (
            <ul className={`space-y-2 ${pickerOpen ? "mt-3" : ""}`}>
              {character.scrolls.map((s, i) => (
                <ScrollRow
                  key={i}
                  scroll={s}
                  onPatch={(p) => setRow(i, p)}
                  onRemove={() => remove(i)}
                  onUse={() => use(i)}
                />
              ))}
            </ul>
          )}
    </Card>
  );
}

function ScrollRow({
  scroll,
  onPatch,
  onRemove,
  onUse,
}: {
  scroll: ScrollSlot;
  onPatch: (patch: Partial<ScrollSlot>) => void;
  onRemove: () => void;
  onUse: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <CompactRow
        name={scroll.name || "Unnamed scroll"}
        muted={!scroll.name}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onUse={onUse}
        onRemove={onRemove}
      />
      {expanded && (
        <div className="space-y-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
          <Field label="Name">
            <TextField
              value={scroll.name}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Orbit">
              <TextField
                value={scroll.orbit}
                onChange={(e) => onPatch({ orbit: e.target.value })}
              />
            </Field>
            <Field label="Dispel Doubles">
              <TextField
                value={scroll.dispelDoubles}
                onChange={(e) => onPatch({ dispelDoubles: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Effect Modifier">
            <TextField
              value={scroll.effectModifier}
              onChange={(e) => onPatch({ effectModifier: e.target.value })}
            />
          </Field>
        </div>
      )}
    </li>
  );
}

// ---- Potions --------------------------------------------------------------

export function MagicPotionsCard({ character, onPatch }: CardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();
  const atCap = character.potions.length >= POTION_CAP;

  useEffect(() => {
    preloadTables();
  }, []);

  function setRow(i: number, patch: Partial<PotionSlot>) {
    const next = character.potions.slice();
    next[i] = { ...next[i], ...patch };
    onPatch({ potions: next });
  }
  function addBlank() {
    if (atCap) return;
    onPatch({
      potions: [...character.potions, { name: "", effectModifier: "" }],
    });
  }
  function addFromTable(slot: PotionSlot) {
    if (atCap) return;
    onPatch({ potions: [...character.potions, slot] });
  }
  function remove(i: number) {
    onPatch({ potions: character.potions.filter((_, idx) => idx !== i) });
  }
  function use(i: number) {
    const p = character.potions[i];
    const applied = tryApplyMagicEffect(p.name, p.effectModifier, character);
    if (applied) {
      onPatch({
        ...applied.patch,
        potions: character.potions.filter((_, idx) => idx !== i),
      });
      toast.success({
        message: `Used ${p.name || "potion"} — ${applied.description}`,
      });
    } else {
      toast.suggestion({
        message: `${p.name || "Potion"}: you decide. ${
          p.effectModifier || "Effect not auto-applied."
        }`,
        primary: { label: "Remove", onClick: () => remove(i) },
      });
    }
  }

  return (
    <Card
      title="Magic Potions"
      collapsible
      action={
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          <span aria-live="polite">
            {character.potions.length} / {POTION_CAP} carried
          </span>
          <div className="flex gap-2">
            <Button
              onClick={addBlank}
              disabled={atCap}
              title={
                atCap
                  ? `At ${POTION_CAP}-potion cap — remove one to add more`
                  : "Add a blank potion row"
              }
            >
              + Custom
            </Button>
            <Button
              variant={pickerOpen ? "primary" : "default"}
              onClick={() => setPickerOpen((o) => !o)}
              disabled={atCap && !pickerOpen}
              title={
                atCap
                  ? `At ${POTION_CAP}-potion cap — remove one to add more`
                  : "Pick from the MPT1 potion catalog"
              }
            >
              {pickerOpen ? "Close picker" : "+ From table"}
            </Button>
          </div>
        </span>
      }
    >
      {atCap && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          At the {POTION_CAP}-potion carry cap. Use or remove one to make room.
        </p>
      )}
      {pickerOpen && !atCap && (
        <Suspense fallback={<PickerLoading label="Loading potions…" />}>
          <PotionPicker
            level={character.level}
            existing={character.potions}
            onPick={(slot) => {
              addFromTable(slot);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}
      {character.potions.length === 0
        ? !pickerOpen && <Empty text="No potions." />
        : (
            <ul className={`space-y-2 ${pickerOpen || atCap ? "mt-3" : ""}`}>
              {character.potions.map((p, i) => (
                <PotionRow
                  key={i}
                  potion={p}
                  onPatch={(pt) => setRow(i, pt)}
                  onRemove={() => remove(i)}
                  onUse={() => use(i)}
                />
              ))}
            </ul>
          )}
    </Card>
  );
}

function PotionRow({
  potion,
  onPatch,
  onRemove,
  onUse,
}: {
  potion: PotionSlot;
  onPatch: (patch: Partial<PotionSlot>) => void;
  onRemove: () => void;
  onUse: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <CompactRow
        name={potion.name || "Unnamed potion"}
        muted={!potion.name}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onUse={onUse}
        onRemove={onRemove}
      />
      {expanded && (
        <div className="space-y-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
          <Field label="Name">
            <TextField
              value={potion.name}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </Field>
          <Field label="Effect Modifier">
            <TextField
              value={potion.effectModifier}
              onChange={(e) => onPatch({ effectModifier: e.target.value })}
            />
          </Field>
        </div>
      )}
    </li>
  );
}

// ---- Shared row primitives -----------------------------------------------

function CompactRow({
  name,
  muted,
  expanded,
  onToggle,
  onUse,
  onRemove,
}: {
  name: string;
  muted: boolean;
  expanded: boolean;
  onToggle: () => void;
  onUse: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? "Collapse" : "Expand"}
        aria-expanded={expanded}
        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        {expanded ? "▾" : "▸"}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`grow truncate text-left text-sm hover:underline ${
          muted ? "italic text-zinc-500" : ""
        }`}
      >
        {name}
      </button>
      <Button onClick={onUse} title="Apply this row's effect">
        Use
      </Button>
      <Button variant="danger" onClick={onRemove} aria-label={`Remove ${name}`}>
        ✕
      </Button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}

function PickerLoading({ label }: { label: string }): ReactNode {
  return (
    <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40">
      {label}
    </p>
  );
}
