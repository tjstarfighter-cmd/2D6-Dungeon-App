import type { ReactNode } from "react";

import { useReadOnly } from "@/hooks/useReadOnly";

// Story 6.13 — surface-level read-only wrapper. Wrap any region whose
// affordances should disable when the active character is dead. Uses a
// `<fieldset disabled>` so every nested <button>, <input>, <select>,
// <textarea> is natively non-interactive without per-element changes
// (NFR29). Adds a subtle opacity dim so the user has a visual signal
// the column is locked.
//
// SVG hit-targets (MapV2 region taps) aren't form controls, so the
// caller has to guard those programmatically via useReadOnly().

export function ReadOnlyShield({ children }: { children: ReactNode }) {
  const readOnly = useReadOnly();
  if (!readOnly) return <>{children}</>;
  // NB: fieldset with `display: contents` strips form-association
  // (per HTML spec) so `disabled` would NOT propagate to nested
  // controls. Use the default block-fieldset display so the disabled
  // attribute actually inerts every <button>/<input>/<select>/<textarea>
  // inside. We zero out fieldset's default border/padding so it stays
  // visually transparent.
  return (
    <fieldset
      disabled
      data-readonly="true"
      className="m-0 min-w-0 border-0 p-0 opacity-90 [&_button]:cursor-not-allowed [&_button:not([disabled])]:opacity-100"
    >
      {children}
    </fieldset>
  );
}
