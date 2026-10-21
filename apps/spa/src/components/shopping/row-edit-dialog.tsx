import { useState } from "react";
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
 * Feature 12.1 — edit a shopping row.
 *
 * A free-text one-off owns its text, so it is editable. A row that names a
 * real item does not: its label is the item's name, and renaming it here would
 * rename the item everywhere. That field is shown read-only with a pointer to
 * where the rename actually belongs.
 *
 * Keyed on the row id so the fields re-seed when a different row is opened —
 * without it, `useState` would keep the last row's text.
 */
export function RowEditDialog({
  row,
  pending,
  onClose,
  onSave,
}: {
  row: ListRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { freeText?: string; note: string }) => void;
}) {
  if (!row) return null;
  return (
    <RowEditForm
      key={row.id}
      row={row}
      pending={pending}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function RowEditForm({
  row,
  pending,
  onClose,
  onSave,
}: {
  row: ListRow;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { freeText?: string; note: string }) => void;
}) {
  const isFreeText = row.itemId === null;
  const [text, setText] = useState(row.label);
  const [note, setNote] = useState(row.note ?? "");

  function save() {
    onSave({ freeText: isFreeText ? text : undefined, note });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
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
                if (event.key === "Enter") save();
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
                if (event.key === "Enter") save();
              }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={pending}>
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Скасувати
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
