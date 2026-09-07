import { useState } from "react";
import { Minus, Plus } from "lucide-react";
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
import { AddStockForm } from "../add-stock-form";
import { DialogError, QuantityField, type Write } from "./dialog-bits";

export function ItemActions({
  itemId,
  unit,
  barcode,
  locations,
  itemLocationId,
  write,
  pending,
}: {
  itemId: string;
  unit: Unit;
  barcode: string | null;
  locations: { id: string; name: string }[];
  itemLocationId: string | null;
  write: Write;
  pending: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function take() {
    // The shortfall message names exactly how much is missing (§3.3), so it
    // belongs beside the field rather than in a toast.
    const refusal = await write(() =>
      api.post("/api/stock/consume", { itemId, quantity }),
    );
    setError(refusal);
    if (refusal) return;
    setQuantity("");
    setTakeOpen(false);
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
            locations={locations}
            itemLocationId={itemLocationId}
            write={write}
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

          <QuantityField
            id="take-qty"
            label={`Кількість (${UNIT_SHORT[unit]})`}
            value={quantity}
            onChange={setQuantity}
          />

          {error ? <DialogError>{error}</DialogError> : null}

          <Button onClick={take} disabled={pending || quantity.trim() === ""}>
            {pending ? "Записуємо…" : "Записати"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
