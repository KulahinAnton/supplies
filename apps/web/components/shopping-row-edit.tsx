"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";
import { updateListRowAction } from "@/lib/actions/shopping";
import { renderMessage } from "@supplies/core/messages";

/**
 * Feature 12.1 — edit a shopping row.
 *
 * A free-text one-off owns its text, so it is editable. A row that names a
 * real item does not: its label is the item's name, and renaming it here would
 * rename the item everywhere. That field is shown read-only with a pointer to
 * where the rename actually belongs.
 */
export function ShoppingRowEditDialog({
  row,
  open,
  onOpenChange,
}: {
  row: { id: string; label: string; itemId: string | null; note: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isFreeText = row.itemId === null;

  const [text, setText] = useState(row.label);
  const [note, setNote] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    setPending(true);
    const result = await updateListRowAction({
      rowId: row.id,
      freeText: isFreeText ? text : undefined,
      note,
    });
    setPending(false);

    if (!result.ok) {
      setError(renderMessage(result.error));
      return;
    }

    toast.success("Збережено");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Редагувати</DialogTitle>
          <DialogDescription>
            {isFreeText
              ? "Назву й нотатку видно всій родині."
              : "Нотатку видно всій родині."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="row-text">Назва</Label>
            <Input
              id="row-text"
              value={isFreeText ? text : row.label}
              readOnly={!isFreeText}
              autoFocus={isFreeText}
              maxLength={120}
              className={isFreeText ? undefined : "text-muted-foreground"}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
            {isFreeText ? null : (
              <p className="text-xs text-muted-foreground">
                Назва береться з товару — перейменуйте його на сторінці запасів.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="row-note">Нотатка</Label>
            <Input
              id="row-note"
              value={note}
              placeholder="напр. 2 пляшки, тільки Roshen"
              maxLength={200}
              autoFocus={!isFreeText}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={pending}>
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
