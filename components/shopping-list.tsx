"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Archive,
  ArchiveRestore,
  Check,
  CornerUpRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingGroupHeader } from "@/components/shopping-group-header";
import { ShoppingRowEditDialog } from "@/components/shopping-row-edit";
import {
  addListRowAction,
  checkListRowAction,
  archiveCheckedRowsAction,
  setListRowArchivedAction,
  deleteListRowAction,
  uncheckListRowAction,
} from "@/lib/actions/shopping";
import {
  createShoppingGroupAction,
  moveListRowToGroupAction,
} from "@/lib/actions/shopping-groups";
import {
  DEFAULT_GROUP_ID,
  groupShoppingRows,
  moveTargets,
  type GroupedList,
  type GroupRow,
} from "@/lib/shopping-groups";
import { renderMessage } from "@/lib/messages";
import { UNIT_SHORT } from "@/lib/format";
import { useCollapsedGroups } from "@/hooks/use-collapsed-groups";
import { useShownArchived } from "@/hooks/use-shown-archived";
import { cn } from "@/lib/utils";
import type { Unit } from "@/lib/generated/prisma/enums";

export type ListRow = {
  id: string;
  label: string;
  itemId: string | null;
  groupId: string | null;
  note: string | null;
  /** Feature 14.2 — null means visible in its group. */
  archivedAt: Date | null;
  unit: Unit | null;
  isChecked: boolean;
  addedBy: string;
  checkedBy: string | null;
};

export type Candidate = {
  itemId: string;
  name: string;
  state: "OUT" | "LOW";
  detail: string;
};

/**
 * Feature 6 + 11. Candidates are SUGGESTIONS — nothing is inserted
 * automatically, because a list that fills itself stops being read.
 *
 * Checking a row off is a stock-in: it asks for quantity and expiry and creates
 * the batch, which is what keeps the list and the inventory from diverging.
 */
export function ShoppingList({
  rows,
  candidates,
  groups,
}: {
  rows: ListRow[];
  candidates: Candidate[];
  groups: GroupRow[];
}) {
  const router = useRouter();
  const [freeText, setFreeText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState<ListRow | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

  const [buying, setBuying] = useState<ListRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Per-person, per-device — see hooks/use-collapsed-groups.ts.
  const [collapsed, toggleCollapse] = useCollapsedGroups();
  const [shownArchived, toggleArchived] = useShownArchived();

  // Touch needs a hold-to-drag delay, or every scroll of the list would start
  // a drag. The mouse gets a small distance threshold instead, so a click on
  // the check button is never swallowed.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    // Space picks a row up, arrows move between groups, Space drops it. Drag
    // is otherwise unusable without a mouse or a steady finger.
    useSensor(KeyboardSensor),
  );

  const grouped = groupShoppingRows(rows, groups);

  async function run(work: () => Promise<{ ok: boolean; error?: unknown }>) {
    setPending(true);
    const result = (await work()) as
      | { ok: true }
      | { ok: false; error: Parameters<typeof renderMessage>[0] };
    setPending(false);
    if (!result.ok) {
      toast.error(renderMessage(result.error));
      return false;
    }
    router.refresh();
    return true;
  }

  async function addFreeText() {
    if (!freeText.trim()) return;
    const ok = await run(() => addListRowAction({ freeText }));
    if (ok) setFreeText("");
  }

  async function addGroup() {
    if (!newGroup.trim()) return;
    const ok = await run(() => createShoppingGroupAction(newGroup));
    if (ok) {
      setNewGroup("");
      setAddingGroup(false);
    }
  }

  function onDragStart(event: DragStartEvent) {
    const row = rows.find((r) => r.id === event.active.id);
    setDragging(row ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    setOverGroup(null);

    const target = event.over?.id;
    if (!target) return;

    const rowId = String(event.active.id);
    const row = rows.find((r) => r.id === rowId);
    const currentGroup = row?.groupId ?? DEFAULT_GROUP_ID;
    if (String(target) === currentGroup) return;

    await run(() => moveListRowToGroupAction(rowId, String(target)));
  }

  function startCheck(row: ListRow) {
    setError(null);
    setQuantity("");
    setExpiresAt("");
    if (!row.itemId) {
      // A one-off like "свічки" has no stock to update.
      void run(() => checkListRowAction({ rowId: row.id }));
      return;
    }
    setBuying(row);
  }

  /**
   * `withStock: false` checks the row off without touching the inventory.
   * Passed as an argument rather than by clearing `quantity` first — a
   * setState would not have applied by the time this runs.
   */
  async function confirmBuy(withStock = true) {
    if (!buying) return;
    setError(null);
    setPending(true);
    const result = await checkListRowAction({
      rowId: buying.id,
      rows:
        withStock && quantity.trim()
          ? [{ quantity: quantity.trim(), expiresAt: expiresAt || undefined }]
          : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(renderMessage(result.error));
      return;
    }
    toast.success("Купили");
    setBuying(null);
    router.refresh();
  }

  const live = rows.filter((row) => row.archivedAt === null);
  const totalOpen = live.filter((row) => !row.isChecked).length;
  const totalChecked = live.filter((row) => row.isChecked).length;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={freeText}
          placeholder="Дописати щось разове…"
          onChange={(event) => setFreeText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addFreeText();
            }
          }}
        />
        <Button onClick={addFreeText} disabled={pending || !freeText.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>

      {candidates.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Схоже, треба купити</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {candidates.map((candidate) => (
                <li
                  key={candidate.itemId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {candidate.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {candidate.detail}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => addListRowAction({ itemId: candidate.itemId }))
                    }
                  >
                    <Plus className="size-3.5" />
                    Додати
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Купити ({totalOpen})
        </h2>
        <div className="flex items-center gap-1">
          {totalChecked > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => archiveCheckedRowsAction())}
            >
              <Archive className="size-3.5" />
              Прибрати куплені
            </Button>
          ) : null}
          {addingGroup ? null : (
            <Button size="sm" variant="ghost" onClick={() => setAddingGroup(true)}>
              <Plus className="size-3.5" />
              Група
            </Button>
          )}
        </div>
      </div>

      {addingGroup ? (
        <div className="flex gap-2">
          <Input
            value={newGroup}
            autoFocus
            maxLength={40}
            placeholder="Назва групи, напр. «Сільпо» або «Аптека»"
            onChange={(event) => setNewGroup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addGroup();
              }
              if (event.key === "Escape") setAddingGroup(false);
            }}
          />
          <Button onClick={addGroup} disabled={pending || !newGroup.trim()}>
            Створити
          </Button>
          <Button variant="ghost" onClick={() => setAddingGroup(false)}>
            Скасувати
          </Button>
        </div>
      ) : null}

      <DndContext
        // Explicit id, or dnd-kit derives its `aria-describedby` values from a
        // counter that starts fresh in each environment — the server renders
        // "DndDescribedBy-1" and the client "DndDescribedBy-0", which React
        // reports as a hydration mismatch.
        id="shopping-list"
        sensors={sensors}
        // closestCenter, not the default rectIntersection: a row starts inside
        // one group container and rect overlap would keep choosing that same
        // container, so it could never be dragged out of it.
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={(event) =>
          setOverGroup(event.over ? String(event.over.id) : null)
        }
        onDragCancel={() => {
          setDragging(null);
          setOverGroup(null);
        }}
      >
        <div className="space-y-3">
          {grouped.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              collapsed={collapsed.has(group.id)}
              showArchived={shownArchived.has(group.id)}
              isOver={overGroup === group.id}
              onToggle={() => toggleCollapse(group.id)}
              onToggleArchived={() => toggleArchived(group.id)}
              groups={groups}
              pending={pending}
              onAdd={(text) =>
                run(() => addListRowAction({ freeText: text, groupId: group.id }))
              }
              onCheck={startCheck}
              onUncheck={(rowId) => run(() => uncheckListRowAction(rowId))}
              onArchive={(rowId, archived) =>
                run(() => setListRowArchivedAction(rowId, archived))
              }
              onDelete={(rowId) => run(() => deleteListRowAction(rowId))}
              onMove={(rowId, target) =>
                run(() => moveListRowToGroupAction(rowId, target))
              }
            />
          ))}
        </div>

        {/* Follows the finger, so a drag on a phone is visible above the list. */}
        <DragOverlay>
          {dragging ? (
            <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg">
              {dragging.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={buying !== null} onOpenChange={(next) => !next && setBuying(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{buying?.label}</DialogTitle>
            <DialogDescription>
              Скільки купили і до якої дати придатне? Одразу додамо до запасів.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="buy-qty">
                Кількість {buying?.unit ? `(${UNIT_SHORT[buying.unit]})` : ""}
              </Label>
              <Input
                id="buy-qty"
                inputMode="decimal"
                value={quantity}
                autoFocus
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buy-exp">Придатне до</Label>
              <Input
                id="buy-exp"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void confirmBuy(true)}
              disabled={pending}
            >
              Купили
            </Button>
            <Button
              variant="ghost"
              onClick={() => void confirmBuy(false)}
              disabled={pending}
            >
              Без запасу
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One group: a droppable region wrapping its rows, its own add field, and
 *  — when it has any — a toggle revealing its archived rows. */
function GroupSection({
  group,
  collapsed,
  showArchived,
  isOver,
  onToggle,
  onToggleArchived,
  groups,
  pending,
  onAdd,
  onCheck,
  onUncheck,
  onArchive,
  onDelete,
  onMove,
}: {
  group: GroupedList<ListRow>;
  collapsed: boolean;
  showArchived: boolean;
  isOver: boolean;
  onToggle: () => void;
  onToggleArchived: () => void;
  groups: GroupRow[];
  pending: boolean;
  onAdd: (text: string) => Promise<boolean> | void;
  onCheck: (row: ListRow) => void;
  onUncheck: (rowId: string) => void;
  onArchive: (rowId: string, archived: boolean) => void;
  onDelete: (rowId: string) => void;
  onMove: (rowId: string, target: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: group.id });
  const [draft, setDraft] = useState("");

  async function submit() {
    if (!draft.trim()) return;
    const ok = await onAdd(draft);
    if (ok !== false) setDraft("");
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <ShoppingGroupHeader
        groupId={group.id}
        name={group.name}
        isDefault={group.isDefault}
        count={group.openCount}
        collapsed={collapsed}
        onToggle={onToggle}
        isDropTarget={isOver}
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
                  void submit();
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
                <li
                  key={row.id}
                  className="flex items-center gap-2 px-3 py-2"
                >
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

function ListRowItem({
  row,
  groups,
  pending,
  onCheck,
  onUncheck,
  onArchive,
  onDelete,
  onMove,
}: {
  row: ListRow;
  groups: GroupRow[];
  pending: boolean;
  onCheck: (row: ListRow) => void;
  onUncheck: (rowId: string) => void;
  onArchive: (rowId: string, archived: boolean) => void;
  onDelete: (rowId: string) => void;
  onMove: (rowId: string, target: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
  });
  const [editing, setEditing] = useState(false);

  const targets = moveTargets(row.groupId, groups);

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5",
        isDragging && "opacity-40",
      )}
    >
      {/*
        Only the handle starts a drag — dragging from anywhere on the row would
        make the list impossible to scroll on a phone.
      */}
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
        {row.isChecked ? (
          <Undo2 className="size-4" />
        ) : (
          <Check className="size-4" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        {/* §14.2 — a bought row stays where it is, struck through, rather
            than jumping to another part of the page under your thumb. */}
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
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
      </Button>

      <ShoppingRowEditDialog
        row={row}
        open={editing}
        onOpenChange={setEditing}
      />

      {/*
        The non-drag route. Drag is fiddly on a small screen and unusable with
        a keyboard or screen reader, so moving is always possible without it.
      */}
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
