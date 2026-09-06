import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronRight,
  CornerUpRight,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { UNIT_SHORT, formatQuantityWithUnit } from "@supplies/core/format";
import {
  DEFAULT_GROUP_ID,
  groupShoppingRows,
  moveTargets,
  type GroupedList,
  type GroupRow,
} from "@supplies/core/shopping-groups";
import type { Unit } from "@supplies/core/units";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { useCollapsedGroups } from "@supplies/ui/use-collapsed-groups";
import { useShownArchived } from "@supplies/ui/use-shown-archived";
import { cn } from "@supplies/ui/utils";
import { api, ApiError } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { ShoppingView } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * «Покупки» — ported from `apps/web/app/(app)/shopping/page.tsx` and
 * `components/shopping-list.tsx`, with its group header and row editor.
 *
 * Feature 6 + 11. Candidates are SUGGESTIONS — nothing is inserted
 * automatically, because a list that fills itself stops being read. Checking a
 * row off is a stock-in: it asks for quantity and expiry and creates the
 * batch, which is what keeps the list and the inventory from diverging.
 *
 * The grouping is `groupShoppingRows` from the engine. Feature 11's
 * «Загальна група» is not a row in the database; it is `groupId = null`, and
 * regrouping by hand here would be a second implementation of a rule whose
 * only interesting case is the one that has no row.
 */

type ListRow = {
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

type Candidate = {
  /**
   * Feature 26 — null for a set. A set is several products, so there is no
   * single item to write down; it goes on the list as free text and the
   * shopper picks a brand in the shop.
   */
  itemId: string | null;
  name: string;
  detail: string;
};

export function ShoppingRoute() {
  const queryClient = useQueryClient();

  const view = useQuery({
    queryKey: keys.shopping,
    queryFn: () => api.get<ShoppingView>("/api/shopping"),
  });

  const [freeText, setFreeText] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [dragging, setDragging] = useState<ListRow | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

  const [buying, setBuying] = useState<ListRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [buyError, setBuyError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ListRow | null>(null);

  // Per-person, per-device — see packages/ui/src/id-set-store.ts.
  const [collapsed, toggleCollapse] = useCollapsedGroups();
  const [shownArchived, toggleArchived] = useShownArchived();

  /**
   * Touch needs a hold-to-drag delay, or every scroll of the list would start
   * a drag. The mouse gets a small distance threshold instead, so a click on
   * the check button is never swallowed. Space picks a row up, arrows move
   * between groups, Space drops it — drag is otherwise unusable without a
   * mouse or a steady finger.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /**
   * Every mutation goes through here so the invalidation is decided once.
   *
   * A shopping write is a stock write: ticking a row creates a batch, so the
   * item's quantity, the dashboard and the nav badges all go stale with it.
   * The Next app gets that from `revalidatePath("/shopping")` plus the layout
   * re-rendering; here it has to be said out loud, which is what
   * `stockWriteInvalidates` is for.
   */
  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.shopping });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (cause) => {
      // The API renders the refusal from the shared catalogue, so this is the
      // same Ukrainian sentence the web app toasts for the same rule.
      toast.error(
        cause instanceof ApiError ? cause.message : "Щось пішло не так. Спробуйте ще раз.",
      );
    },
  });

  const pending = mutation.isPending;
  const run = (work: () => Promise<unknown>) => mutation.mutate(work);

  if (view.isPending) return <Spinner />;
  if (view.isError) return <ErrorNote error={view.error} />;
  if (!view.data) return null;

  const rows: ListRow[] = view.data.rows.map((row) => ({
    id: row.id,
    label: row.item?.name ?? row.freeText ?? "—",
    itemId: row.itemId,
    groupId: row.groupId,
    note: row.note,
    // JSON has no date type, and `groupShoppingRows` splits on this being null.
    archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
    unit: row.item?.unit ?? null,
    isChecked: row.isChecked,
    addedBy: row.addedBy.name,
    checkedBy: row.checkedBy?.name ?? null,
  }));

  const candidates: Candidate[] = view.data.candidates.map((candidate) => ({
    itemId: candidate.itemId,
    name: candidate.name,
    detail:
      candidate.state === "OUT"
        ? "закінчився"
        : `лишилось ${formatQuantityWithUnit(candidate.quantity, candidate.unit)}` +
          ` · мінімум ${formatQuantityWithUnit(candidate.minQty, candidate.unit)}`,
  }));

  const groups: GroupRow[] = view.data.groups;
  const grouped = groupShoppingRows(rows, groups);

  const live = rows.filter((row) => row.archivedAt === null);
  const totalOpen = live.filter((row) => !row.isChecked).length;
  const totalChecked = live.filter((row) => row.isChecked).length;

  function addFreeText() {
    const text = freeText.trim();
    if (!text) return;
    setFreeText("");
    run(() => api.post("/api/shopping", { freeText: text }));
  }

  function addGroup() {
    const name = newGroup.trim();
    if (!name) return;
    setNewGroup("");
    setAddingGroup(false);
    run(() => api.post("/api/shopping-groups", { name }));
  }

  function move(rowId: string, groupId: string) {
    run(() => api.post(`/api/shopping-groups/rows/${rowId}/move`, { groupId }));
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(rows.find((row) => row.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    setOverGroup(null);

    const target = event.over?.id;
    if (!target) return;

    const rowId = String(event.active.id);
    const row = rows.find((r) => r.id === rowId);
    const currentGroup = row?.groupId ?? DEFAULT_GROUP_ID;
    if (String(target) === currentGroup) return;

    move(rowId, String(target));
  }

  function startCheck(row: ListRow) {
    setBuyError(null);
    setQuantity("");
    setExpiresAt("");
    if (!row.itemId) {
      // A one-off like «свічки» has no stock to update.
      run(() => api.post(`/api/shopping/${row.id}/check`));
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
    setBuyError(null);
    try {
      await api.post(`/api/shopping/${buying.id}/check`, {
        rows:
          withStock && quantity.trim()
            ? [{ quantity: quantity.trim(), expiresAt: expiresAt || undefined }]
            : undefined,
      });
      toast.success("Купили");
      setBuying(null);
      void queryClient.invalidateQueries({ queryKey: keys.shopping });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (cause) {
      // Inline, not a toast: the dialog stays open and the message belongs
      // beside the fields that caused it.
      setBuyError(
        cause instanceof ApiError ? cause.message : "Щось пішло не так. Спробуйте ще раз.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Покупки</h1>
        <p className="text-sm text-muted-foreground">
          Спільний список. Позначили куплене — воно одразу в запасах.
          Перетягніть товар, щоб перекласти його до іншої групи.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={freeText}
          placeholder="Дописати щось разове…"
          onChange={(event) => setFreeText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addFreeText();
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
                  key={candidate.itemId ?? `group:${candidate.name}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{candidate.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {candidate.detail}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        api.post(
                          "/api/shopping",
                          candidate.itemId
                            ? { itemId: candidate.itemId }
                            : { freeText: candidate.name },
                        ),
                      )
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
              onClick={() => run(() => api.post("/api/shopping/archive-checked"))}
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
                addGroup();
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
        id="shopping-list"
        sensors={sensors}
        /*
         * closestCenter, not the default rectIntersection: a row starts inside
         * one group container and rect overlap would keep choosing that same
         * container, so it could never be dragged out of it.
         */
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={(event) => setOverGroup(event.over ? String(event.over.id) : null)}
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
              groups={groups}
              collapsed={collapsed.has(group.id)}
              showArchived={shownArchived.has(group.id)}
              isOver={overGroup === group.id}
              pending={pending}
              onToggle={() => toggleCollapse(group.id)}
              onToggleArchived={() => toggleArchived(group.id)}
              onAdd={(text) =>
                run(() => api.post("/api/shopping", { freeText: text, groupId: group.id }))
              }
              onRename={(name) =>
                run(() => api.patch(`/api/shopping-groups/${group.id}`, { name }))
              }
              onDeleteGroup={() =>
                run(async () => {
                  await api.del(`/api/shopping-groups/${group.id}`);
                  // No confirmation: nothing is lost, the rows just move back.
                  toast.success("Групу видалено, товари повернулись до загальної");
                })
              }
              onCheck={startCheck}
              onUncheck={(rowId) => run(() => api.post(`/api/shopping/${rowId}/uncheck`))}
              onArchive={(rowId, archived) =>
                run(() => api.post(`/api/shopping/${rowId}/archive`, { archived }))
              }
              onDelete={(rowId) => run(() => api.del(`/api/shopping/${rowId}`))}
              onMove={move}
              onEdit={setEditing}
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

          {buyError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {buyError}
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

      <RowEditDialog
        row={editing}
        pending={pending}
        onClose={() => setEditing(null)}
        onSave={(payload) =>
          run(async () => {
            await api.post(`/api/shopping/${editing?.id ?? ""}/update`, payload);
            toast.success("Збережено");
            setEditing(null);
          })
        }
      />
    </div>
  );
}

/**
 * One group: a droppable region wrapping its rows, its own add field, and —
 * when it has any — a toggle revealing its archived rows.
 */
function GroupSection({
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

/**
 * Feature 11 — a group heading: collapse toggle, count, and (for named groups)
 * rename/delete. «Загальна група» gets neither, because it is `groupId = null`
 * rather than a row, and nothing should suggest otherwise.
 */
function GroupHeader({
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

function ListRowItem({
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
function RowEditDialog({
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
