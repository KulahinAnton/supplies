import { useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@supplies/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";

/**
 * Feature 3 — archive, never delete. StockMovement rows reference the item, and
 * "who used the last of it" outlives the family's interest in buying it again.
 */
export function ArchiveButton({
  hasStock,
  pending,
  onArchive,
}: {
  hasStock: boolean;
  pending: boolean;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="text-muted-foreground"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Archive className="size-4" />
        В архів
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Перенести в архів?</DialogTitle>
            <DialogDescription>
              Товар зникне зі списків і нагадувань, але історія збережеться.
              Повернути можна будь-коли.
            </DialogDescription>
          </DialogHeader>

          {hasStock ? (
            <p className="rounded-md bg-warning/15 px-3 py-2 text-sm">
              У товару ще є запас. Він залишиться в базі, але ви більше не
              побачите його серед своїх запасів.
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending} onClick={onArchive}>
              {pending ? "Переносимо…" : "В архів"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Скасувати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
