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
  deleteCategoryAction,
  reorderCategoriesAction,
  saveCategoryAction,
  setDefaultCategoryAction,
} from "@/lib/actions/settings";
import { renderMessage } from "@supplies/core/messages";

export type CategoryRow = SettingsRow & {
  /** Feature 13 — null means inherit the household window. */
  expiryWarnDays: number | null;
};

/**
 * Feature 13 + 15 — categories: drag to reorder, star a default, and the one
 * thing locations do not have, a per-category expiry window.
 *
 * The window arrives through the shared panel's `renderExtra` slot rather than
 * a prop the locations panel would have to ignore.
 */
export function CategoryPanel({
  rows,
  householdWarnDays,
}: {
  rows: CategoryRow[];
  householdWarnDays: number;
}) {
  const router = useRouter();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const storedValue = (row: CategoryRow) =>
    row.expiryWarnDays === null ? "" : String(row.expiryWarnDays);

  async function saveDays(row: CategoryRow) {
    setPending(true);
    const result = await saveCategoryAction({
      id: row.id,
      name: row.name,
      expiryWarnDays: edited[row.id],
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
      title="Категорії"
      dndId="settings-categories"
      rows={rows}
      addPlaceholder="Нова категорія"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — категорія за замовчуванням для нових товарів."
      onReorder={reorderCategoriesAction}
      onSetDefault={setDefaultCategoryAction}
      onDelete={deleteCategoryAction}
      onAdd={(name) => saveCategoryAction({ name })}
      renderExtra={(base) => {
        const row = rows.find((r) => r.id === base.id);
        if (!row) return null;
        const value = edited[row.id] ?? storedValue(row);
        const dirty =
          edited[row.id] !== undefined && edited[row.id] !== storedValue(row);

        return (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              aria-label={`Попереджати за скільки днів: ${row.name}`}
              placeholder={String(householdWarnDays)}
              className="h-8 w-16"
              value={value}
              onChange={(event) =>
                setEdited({ ...edited, [row.id]: event.target.value })
              }
            />
            <span className="text-xs text-muted-foreground">дн.</span>
            {dirty ? (
              <Button
                size="icon"
                className="size-8"
                aria-label={`Зберегти ${row.name}`}
                disabled={pending}
                onClick={() => saveDays(row)}
              >
                <Check className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      }}
    >
      <p className="text-xs text-muted-foreground">
        Порожнє поле днів — попереджати як усюди ({householdWarnDays} дн.).
        Вкажіть своє число, щоб, наприклад, про ліки нагадувало за два тижні.
      </p>
    </SettingsListPanel>
  );
}
