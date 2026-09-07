import { UNIT_SHORT } from "@supplies/core/format";
import { Button } from "@supplies/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import type { ListRow } from "./types";

/**
 * Feature 6 — ticking a row off is a stock-in.
 *
 * It asks for quantity and expiry and creates the batch, which is what keeps
 * the list and the inventory from diverging: a household that ticks «молоко»
 * and then still sees it as OUT stops trusting either screen. «Без запасу» is
 * the escape hatch for the case the rule cannot cover — bought, but not
 * something worth tracking.
 *
 * The refusal renders **inside the dialog, next to the fields**, because it is
 * always about what was typed there. A toast would put the answer somewhere
 * else on screen from the question.
 */
export function BuyDialog({
  row,
  quantity,
  expiresAt,
  error,
  pending,
  onQuantity,
  onExpiresAt,
  onConfirm,
  onClose,
}: {
  row: ListRow | null;
  quantity: string;
  expiresAt: string;
  error: string | null;
  pending: boolean;
  onQuantity: (value: string) => void;
  onExpiresAt: (value: string) => void;
  onConfirm: (withStock: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{row?.label}</DialogTitle>
          <DialogDescription>
            Скільки купили і до якої дати придатне? Одразу додамо до запасів.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="buy-qty">
              Кількість {row?.unit ? `(${UNIT_SHORT[row.unit]})` : ""}
            </Label>
            <Input
              id="buy-qty"
              inputMode="decimal"
              value={quantity}
              autoFocus
              onChange={(event) => onQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buy-exp">Придатне до</Label>
            <Input
              id="buy-exp"
              type="date"
              value={expiresAt}
              onChange={(event) => onExpiresAt(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onConfirm(true)} disabled={pending}>
            Купили
          </Button>
          <Button variant="ghost" onClick={() => onConfirm(false)} disabled={pending}>
            Без запасу
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
