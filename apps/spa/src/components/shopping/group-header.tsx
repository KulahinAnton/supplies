import { useState } from "react";
import { ChevronRight, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@supplies/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { Input } from "@supplies/ui/input";
import { cn } from "@supplies/ui/utils";

/**
 * Feature 11 — a group heading: collapse toggle, count, and (for named groups)
 * rename/delete. «Загальна група» gets neither, because it is `groupId = null`
 * rather than a row, and nothing should suggest otherwise.
 */
export function GroupHeader({
  name,
  isDefault,
  count,
  collapsed,
  pending,
  isDropTarget,
  onToggle,
  onRename,
  onDelete,
}: {
  name: string;
  isDefault: boolean;
  count: number;
  collapsed: boolean;
  pending: boolean;
  isDropTarget: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  if (renaming) {
    return (
      <div className="flex gap-2 px-1 py-2">
        <Input
          value={draft}
          autoFocus
          maxLength={40}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setRenaming(false);
              onRename(draft);
            }
            if (event.key === "Escape") setRenaming(false);
          }}
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setRenaming(false);
            onRename(draft);
          }}
        >
          Зберегти
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
          Скасувати
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md px-1 py-1.5 transition-colors",
        isDropTarget && "bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex flex-1 items-center gap-1.5 text-left"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-90",
          )}
        />
        <span className="truncate text-sm font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>

      {isDefault ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label={`Дії групи ${name}`}>
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setDraft(name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" />
              Перейменувати
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={onDelete}>
              <Trash2 className="size-4" />
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
