import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "../api/client";
import type { ListRow } from "../components/shopping/types";

/**
 * Feature 6 — the dialog behind «купили», and the one write that does not go
 * through `useShoppingList.run`.
 *
 * It handles its own errors on purpose: a shortfall or a bad quantity has to
 * appear *inside* the dialog beside the field that caused it, and the shared
 * runner toasts. The invalidation is still the shared one, passed in, so there
 * is no second answer to "what did this write make stale".
 */
export function useBuyFlow(invalidate: () => void) {
  const [row, setRow] = useState<ListRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * A row that names no item — a one-off like «свічки» — has no stock to
   * update, so there is nothing to ask and the dialog never opens. Returning
   * the work rather than running it keeps this hook free of the query client.
   */
  function start(next: ListRow): { needsDialog: boolean } {
    setError(null);
    setQuantity("");
    setExpiresAt("");
    if (!next.itemId) return { needsDialog: false };
    setRow(next);
    return { needsDialog: true };
  }

  /**
   * `withStock: false` checks the row off without touching the inventory.
   * Passed as an argument rather than by clearing `quantity` first — a
   * setState would not have applied by the time this runs.
   */
  async function confirm(withStock: boolean) {
    if (!row) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/shopping/${row.id}/check`, {
        rows:
          withStock && quantity.trim()
            ? [{ quantity: quantity.trim(), expiresAt: expiresAt || undefined }]
            : undefined,
      });
      toast.success("Купили");
      setRow(null);
      invalidate();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    row,
    quantity,
    expiresAt,
    error,
    saving,
    setQuantity,
    setExpiresAt,
    start,
    confirm: (withStock: boolean) => void confirm(withStock),
    close: () => setRow(null),
  };
}
