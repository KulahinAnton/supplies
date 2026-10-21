import { useDraggable } from "@dnd-kit/core";
import {
  Archive,
  Check,
  CornerUpRight,
  GripVertical,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { moveTargets, type GroupRow } from "@supplies/core/shopping-groups";
import { Button } from "@supplies/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { cn } from "@supplies/ui/utils";
import type { ListRow } from "./types";

export function ListRowItem({
  row,
  groups,
  pending,
  onCheck,
  onUncheck,
  onArchive,
  onDelete,
  onMove,
  onEdit,
}: {
  row: ListRow;
  groups: GroupRow[];
  pending: boolean;
  onCheck: (row: ListRow) => void;
  onUncheck: (rowId: string) => void;
  onArchive: (rowId: string, archived: boolean) => void;
  onDelete: (rowId: string) => void;
  onMove: (rowId: string, target: string) => void;
  onEdit: (row: ListRow) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  const targets = moveTargets(row.groupId, groups);

  return (
    <li
      ref={setNodeRef}
      className={cn("flex items-center gap-2 px-3 py-2.5", isDragging && "opacity-40")}
    >
      {/* Only the handle starts a drag — dragging from anywhere on the row
          would make the list impossible to scroll on a phone. */}
      <button
        type="button"
        aria-label={`Перетягнути ${row.label}`}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Ticking and un-ticking are the same button — a mis-tap in a shop
          should be one tap to undo, not a hunt through a menu. */}
      <Button
        size="icon"
        variant={row.isChecked ? "secondary" : "outline"}
        aria-label={row.isChecked ? "Повернути до списку" : "Купили"}
        disabled={pending}
        onClick={() => (row.isChecked ? onUncheck(row.id) : onCheck(row))}
      >
        {row.isChecked ? <Undo2 className="size-4" /> : <Check className="size-4" />}
      </Button>

      <div className="min-w-0 flex-1">
        {/* §14.2 — a bought row stays where it is, struck through, rather than
            jumping to another part of the page under your thumb. */}
        <div
          className={cn(
            "truncate text-sm font-medium",
            row.isChecked && "text-muted-foreground line-through",
          )}
        >
          {row.label}
        </div>
        {row.note ? (
          <div
            className={cn(
              "truncate text-xs text-foreground/70",
              row.isChecked && "text-muted-foreground line-through",
            )}
          >
            {row.note}
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          {row.isChecked && row.checkedBy
            ? `купив ${row.checkedBy}`
            : `додав ${row.addedBy}`}
        </div>
      </div>

      {/* Archiving hides the row from the group without losing it. */}
      <Button
        size="icon"
        variant="ghost"
        aria-label={`До архіву: ${row.label}`}
        disabled={pending}
        onClick={() => onArchive(row.id, true)}
      >
        <Archive className="size-4" />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        aria-label={`Редагувати ${row.label}`}
        disabled={pending}
        onClick={() => onEdit(row)}
      >
        <Pencil className="size-4" />
      </Button>

      {/* The non-drag route. Drag is fiddly on a small screen and unusable
          with a keyboard or screen reader, so moving is always possible
          without it. */}
      {targets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Перемістити до групи">
                <CornerUpRight className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {targets.map((target) => (
              <DropdownMenuItem
                key={target.id}
                disabled={pending}
                onClick={() => onMove(row.id, target.id)}
              >
                {target.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Button
        size="icon"
        variant="ghost"
        aria-label="Прибрати"
        disabled={pending}
        onClick={() => onDelete(row.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
