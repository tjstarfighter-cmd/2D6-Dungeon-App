import { Modal } from "@/components/Modal";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About" onClose={onClose}>
      <div className="space-y-3 text-zinc-700 dark:text-zinc-300">
        <p>
          <strong>2D6 Dungeon companion</strong> — digital companion app for the
          tabletop game by Toby Lancaster.
        </p>
        <p>
          Tracks character sheets, maps, encounters, and rule lookups. All data
          lives in this browser; nothing leaves the device.
        </p>
        <p className="text-xs text-zinc-500">
          The 2D6 Dungeon rulebook, tables, and creature cards are © Toby
          Lancaster. This companion app is an unofficial fan tool.
        </p>
      </div>
    </Modal>
  );
}
