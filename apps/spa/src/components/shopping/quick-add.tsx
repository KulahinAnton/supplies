import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";

/**
 * The free-text field at the top: a one-off that is not an item and never will
 * be — «свічки для торта», «листівка мамі».
 *
 * Enter submits, because this is the field someone uses standing in the
 * kitchen remembering three things at once.
 */
export function QuickAdd({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onAdd(text);
  }

  return (
    <div className="flex gap-2">
      <Input
        value={draft}
        placeholder="Дописати щось разове…"
        aria-label="Дописати щось разове"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <Button onClick={submit} disabled={pending || !draft.trim()} aria-label="Додати">
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
