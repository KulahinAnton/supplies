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
import { submitOrQueue } from "@/lib/offline/sync-client";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";
import { formatDateKey, todayUTC } from "@/lib/period";
import { BarcodeScanButton } from "@/components/barcode-scan-button";

type Row = { quantity: string; expiresAt: string; openedAt: string; locationId: string };
type Values = { rows: Row[] };

const emptyRow: Row = { quantity: "", expiresAt: "", openedAt: "", locationId: "" };

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
  barcode,
  locations,
  itemLocationId,
  onDone,
}: {
  itemId: string;
  unit: Unit;
  /** The item's stored barcode, when it has one — enables the scan check. */
  barcode?: string | null;
  /** Feature 22 — the household's shelves, for the per-row picker. */
  locations?: { id: string; name: string }[];
  /** The item's own location, pre-selected on every new row. */
  itemLocationId?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  /** Row indexes whose optional "opened" date has been revealed. */
  const [openedRows, setOpenedRows] = useState<ReadonlySet<number>>(new Set());
  /** Barcode read from the camera, compared against the item's own. */
  const [scanned, setScanned] = useState<string | null>(null);
  // The server rejects a future "opened" date; stop the picker offering one.
  const todayKey = formatDateKey(todayUTC());

  /**
   * Feature 22 — a new row starts at the item's own location, because that is
   * where this product usually goes. Choosing a different shelf is the
   * exception, and the exception is what should cost a tap.
   */
  const defaultRow = (): Row => ({ ...emptyRow, locationId: itemLocationId ?? "" });

  const { register, control, handleSubmit, formState } = useForm<Values>({
    defaultValues: { rows: [defaultRow()] },
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
        locationId: row.locationId || undefined,
      }));

    if (rows.length === 0) {
      setFormError("Додайте хоча б один рядок із кількістю.");
      return;
    }

    // Feature 31 — adding stock never conflicts: it appends a batch, and two
    // people adding milk means the household has more milk. So this is the
    // safest of the queued operations, whenever it has to be queued.
    const { applied, result } = await submitOrQueue(
      {
        clientOpId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        kind: "addStock",
        itemId,
        rows,
      },
      () => addStockAction({ itemId, rows }),
    );

    if (!applied) {
      toast.success("Збережено на пристрої — надішлемо, коли буде зв'язок");
      onDone?.();
      return;
    }
    if (result && !result.ok) {
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

            {/*
              Feature 22 — the same product can live in two places (kitchen
              fridge, basement fridge), which the item's single location cannot
              express. Only worth showing when there is a choice to make.
            */}
            {locations && locations.length > 1 ? (
              <div className="col-span-3 space-y-1.5">
                {index === 0 ? (
                  <Label htmlFor={`rows.${index}.locationId`} className="text-xs">
                    Де зберігати
                  </Label>
                ) : null}
                <select
                  id={`rows.${index}.locationId`}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  {...register(`rows.${index}.locationId` as const)}
                >
                  <option value="">Не вказано</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {/*
              "Opened" is a second-order detail — most stock-ins are of sealed
              packs — so it hides behind a toggle rather than adding a third
              always-visible column to a form used one-handed in a kitchen.
            */}
            {openedRows.has(index) ? (
              <div className="col-span-3 space-y-1.5">
                <Label htmlFor={`rows.${index}.openedAt`} className="text-xs">
                  Відкрито
                </Label>
                <Input
                  id={`rows.${index}.openedAt`}
                  type="date"
                  max={todayKey}
                  {...register(`rows.${index}.openedAt` as const)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="col-span-3 -mt-1 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() =>
                  setOpenedRows((current) => new Set(current).add(index))
                }
              >
                + вказати дату відкриття
              </button>
            )}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(defaultRow())}
      >
        <Plus className="size-4" />
        Ще одна дата
      </Button>

      <p className="text-xs text-muted-foreground">
        Різні дати придатності — різні рядки. Наприклад, 10 пляшок води: 2 до
        листопада, 1 до лютого, 7 до серпня.
      </p>

      {/*
        Feature 10 — scanning while restocking is the commoner case than
        scanning while creating. Here the code is a CHECK, not an input: it
        confirms the pack in your hand is the item you are topping up, and
        warns rather than blocks when it does not match.
      */}
      {barcode ? (
        <div className="flex items-center gap-2">
          <BarcodeScanButton onScan={setScanned} />
          <p
            className={
              scanned === null
                ? "text-xs text-muted-foreground"
                : scanned === barcode
                  ? "text-xs text-success-foreground dark:text-success"
                  : "text-xs text-destructive"
            }
          >
            {scanned === null
              ? "Скануйте, щоб перевірити, що це той самий товар."
              : scanned === barcode
                ? "Штрихкод збігається."
                : `Інший штрихкод (${scanned}) — можливо, це інший товар.`}
          </p>
        </div>
      ) : null}

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
