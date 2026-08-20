"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStockAction } from "@/lib/actions/stock";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";

type Row = { quantity: string; expiresAt: string; openedAt: string };
type Values = { rows: Row[] };

const emptyRow: Row = { quantity: "", expiresAt: "", openedAt: "" };

/**
 * PROJECT_PROMPT.md Feature 4 — one purchase, several expiry dates.
 *
 * Buying 10 bottles of water where 2 expire in 3 months, 1 in 6 and 7 in a
 * year is ONE trip to the shop, so it is one submit here: three rows, three
 * batches, three PURCHASE movements, all inside a single transaction.
 */
export function AddStockForm({
  itemId,
  unit,
  onDone,
}: {
  itemId: string;
  unit: Unit;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, control, handleSubmit, formState } = useForm<Values>({
    defaultValues: { rows: [{ ...emptyRow }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "rows" });

  async function onSubmit(values: Values) {
    setFormError(null);

    const rows = values.rows
      .filter((row) => row.quantity.trim() !== "")
      .map((row) => ({
        quantity: row.quantity.trim(),
        expiresAt: row.expiresAt || undefined,
        openedAt: row.openedAt || undefined,
      }));

    if (rows.length === 0) {
      setFormError("Додайте хоча б один рядок із кількістю.");
      return;
    }

    const result = await addStockAction({ itemId, rows });
    if (!result.ok) {
      setFormError(renderMessage(result.error));
      return;
    }

    toast.success(
      rows.length === 1 ? "Запас поповнено" : `Додано партій: ${rows.length}`,
    );
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_1.3fr_auto] items-end gap-2"
          >
            <div className="space-y-1.5">
              {index === 0 ? (
                <Label htmlFor={`rows.${index}.quantity`} className="text-xs">
                  Скільки ({UNIT_SHORT[unit]})
                </Label>
              ) : null}
              <Input
                id={`rows.${index}.quantity`}
                inputMode="decimal"
                placeholder="0"
                {...register(`rows.${index}.quantity` as const)}
              />
            </div>

            <div className="space-y-1.5">
              {index === 0 ? (
                <Label htmlFor={`rows.${index}.expiresAt`} className="text-xs">
                  Придатне до
                </Label>
              ) : null}
              <Input
                id={`rows.${index}.expiresAt`}
                type="date"
                {...register(`rows.${index}.expiresAt` as const)}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Прибрати рядок"
              disabled={fields.length === 1}
              onClick={() => remove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ ...emptyRow })}
      >
        <Plus className="size-4" />
        Ще одна дата
      </Button>

      <p className="text-xs text-muted-foreground">
        Різні дати придатності — різні рядки. Наприклад, 10 пляшок води: 2 до
        листопада, 1 до лютого, 7 до серпня.
      </p>

      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Зберігаємо…" : "Додати до запасів"}
      </Button>
    </form>
  );
}
