import { Modal } from "@/components/Modal";

// Placeholder Help / Cheatsheet. Story 1.12 ships the real content
// (gestures, palm rejection, NEXT flow, toast patterns, etc.). For
// Story 1.2 we only ship the keyboard-shortcut list so the menu item
// has something useful — the rest is "coming soon".

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Esc", label: "Close any modal / overlay / wizard" },
  { keys: "Cmd / Ctrl + K", label: "Focus Tables search" },
  { keys: "Cmd / Ctrl + 1 / 2 / 3 / 4", label: "Switch Sheet sub-tabs" },
  { keys: "?", label: "Toggle this Help / Cheatsheet" },
  { keys: "/", label: "Focus the active surface's search" },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Help / Cheatsheet" onClose={onClose}>
      <p className="text-zinc-600 dark:text-zinc-400">
        Full cheatsheet (gestures, palm rejection, room-gen flow, toast
        patterns) ships with Story 1.12. For now, here are the desktop
        keyboard shortcuts:
      </p>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-zinc-700 dark:text-zinc-300">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="contents">
            <dt>
              <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800">
                {s.keys}
              </kbd>
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
