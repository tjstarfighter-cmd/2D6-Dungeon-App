import { Modal } from "@/components/Modal";

// Story 5.6 — placeholder run-end modal. Fires when the player's HP
// drops to zero from an enemy attack. Captures cause-of-death context
// so the (eventually full) Epic 6 run-end modal can populate from it.
// For now this is just an OK acknowledgement.

export function RunEndPlaceholderModal({
  enemyName,
  roomLabel,
  characterName,
  onClose,
}: {
  enemyName: string | null;
  roomLabel: string | null;
  characterName: string;
  onClose: () => void;
}) {
  return (
    <Modal title={`${characterName} has fallen`} onClose={onClose}>
      <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
        <p>
          Killed by{" "}
          <strong>{enemyName ?? "an enemy"}</strong>
          {roomLabel ? (
            <>
              {" "}
              in <strong>{roomLabel}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="text-xs text-zinc-500">
          Epic 6 will replace this with the full run-end flow (final-sheet
          export, archive, start-new-character). For now, acknowledge to
          continue.
        </p>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
}
