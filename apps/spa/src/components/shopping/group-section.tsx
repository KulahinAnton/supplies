import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ArchiveRestore, Plus, Trash2 } from "lucide-react";
import type { GroupedList, GroupRow } from "@supplies/core/shopping-groups";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { cn } from "@supplies/ui/utils";
import { GroupHeader } from "./group-header";
import { ListRowItem } from "./list-row-item";
import type { ListRow } from "./types";

/**
 * One group: a droppable region wrapping its rows, its own add field, and —
 * when it has any — a toggle revealing its archived rows.
 */
export function GroupSection({
  group,
  groups,
  collapsed,
  showArchived,
  isOver,
  pending,
  onToggle,
  onToggleArchived,
  onAdd,
  onRename,
  onDeleteGroup,
  onCheck,
  onUncheck,
  onArchive,
  onDelete,
  onMove,
  onEdit,
}: {
  group: GroupedList<ListRow>;
  groups: GroupRow[];
  collapsed: boolean;
  showArchived: boolean;
  isOver: boolean;
  pending: boolean;
  onToggle: () => void;
  onToggleArchived: () => void;
  onAdd: (text: string) => void;
  onRename: (name: string) => void;
  onDeleteGroup: () => void;
  onCheck: (row: ListRow) => void;
  onUncheck: (rowId: string) => void;
  onArchive: (rowId: string, archived: boolean) => void;
  onDelete: (rowId: string) => void;
  onMove: (rowId: string, target: string) => void;
  onEdit: (row: ListRow) => void;
}) {
  const { setNodeRef } = useDroppable({ id: group.id });
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onAdd(text);
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <GroupHeader
        name={group.name}
        isDefault={group.isDefault}
        count={group.openCount}
        collapsed={collapsed}
        pending={pending}
        isDropTarget={isOver}
        onToggle={onToggle}
        onRename={onRename}
        onDelete={onDeleteGroup}
      />

      {collapsed ? null : (
        <>
          {group.visible.length === 0 ? (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              Порожньо — додайте нижче або перетягніть сюди товар.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {group.visible.map((row) => (
                <ListRowItem
                  key={row.id}
                  row={row}
                  groups={groups}
                  pending={pending}
                  onCheck={onCheck}
                  onUncheck={onUncheck}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onMove={onMove}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          )}

          {/* Feature 14.1 — add straight into this group, so a thing can be
              written down where it belongs instead of landing in the common
              group and needing a second action to move it. */}
          <div className="flex gap-2 border-t px-3 py-2">
            <Input
              value={draft}
              placeholder={`Додати до «${group.name}»…`}
              className="h-8"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label={`Додати до ${group.name}`}
              disabled={pending || !draft.trim()}
              onClick={submit}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {/* The toggle appears only when there is something to reveal — a
              control that shows nothing is noise. */}
          {group.archived.length > 0 ? (
            <div className="border-t px-3 py-1.5">
              <button
                type="button"
                onClick={onToggleArchived}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {showArchived
                  ? `Сховати архів (${group.archived.length})`
                  : `Показати архів (${group.archived.length})`}
              </button>
            </div>
          ) : null}

          {showArchived && group.archived.length > 0 ? (
            <ul className="divide-y border-t bg-muted/40">
              {group.archived.map((row) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-muted-foreground line-through">
                      {row.label}
                    </div>
                    {row.note ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {row.note}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Повернути ${row.label}`}
                    disabled={pending}
                    onClick={() => onArchive(row.id, false)}
                  >
                    <ArchiveRestore className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Видалити ${row.label}`}
                    disabled={pending}
                    onClick={() => onDelete(row.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
