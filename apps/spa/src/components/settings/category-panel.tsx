import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { SettingsListPanel } from "@supplies/ui/settings-list-panel";
import { api } from "../../api/client";
import type { Taxonomy } from "../../api/types";
import { useWrite } from "../../hooks/use-settings-write";

/**
 * Feature 13 + 15 — categories: drag to reorder, star a default, and the one
 * thing locations do not have, a per-category expiry window.
 */
export function CategoryPanel({
  categories,
  householdWarnDays,
}: {
  categories: Taxonomy["categories"];
  householdWarnDays: number;
}) {
  const { write, pending } = useWrite();
  const [edited, setEdited] = useState<Record<string, string>>({});

  const stored = (id: string) => {
    const days = categories.find((c) => c.id === id)?.expiryWarnDays;
    return days === null || days === undefined ? "" : String(days);
  };

  return (
    <SettingsListPanel
      title="Категорії"
      dndId="settings-categories"
      rows={categories.map((category) => ({
        id: category.id,
        name: category.name,
        itemCount: category._count.items,
        isDefault: category.isDefault,
      }))}
      addPlaceholder="Нова категорія"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — категорія за замовчуванням для нових товарів."
      onReorder={(ids) => write(() => api.post("/api/settings/categories/reorder", { ids }))}
      onSetDefault={(id) => write(() => api.post(`/api/settings/categories/${id}/default`))}
      onDelete={(id) => write(() => api.del(`/api/settings/categories/${id}`))}
      onAdd={(name) => write(() => api.post("/api/settings/categories", { name }))}
      renderExtra={(base) => {
        const value = edited[base.id] ?? stored(base.id);
        const dirty = edited[base.id] !== undefined && edited[base.id] !== stored(base.id);

        return (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              aria-label={`Попереджати за скільки днів: ${base.name}`}
              placeholder={String(householdWarnDays)}
              className="h-8 w-16"
              value={value}
              onChange={(event) => setEdited({ ...edited, [base.id]: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">дн.</span>
            {dirty ? (
              <Button
                size="icon"
                className="size-8"
                aria-label={`Зберегти ${base.name}`}
                disabled={pending}
                onClick={() =>
                  void write(async () => {
                    await api.post("/api/settings/categories", {
                      id: base.id,
                      name: base.name,
                      expiryWarnDays: edited[base.id],
                    });
                    const next = { ...edited };
                    delete next[base.id];
                    setEdited(next);
                    toast.success("Збережено");
                  })
                }
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
