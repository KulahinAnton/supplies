import { useState } from "react";
import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import { toast } from "sonner";
import { useCollapsedGroups } from "@supplies/ui/use-collapsed-groups";
import { useShownArchived } from "@supplies/ui/use-shown-archived";
import { api } from "../api/client";
import { ErrorNote, Spinner } from "../components/feedback";
import { BuyDialog } from "../components/shopping/buy-dialog";
import { CandidatesCard } from "../components/shopping/candidates-card";
import { GroupSection } from "../components/shopping/group-section";
import { ListToolbar } from "../components/shopping/list-toolbar";
import { QuickAdd } from "../components/shopping/quick-add";
import { RowEditDialog } from "../components/shopping/row-edit-dialog";
import type { ListRow } from "../components/shopping/types";
import { useBuyFlow } from "../hooks/use-buy-flow";
import { useRowDrag } from "../hooks/use-row-drag";
import { useShoppingList } from "../hooks/use-shopping-list";

/**
 * «Покупки» — the counterpart of `apps/web/app/(app)/shopping/page.tsx` plus
 * `components/shopping-list.tsx`, its group header and its row editor.
 *
 * Feature 6 + 11. Everything this file knows is *where things go*: the data,
 * the writes and the grouping are `useShoppingList`, the drag is `useRowDrag`,
 * the stock-in behind «купили» is `useBuyFlow`, and each visible part is its
 * own component under `components/shopping/`.
 */
export function ShoppingRoute() {
  const list = useShoppingList();
  const buy = useBuyFlow(list.invalidate);
  const [editing, setEditing] = useState<ListRow | null>(null);

  // Per-person, per-device — see packages/ui/src/id-set-store.ts.
  const [collapsed, toggleCollapse] = useCollapsedGroups();
  const [shownArchived, toggleArchived] = useShownArchived();

  function move(rowId: string, groupId: string) {
    list.run(() => api.post(`/api/shopping-groups/rows/${rowId}/move`, { groupId }));
  }

  const drag = useRowDrag(list.rows, move);

  function startCheck(row: ListRow) {
    // A one-off like «свічки» has no stock to update, so it never reaches the
    // dialog — the tick is the whole interaction.
    if (!buy.start(row).needsDialog) {
      list.run(() => api.post(`/api/shopping/${row.id}/check`));
    }
  }

  if (list.status === "pending") return <Spinner />;
  if (list.status === "error") return <ErrorNote error={list.error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Покупки</h1>
        <p className="text-sm text-muted-foreground">
          Спільний список. Позначили куплене — воно одразу в запасах.
          Перетягніть товар, щоб перекласти його до іншої групи.
        </p>
      </div>

      <QuickAdd
        pending={list.pending}
        onAdd={(text) => list.run(() => api.post("/api/shopping", { freeText: text }))}
      />

      <CandidatesCard
        candidates={list.candidates}
        pending={list.pending}
        onAdd={(candidate) =>
          list.run(() =>
            api.post(
              "/api/shopping",
              candidate.itemId
                ? { itemId: candidate.itemId }
                : { freeText: candidate.name },
            ),
          )
        }
      />

      <ListToolbar
        openCount={list.openCount}
        checkedCount={list.checkedCount}
        pending={list.pending}
        onArchiveChecked={() =>
          list.run(() => api.post("/api/shopping/archive-checked"))
        }
        onCreateGroup={(name) =>
          list.run(() => api.post("/api/shopping-groups", { name }))
        }
      />

      <DndContext
        id="shopping-list"
        sensors={drag.sensors}
        /*
         * closestCenter, not the default rectIntersection: a row starts inside
         * one group container and rect overlap would keep choosing that same
         * container, so it could never be dragged out of it.
         */
        collisionDetection={closestCenter}
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
        onDragOver={drag.onDragOver}
        onDragCancel={drag.onDragCancel}
      >
        <div className="space-y-3">
          {list.grouped.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              groups={list.groups}
              collapsed={collapsed.has(group.id)}
              showArchived={shownArchived.has(group.id)}
              isOver={drag.overGroup === group.id}
              pending={list.pending}
              onToggle={() => toggleCollapse(group.id)}
              onToggleArchived={() => toggleArchived(group.id)}
              onAdd={(text) =>
                list.run(() =>
                  api.post("/api/shopping", { freeText: text, groupId: group.id }),
                )
              }
              onRename={(name) =>
                list.run(() => api.patch(`/api/shopping-groups/${group.id}`, { name }))
              }
              onDeleteGroup={() =>
                list.run(async () => {
                  await api.del(`/api/shopping-groups/${group.id}`);
                  // No confirmation: nothing is lost, the rows just move back.
                  toast.success("Групу видалено, товари повернулись до загальної");
                })
              }
              onCheck={startCheck}
              onUncheck={(rowId) =>
                list.run(() => api.post(`/api/shopping/${rowId}/uncheck`))
              }
              onArchive={(rowId, archived) =>
                list.run(() => api.post(`/api/shopping/${rowId}/archive`, { archived }))
              }
              onDelete={(rowId) => list.run(() => api.del(`/api/shopping/${rowId}`))}
              onMove={move}
              onEdit={setEditing}
            />
          ))}
        </div>

        {/* Follows the finger, so a drag on a phone is visible above the list. */}
        <DragOverlay>
          {drag.dragging ? (
            <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg">
              {drag.dragging.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <BuyDialog
        row={buy.row}
        quantity={buy.quantity}
        expiresAt={buy.expiresAt}
        error={buy.error}
        pending={buy.saving}
        onQuantity={buy.setQuantity}
        onExpiresAt={buy.setExpiresAt}
        onConfirm={buy.confirm}
        onClose={buy.close}
      />

      <RowEditDialog
        row={editing}
        pending={list.pending}
        onClose={() => setEditing(null)}
        onSave={(payload) =>
          list.run(async () => {
            await api.post(`/api/shopping/${editing?.id ?? ""}/update`, payload);
            toast.success("Збережено");
            setEditing(null);
          })
        }
      />
    </div>
  );
}
