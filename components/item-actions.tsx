"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Pencil } from "lucide-react";
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
import { AddStockForm } from "@/components/add-stock-form";
import {
  consumeAction,
  correctBatchAction,
  discardBatchAction,
} from "@/lib/actions/stock";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import type { Unit } from "@/lib/generated/prisma/enums";

export function ItemActions({
  itemId,
  unit,
  barcode,
}: {
  itemId: string;
  unit: Unit;
  barcode?: string | null;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function take() {
    setError(null);
    setPending(true);
    const result = await consumeAction({ itemId, quantity });
    setPending(false);

    if (!result.ok) {
      // The shortfall message names exactly how much is missing (§3.3).
      setError(renderMessage(result.error));
      return;
    }

    toast.success("Записали");
    setQuantity("");
    setTakeOpen(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" />
        Поповнити
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setTakeOpen(true)}>
        <Minus className="size-4" />
        Взяли
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Поповнити запас</DialogTitle>
            <DialogDescription>
              Купили кілька партій із різними датами? Додайте кілька рядків.
            </DialogDescription>
          </DialogHeader>
          <AddStockForm
            itemId={itemId}
            unit={unit}
            barcode={barcode}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Скільки взяли?</DialogTitle>
            <DialogDescription>
              Спишемо з партії, яка псується найшвидше. Прострочене не чіпаємо.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="take-qty">Кількість ({UNIT_SHORT[unit]})</Label>
            <Input
              id="take-qty"
              inputMode="decimal"
              value={quantity}
              autoFocus
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button onClick={take} disabled={pending || quantity.trim() === ""}>
            {pending ? "Записуємо…" : "Записати"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Per-batch controls: discard (the only exit for expired stock) and correct. */
export function BatchActions({
  batchId,
  unit,
  currentQuantity,
}: {
  batchId: string;
  unit: Unit;
  currentQuantity: string;
}) {
  const router = useRouter();
  const [correctOpen, setCorrectOpen] = useState(false);
  const [value, setValue] = useState(currentQuantity);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function discard() {
    setPending(true);
    const result = await discardBatchAction({ batchId });
    setPending(false);
    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return;
    }
    toast.success("Списали");
    router.refresh();
  }

  async function correct() {
    setError(null);
    setPending(true);
    const result = await correctBatchAction({ batchId, quantity: value });
    setPending(false);
    if (!result.ok) {
      setError(renderMessage(result.error));
      return;
    }
    toast.success("Виправлено");
    setCorrectOpen(false);
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Виправити кількість"
        onClick={() => setCorrectOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Списати партію"
        disabled={pending}
        onClick={discard}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Скільки насправді?</DialogTitle>
            <DialogDescription>
              Перерахували вручну — запишемо різницю в історію.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="correct-qty">Кількість ({UNIT_SHORT[unit]})</Label>
            <Input
              id="correct-qty"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button onClick={correct} disabled={pending}>
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
