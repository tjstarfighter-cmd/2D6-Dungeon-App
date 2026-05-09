import { Modal } from "@/components/Modal";

// Story 6.1 — first-launch Welcome modal. Shown by Shell when no
// characters exist and the localStorage acked flag is unset. The
// primary CTA will hand off to the 5-step wizard (Story 6.2); for now
// Shell shows a placeholder toast so the flow is wired end-to-end.

const FIRST_LAUNCH_KEY = "2d6d.firstLaunchAcked";

export function isFirstLaunchAcked(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FIRST_LAUNCH_KEY) === "1";
  } catch {
    return true;
  }
}

export function ackFirstLaunch(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_LAUNCH_KEY, "1");
  } catch {
    // localStorage may be unavailable; in that case the modal will
    // re-fire on reload, which is acceptable.
  }
}

export function WelcomeModal({
  onCreate,
  onExplore,
}: {
  onCreate: () => void;
  onExplore: () => void;
}) {
  return (
    <Modal
      title="Welcome to 2D6 Dungeon — companion for the tabletop game by Toby Lancaster."
      onClose={onExplore}
      footer={
        <>
          <button
            type="button"
            onClick={onExplore}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            I'll explore first
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + Create your first character
          </button>
        </>
      }
    >
      <div className="space-y-3 text-zinc-700 dark:text-zinc-300">
        <p>
          A digital reference + session-tracker for the 2D6 Dungeon solo dungeon
          crawler. Sheet, map, encounters, and rules — all on one screen.
        </p>
        <p>
          Everything lives in this browser. Nothing leaves the device.
        </p>
      </div>
    </Modal>
  );
}
