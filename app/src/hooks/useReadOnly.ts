import { useCharacters } from "@/hooks/useCharacters";

// Story 6.13 — central read-only check. Returns true when the active
// character is in `state: "dead"` (set by the run-end "View final
// sheet" path). Every editable surface in the app imports this and
// disables its controls at the surface level (NFR29).
//
// No active character → not read-only (the empty-state UIs already
// gate their own affordances on `active != null`).

export function useReadOnly(): boolean {
  const { active } = useCharacters();
  return !!active && active.state === "dead";
}
