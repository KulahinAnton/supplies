import { useState } from "react";
import { Archive, Plus } from "lucide-react";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";

/**
 * The «Купити (N)» heading and the two actions that sit beside it.
 *
 * «Прибрати куплені» appears only once something is ticked, and the group
 * field only once asked for — neither is a control anyone hunts for, and both
 * would otherwise sit there permanently offering to do nothing.
 */
export function ListToolbar({
  openCount,
  checkedCount,
  pending,
  onArchiveChecked,
  onCreateGroup,
}: {
  openCount: number;
  checkedCount: number;
  pending: boolean;
  onArchiveChecked: () => void;
  onCreateGroup: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    setAdding(false);
    onCreateGroup(name);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Купити ({openCount})
        </h2>
        <div className="flex items-center gap-1">
          {checkedCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onArchiveChecked}
            >
              <Archive className="size-3.5" />
              Прибрати куплені
            </Button>
          ) : null}
          {adding ? null : (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Група
            </Button>
          )}
        </div>
      </div>

      {adding ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            autoFocus
            maxLength={40}
            placeholder="Назва групи, напр. «Сільпо» або «Аптека»"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <Button onClick={submit} disabled={pending || !draft.trim()}>
            Створити
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Скасувати
          </Button>
        </div>
      ) : null}
    </>
  );
}
