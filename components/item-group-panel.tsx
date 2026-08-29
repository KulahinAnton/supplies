"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SettingsListPanel,
  type SettingsRow,
} from "@/components/settings-list-panel";
import {
  deleteItemGroupAction,
  reorderItemGroupsAction,
  saveItemGroupAction,
} from "@/lib/actions/settings";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";

export type ItemGroupRow = SettingsRow & {
  /** The threshold for the whole set. Feature 25: 0 means no reminders. */
  minQty: string;
  /** Derived from the members, so it is absent until the set has one. */
  unit: Unit | null;
};

/**
 * Feature 26 — sets of interchangeable items: the same product under a new
 * barcode, or two brands the household treats as one thing.
 *
 * Same panel as categories and locations, minus the default star (a set has no
 * "default" to be) and plus the threshold, which is the whole point: one
 * minimum for the set instead of one per brand.
 */
export function ItemGroupPanel({ rows }: { rows: ItemGroupRow[] }) {
  const router = useRouter();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function saveMin(row: ItemGroupRow) {
    setPending(true);
    const result = await saveItemGroupAction({
      id: row.id,
      name: row.name,
      minQty: edited[row.id],
    });
    setPending(false);

    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return;
    }
    const next = { ...edited };
    delete next[row.id];
    setEdited(next);
    toast.success("Збережено");
    router.refresh();
  }

  return (
    <SettingsListPanel
      title="Набори товарів"
      dndId="settings-item-groups"
      rows={rows}
      addPlaceholder="Новий набір"
      defaultHint="Один мінімум на кілька взаємозамінних товарів — наприклад, молоко різних марок. Перетягніть, щоб змінити порядок."
      onReorder={reorderItemGroupsAction}
      onDelete={deleteItemGroupAction}
      onAdd={(name) => saveItemGroupAction({ name, minQty: "0" })}
      renderExtra={(base) => {
        const row = rows.find((r) => r.id === base.id);
        if (!row) return null;

        const value = edited[row.id] ?? row.minQty;
        const dirty = edited[row.id] !== undefined && edited[row.id] !== row.minQty;

        return (
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 w-20"
              inputMode="decimal"
              aria-label={`Мінімум для набору ${row.name}`}
              value={value}
              onChange={(event) =>
                setEdited({ ...edited, [row.id]: event.target.value })
              }
            />
            <span className="w-8 text-xs text-muted-foreground">
              {/* No members yet means no unit to count in — say nothing rather
                  than guess one. */}
              {row.unit ? UNIT_SHORT[row.unit] : "—"}
            </span>
            {dirty ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Зберегти мінімум"
                disabled={pending}
                onClick={() => saveMin(row)}
              >
                <Check className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      }}
    />
  );
}
