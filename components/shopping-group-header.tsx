"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteShoppingGroupAction,
  renameShoppingGroupAction,
} from "@/lib/actions/shopping-groups";
import { renderMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * Feature 11 — a group heading: collapse toggle, count, and (for named groups)
 * rename/delete. «Загальна група» gets neither, because it is `groupId = null`
 * rather than a row, and nothing should suggest otherwise.
 */
export function ShoppingGroupHeader({
  groupId,
  name,
  isDefault,
  count,
  collapsed,
  onToggle,
  isDropTarget,
}: {
  groupId: string;
  name: string;
  isDefault: boolean;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  isDropTarget: boolean;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, setPending] = useState(false);

  async function rename() {
    setPending(true);
    const result = await renameShoppingGroupAction(groupId, draft);
    setPending(false);
    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return;
    }
    setRenaming(false);
    router.refresh();
  }

  async function remove() {
    setPending(true);
    const result = await deleteShoppingGroupAction(groupId);
    setPending(false);
    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return;
    }
    // No confirmation: nothing is lost, the rows just move back.
    toast.success("Групу видалено, товари повернулись до загальної");
    router.refresh();
  }

  if (renaming) {
    return (
      <div className="flex gap-2 px-1 py-2">
        <Input
          value={draft}
          autoFocus
          maxLength={40}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void rename();
            if (event.key === "Escape") setRenaming(false);
          }}
        />
        <Button size="sm" disabled={pending} onClick={rename}>
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
            <DropdownMenuItem disabled={pending} onClick={remove}>
              <Trash2 className="size-4" />
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
