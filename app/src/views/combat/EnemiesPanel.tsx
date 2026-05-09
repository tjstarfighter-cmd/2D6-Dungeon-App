import { useState } from "react";

import { CreaturePicker } from "@/components/combat/CreaturePicker";
import { Button, Card } from "@/components/ui";
import type { EnemyState } from "@/types/combat";

import { EnemyCard } from "./EnemyCard";

export function EnemiesPanel({
  enemies,
  defaultLevel,
  onAddBlank,
  onAddInit,
  onRemove,
  onUpdate,
  onDamage,
}: {
  enemies: EnemyState[];
  defaultLevel: number;
  onAddBlank: () => void;
  onAddInit: (init: Partial<EnemyState>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<EnemyState>) => void;
  onDamage: (id: string, amount: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Card
      title={`Enemies (${enemies.length})`}
      action={
        <div className="flex gap-2">
          <Button onClick={onAddBlank}>+ Blank</Button>
          <Button
            variant={pickerOpen ? "primary" : "default"}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {pickerOpen ? "Close picker" : "+ From card"}
          </Button>
        </div>
      }
    >
      {pickerOpen && (
        <CreaturePicker
          defaultLevel={defaultLevel}
          onPick={(init) => {
            onAddInit(init);
            setPickerOpen(false);
          }}
        />
      )}

      {enemies.length === 0 && !pickerOpen ? (
        <p className="text-sm text-zinc-500">No enemies. Add one to start.</p>
      ) : (
        <div className={`space-y-2 ${pickerOpen ? "mt-4" : ""}`}>
          {enemies.map((e) => (
            <EnemyCard
              key={e.id}
              enemy={e}
              onRemove={() => {
                if (confirm(`Remove ${e.name || "this enemy"} from the encounter?`)) {
                  onRemove(e.id);
                }
              }}
              onUpdate={(patch) => onUpdate(e.id, patch)}
              onDamage={(amount) => onDamage(e.id, amount)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

