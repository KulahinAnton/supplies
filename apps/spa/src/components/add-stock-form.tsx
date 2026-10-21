import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { UNIT_SHORT } from "@supplies/core/format";
import { formatDateKey, todayUTC } from "@supplies/core/period";
import type { Unit } from "@supplies/core/units";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { api } from "../api/client";

type Row = {
  /** A stable key so React does not reorder inputs when a row is removed. */
  key: number;
  quantity: string;
  expiresAt: string;
  openedAt: string;
  locationId: string;
  /** Feature 4 — the optional "opened" date, hidden until asked for. */
  openedShown: boolean;
};

let nextKey = 0;

/**
 * PROJECT_PROMPT.md Feature 4 — one purchase, several expiry dates.
 *
 * Buying 10 bottles of water where 2 expire in 3 months, 1 in 6 and 7 in a
 * year is ONE trip to the shop, so it is one submit here: three rows, three
 * batches, three PURCHASE movements, all inside a single transaction.
 *
 * Ported from `apps/web/components/add-stock-form.tsx`. The one structural
 * difference: that version uses react-hook-form's `useFieldArray`, and this
 * one keeps the rows in `useState`. Four fields and an add button do not earn
 * a form library, and the schema that matters is enforced by the API either
 * way.
 */
export function AddStockForm({
  itemId,
  unit,
  barcode,
  locations,
  itemLocationId,
  write,
  onDone,
}: {
  itemId: string;
  unit: Unit;
  /** The item's stored barcode, when it has one — enables the scan check. */
  barcode: string | null;
  /** Feature 22 — the household's shelves, for the per-row picker. */
  locations: { id: string; name: string }[];
  /** The item's own location, pre-selected on every new row. */
  itemLocationId: string | null;
  write: (work: () => Promise<unknown>) => Promise<string | null>;
  onDone: () => void;
}) {
  /**
   * Feature 22 — a new row starts at the item's own location, because that is
   * where this product usually goes. Choosing a different shelf is the
   * exception, and the exception is what should cost a tap.
   */
  const emptyRow = (): Row => ({
    key: nextKey++,
    quantity: "",
    expiresAt: "",
    openedAt: "",
    locationId: itemLocationId ?? "",
    openedShown: false,
  });

  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Barcode read from the camera, compared against the item's own. */
  const [scanned, setScanned] = useState<string | null>(null);

  // The server rejects a future "opened" date; stop the picker offering one.
  const todayKey = formatDateKey(todayUTC());

  function patch(key: number, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  async function submit() {
    setFormError(null);

    const payload = rows
      .filter((row) => row.quantity.trim() !== "")
      .map((row) => ({
        quantity: row.quantity.trim(),
        expiresAt: row.expiresAt || undefined,
        openedAt: row.openedAt || undefined,
        locationId: row.locationId || undefined,
      }));

    if (payload.length === 0) {
      setFormError("Додайте хоча б один рядок із кількістю.");
      return;
    }

    setSaving(true);
    const refusal = await write(() =>
      api.post("/api/stock/add", { itemId, rows: payload }),
    );
    setSaving(false);

    if (refusal) {
      setFormError(refusal);
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="grid grid-cols-[1fr_1.3fr_auto] items-end gap-2"
          >
            <div className="space-y-1.5">
              {index === 0 ? (
                <Label htmlFor={`qty-${row.key}`} className="text-xs">
                  Скільки ({UNIT_SHORT[unit]})
                </Label>
              ) : null}
              <Input
                id={`qty-${row.key}`}
                inputMode="decimal"
                placeholder="0"
                value={row.quantity}
                onChange={(event) => patch(row.key, { quantity: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              {index === 0 ? (
                <Label htmlFor={`exp-${row.key}`} className="text-xs">
                  Придатне до
                </Label>
              ) : null}
              <Input
                id={`exp-${row.key}`}
                type="date"
                value={row.expiresAt}
                onChange={(event) => patch(row.key, { expiresAt: event.target.value })}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Прибрати рядок"
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((r) => r.key !== row.key))
              }
            >
              <Trash2 className="size-4" />
            </Button>

            {/*
              Feature 22 — the same product can live in two places (kitchen
              fridge, basement fridge), which the item's single location cannot
              express. Only worth showing when there is a choice to make.
            */}
            {locations.length > 1 ? (
              <div className="col-span-3 space-y-1.5">
                {index === 0 ? (
                  <Label htmlFor={`loc-${row.key}`} className="text-xs">
                    Де зберігати
                  </Label>
                ) : null}
                <select
                  id={`loc-${row.key}`}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={row.locationId}
                  onChange={(event) =>
                    patch(row.key, { locationId: event.target.value })
                  }
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
            {row.openedShown ? (
              <div className="col-span-3 space-y-1.5">
                <Label htmlFor={`opened-${row.key}`} className="text-xs">
                  Відкрито
                </Label>
                <Input
                  id={`opened-${row.key}`}
                  type="date"
                  max={todayKey}
                  value={row.openedAt}
                  onChange={(event) => patch(row.key, { openedAt: event.target.value })}
                />
              </div>
            ) : (
              <button
                type="button"
                className="col-span-3 -mt-1 text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => patch(row.key, { openedShown: true })}
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
        onClick={() => setRows((current) => [...current, emptyRow()])}
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

      <Button className="w-full" disabled={saving} onClick={submit}>
        {saving ? "Зберігаємо…" : "Додати до запасів"}
      </Button>
    </div>
  );
}
