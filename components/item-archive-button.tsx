"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setItemArchivedAction } from "@/lib/actions/items";
import { renderMessage } from "@/lib/messages";

/**
 * Feature 3 — archive, never delete. StockMovement rows reference the item, and
 * "who used the last of it" outlives the family's interest in buying it again.
 *
 * Archiving hides the item from /items, the dashboard and the shopping
 * suggestions; it stays visible (and restorable) under /items/archive.
 */
export function ItemArchiveButton({
  itemId,
  isArchived,
  hasStock,
}: {
  itemId: string;
  isArchived: boolean;
  hasStock: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function apply(next: boolean) {
    setPending(true);
    const result = await setItemArchivedAction(itemId, next);
    setPending(false);

    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return;
    }

    toast.success(next ? "Перенесено в архів" : "Повернуто з архіву");
    setConfirming(false);
    if (next) {
      router.push("/items");
    } else {
      router.refresh();
    }
  }

  if (isArchived) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => apply(false)}>
        <ArchiveRestore className="size-4" />
        Повернути з архіву
      </Button>
    );
  }

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
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => apply(true)}
            >
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
