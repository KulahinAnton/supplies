import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatQuantityWithUnit } from "@supplies/core/format";
import {
  groupShoppingRows,
  type GroupedList,
  type GroupRow,
} from "@supplies/core/shopping-groups";
import { api, ApiError } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { ShoppingView } from "../api/types";
import type { Candidate, ListRow } from "../components/shopping/types";

/**
 * «Покупки» — the query, the writes, and the shapes the screen renders.
 *
 * Extracted from `routes/shopping.tsx`, which held all of this in a 444-line
 * component alongside nine `useState`s and the markup. Nothing here decides
 * how anything looks; everything here decides what is true.
 *
 * The grouping is `groupShoppingRows` from the engine. Feature 11's
 * «Загальна група» is not a row in the database — it is `groupId = null` — and
 * regrouping by hand would be a second implementation of a rule whose only
 * interesting case is the one that has no row.
 */
export type ShoppingList = {
  status: "pending" | "error" | "ready";
  error: unknown;
  rows: ListRow[];
  candidates: Candidate[];
  groups: GroupRow[];
  grouped: GroupedList<ListRow>[];
  openCount: number;
  checkedCount: number;
  /** True while any write is in flight — every button on the screen disables. */
  pending: boolean;
  /** Run a write, invalidate what it made stale, toast the refusal if refused. */
  run: (work: () => Promise<unknown>) => void;
  /** The same invalidation, for a caller that handles its own errors. */
  invalidate: () => void;
};

export function useShoppingList(): ShoppingList {
  const queryClient = useQueryClient();

  const view = useQuery({
    queryKey: keys.shopping,
    queryFn: () => api.get<ShoppingView>("/api/shopping"),
  });

  /**
   * A shopping write is a stock write: ticking a row creates a batch, so the
   * item's quantity, the dashboard and the nav badges all go stale with it.
   * The Next app gets that from `revalidatePath("/shopping")` plus the layout
   * re-rendering; here it has to be said out loud, which is what
   * `stockWriteInvalidates` is for.
   */
  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.shopping });
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: invalidate,
    onError: (cause) => {
      // The API renders the refusal from the shared catalogue, so this is the
      // same Ukrainian sentence the web app toasts for the same rule.
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
    },
  });

  const shared = {
    pending: mutation.isPending,
    run: (work: () => Promise<unknown>) => mutation.mutate(work),
    invalidate,
  };

  if (view.isPending) {
    return { ...shared, ...EMPTY, status: "pending", error: null };
  }
  if (view.isError || !view.data) {
    return { ...shared, ...EMPTY, status: "error", error: view.error };
  }

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

  const live = rows.filter((row) => row.archivedAt === null);

  return {
    ...shared,
    status: "ready",
    error: null,
    rows,
    candidates,
    groups: view.data.groups,
    grouped: groupShoppingRows(rows, view.data.groups),
    openCount: live.filter((row) => !row.isChecked).length,
    checkedCount: live.filter((row) => row.isChecked).length,
  };
}

/** What the loading and error returns carry, so callers need no null checks. */
const EMPTY = {
  rows: [] as ListRow[],
  candidates: [] as Candidate[],
  groups: [] as GroupRow[],
  grouped: [] as GroupedList<ListRow>[],
  openCount: 0,
  checkedCount: 0,
};
