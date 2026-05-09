import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useCharacters } from "@/hooks/useCharacters";
import { useEncounter } from "@/hooks/useEncounter";
import { useToast } from "@/components/Toast";
import { setRfut1Pending } from "@/lib/rfut1";

// Story 6.9 — non-combat HP→0 watcher. Active character HP transitions
// from > 0 to ≤ 0 with no encounter active fire the RFUT1 toast. The
// combat-path HP→0 (Story 5.6) still owns its own run-end trigger via
// EnemyTurnPanel, so we explicitly skip when an encounter is live.

export function HpZeroWatcher() {
  const { active } = useCharacters();
  const { encounter } = useEncounter();
  const toast = useToast();
  const navigate = useNavigate();

  // Per-character last-seen HP so flipping the active character doesn't
  // synthesise a phantom transition.
  const lastHp = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!active) return;
    const prev = lastHp.current.get(active.id);
    lastHp.current.set(active.id, active.hp.current);
    if (prev === undefined) return;
    if (prev > 0 && active.hp.current <= 0 && !encounter) {
      const id = toast.suggestion({
        message: `HP→0 outside combat. Roll RFUT1?`,
        primary: {
          label: "Roll",
          onClick: () => {
            toast.dismiss(id);
            setRfut1Pending();
            navigate("/tables/RFUT1");
          },
        },
      });
    }
  }, [active, encounter, toast, navigate]);

  return null;
}
