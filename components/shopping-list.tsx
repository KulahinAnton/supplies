"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addListRowAction,
  checkListRowAction,
  clearCheckedRowsAction,
  deleteListRowAction,
  uncheckListRowAction,
} from "@/lib/actions/shopping";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";

export type ListRow = {
  id: string;
  label: string;
  itemId: string | null;
  unit: Unit | null;
  isChecked: boolean;
  addedBy: string;
  checkedBy: string | null;
};

export type Candidate = {
  itemId: string;
  name: string;
  state: "OUT" | "LOW";
  detail: string;
};

/**
 * Feature 6. Candidates are SUGGESTIONS — nothing is inserted automatically,
 * because a list that fills itself stops being read.
 *
 * Checking a row off is a stock-in: it asks for quantity and expiry and creates
 * the batch, which is what keeps the list and the inventory from diverging.
 */
export function ShoppingList({
  rows,
  candidates,
}: {
  rows: ListRow[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [freeText, setFreeText] = useState("");
  const [pending, setPending] = useState(false);

  const [buying, setBuying] = useState<ListRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = rows.filter((row) => !row.isChecked);
  const done = rows.filter((row) => row.isChecked);

  async function run(work: () => Promise<{ ok: boolean; error?: unknown }>) {
    setPending(true);
    const result = (await work()) as
      | { ok: true }
      | { ok: false; error: Parameters<typeof renderMessage>[0] };
    setPending(false);
    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return false;
    }
    router.refresh();
    return true;
  }

  async function addFreeText() {
    if (!freeText.trim()) return;
    const ok = await run(() => addListRowAction({ freeText }));
    if (ok) setFreeText("");
  }

  function startCheck(row: ListRow) {
    setError(null);
    setQuantity("");
    setExpiresAt("");
    if (!row.itemId) {
      // A one-off like "свічки" has no stock to update.
      void run(() => checkListRowAction({ rowId: row.id }));
      return;
    }
    setBuying(row);
  }

  /**
   * `withStock: false` checks the row off without touching the inventory.
   * It is passed as an argument rather than by clearing `quantity` first —
   * a setState would not have applied by the time this runs.
   */
  async function confirmBuy(withStock = true) {
    if (!buying) return;
    setError(null);
    setPending(true);
    const result = await checkListRowAction({
      rowId: buying.id,
      rows:
        withStock && quantity.trim()
          ? [{ quantity: quantity.trim(), expiresAt: expiresAt || undefined }]
          : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(renderMessage(result.error));
      return;
    }
    toast.success("Купили");
    setBuying(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={freeText}
          placeholder="Дописати щось разове…"
          onChange={(event) => setFreeText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addFreeText();
            }
          }}
        />
        <Button onClick={addFreeText} disabled={pending || !freeText.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>

      {candidates.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Схоже, треба купити</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {candidates.map((candidate) => (
                <li
                  key={candidate.itemId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {candidate.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {candidate.detail}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => addListRowAction({ itemId: candidate.itemId }))
                    }
                  >
                    <Plus className="size-3.5" />
                    Додати
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Купити ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Список порожній.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {open.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Купили"
                  disabled={pending}
                  onClick={() => startCheck(row)}
                >
                  <Check className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{row.label}</div>
                  <div className="text-xs text-muted-foreground">
                    додав {row.addedBy}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Прибрати"
                  disabled={pending}
                  onClick={() => run(() => deleteListRowAction(row.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Куплено ({done.length})
            </h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => clearCheckedRowsAction())}
            >
              Прибрати куплені
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {done.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-muted-foreground line-through">
                    {row.label}
                  </div>
                  {row.checkedBy ? (
                    <div className="text-xs text-muted-foreground">
                      купив {row.checkedBy}
                    </div>
                  ) : null}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Повернути до списку"
                  disabled={pending}
                  onClick={() => run(() => uncheckListRowAction(row.id))}
                >
                  <Undo2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={buying !== null} onOpenChange={(next) => !next && setBuying(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{buying?.label}</DialogTitle>
            <DialogDescription>
              Скільки купили і до якої дати придатне? Одразу додамо до запасів.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="buy-qty">
                Кількість {buying?.unit ? `(${UNIT_SHORT[buying.unit]})` : ""}
              </Label>
              <Input
                id="buy-qty"
                inputMode="decimal"
                value={quantity}
                autoFocus
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buy-exp">Придатне до</Label>
              <Input
                id="buy-exp"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void confirmBuy(true)}
              disabled={pending}
            >
              Купили
            </Button>
            <Button
              variant="ghost"
              onClick={() => void confirmBuy(false)}
              disabled={pending}
            >
              Без запасу
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
