import { useState } from "react";
import { Minus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UNIT_SHORT } from "@supplies/core/format";
import type { Unit } from "@supplies/core/units";
import { Button } from "@supplies/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";
import { api } from "../../api/client";
import { DialogError, QuantityField, type Write } from "./dialog-bits";

/** Per-batch controls: take from THIS batch, correct, and discard. */
export function BatchActions({
  batchId,
  unit,
  currentQuantity,
  write,
  pending,
}: {
  batchId: string;
  unit: Unit;
  currentQuantity: string;
  write: Write;
  pending: boolean;
}) {
  const [correctOpen, setCorrectOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [takeValue, setTakeValue] = useState("");
  const [value, setValue] = useState(currentQuantity);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, onOk: () => void) {
    const refusal = await write(work);
    setError(refusal);
    if (!refusal) onOk();
  }

  return (
    <div className="flex gap-1">
      {/*
        Feature 24 — take from THIS batch. The item-level button is FEFO and
        refuses expired stock, which leaves someone holding an expired carton
        no way to record using it except to lie about it as waste.
      */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Взяти з цієї партії"
        onClick={() => {
          setError(null);
          setTakeOpen(true);
        }}
      >
        <Minus className="size-3.5" />
      </Button>
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
        onClick={() =>
          void write(() => api.post("/api/stock/discard", { batchId })).then(
            // No field for this one to sit beside — the button is the whole
            // interaction — so a refusal is a toast.
            (refusal) => refusal && toast.error(refusal),
          )
        }
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>

      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Взяти з цієї партії</DialogTitle>
            <DialogDescription>
              Саме з цієї — навіть якщо термін уже минув.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <QuantityField
              id="take-batch-qty"
              label={`Скільки (${UNIT_SHORT[unit]})`}
              value={takeValue}
              onChange={setTakeValue}
              placeholder={currentQuantity}
            />
            <p className="text-xs text-muted-foreground">
              У партії: {currentQuantity} {UNIT_SHORT[unit]}
            </p>
          </div>

          {error ? <DialogError>{error}</DialogError> : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setTakeValue(currentQuantity)}
            >
              Усю партію
            </Button>
            <Button
              className="flex-1"
              disabled={pending || !takeValue}
              onClick={() =>
                void run(
                  () =>
                    api.post("/api/stock/consume-batch", {
                      batchId,
                      quantity: takeValue,
                    }),
                  () => {
                    setTakeOpen(false);
                    setTakeValue("");
                  },
                )
              }
            >
              {pending ? "Записуємо…" : "Взяти"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Скільки насправді?</DialogTitle>
            <DialogDescription>
              Перерахували вручну — запишемо різницю в історію.
            </DialogDescription>
          </DialogHeader>

          <QuantityField
            id="correct-qty"
            label={`Кількість (${UNIT_SHORT[unit]})`}
            value={value}
            onChange={setValue}
          />

          {error ? <DialogError>{error}</DialogError> : null}

          <Button
            disabled={pending}
            onClick={() =>
              void run(
                () => api.post("/api/stock/correct", { batchId, quantity: value }),
                () => setCorrectOpen(false),
              )
            }
          >
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
