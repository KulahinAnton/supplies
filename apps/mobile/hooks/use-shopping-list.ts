import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatQuantityWithUnit } from "@supplies/core/format";
import {
  groupShoppingRows,
  type GroupedList,
  type GroupRow,
} from "@supplies/core/shopping-groups";
import type { Unit } from "@supplies/core/units";
import type { ShoppingView } from "@supplies/core/contracts/shopping";
import { api, ApiError } from "@/lib/api/client";
import { keys, stockWriteInvalidates } from "@/lib/api/keys";

/**
 * «Покупки» — the query, the writes, and the shapes the screen renders.
 *
 * A **sibling** of `apps/spa/src/hooks/use-shopping-list.ts`, not a copy of
 * it, and the difference is one line of substance: the SPA toasts a refusal
 * with `sonner` and this keeps the last one in state for the screen to render.
 * There is no toast library here and adding one for four call sites would be a
 * dependency bought to imitate a browser.
 *
 * The grouping is `groupShoppingRows` from the engine, for both. Feature 11's
 * «Загальна група» is not a row in the database — it is `groupId = null` — and
 * regrouping by hand would be a second implementation of a rule whose only
 * interesting case is the one with no row behind it.
 */
export type ListRow = {
  id: string;
  label: string;
  itemId: string | null;
  groupId: string | null;
  note: string | null;
  archivedAt: Date | null;
  unit: Unit | null;
  isChecked: boolean;
  addedBy: string;
  checkedBy: string | null;
};

export type Candidate = {
  itemId: string | null;
  name: string;
  detail: string;
};

export function useShoppingList() {
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<string | null>(null);

  const view = useQuery({
    queryKey: keys.shopping,
    queryFn: () => api.get<ShoppingView>("/api/shopping"),
  });

  /**
   * A shopping write is a stock write: ticking a row creates a batch, so the
   * item's quantity, the dashboard and the tab badges all go stale with it.
   * The Next app gets that from `revalidatePath("/shopping")` plus the layout
   * re-rendering; here it has to be said out loud.
   */
  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.shopping });
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      setRefusal(null);
      invalidate();
    },
    // The API renders the refusal from the shared catalogue, so this is the
    // same Ukrainian sentence the web app shows for the same rule.
    onError: (cause) =>
      setRefusal(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      ),
  });

  const rows: ListRow[] = (view.data?.rows ?? []).map((row) => ({
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

  const candidates: Candidate[] = (view.data?.candidates ?? []).map((candidate) => ({
    itemId: candidate.itemId,
    name: candidate.name,
    detail:
      candidate.state === "OUT"
        ? "закінчився"
        : `лишилось ${formatQuantityWithUnit(candidate.quantity, candidate.unit)}` +
          ` · мінімум ${formatQuantityWithUnit(candidate.minQty, candidate.unit)}`,
  }));

  const groups: GroupRow[] = view.data?.groups ?? [];
  const live = rows.filter((row) => row.archivedAt === null);
  const grouped: GroupedList<ListRow>[] = view.data
    ? groupShoppingRows(rows, groups)
    : [];

  return {
    status: view.isPending ? "pending" : view.isError ? "error" : "ready",
    error: view.error,
    refusal,
    rows,
    candidates,
    groups,
    grouped,
    openCount: live.filter((row) => !row.isChecked).length,
    checkedCount: live.filter((row) => row.isChecked).length,
    /** True while any write is in flight — every control on the screen disables. */
    pending: mutation.isPending,
    refreshing: view.isRefetching,
    refetch: () => void view.refetch(),
    /** Run a write, invalidate what it made stale, keep the refusal if refused. */
    run: (work: () => Promise<unknown>) => mutation.mutate(work),
    /** The same invalidation, for a caller that handles its own errors. */
    invalidate,
  } as const;
}
