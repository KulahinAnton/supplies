import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { itemSchema } from "@supplies/core/validation/item";
import { api, ApiError } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import { messageFor, type Values } from "../components/item-form/types";

/**
 * Validating and saving an item, for both «Новий товар» and «Редагувати».
 *
 * The validation runs here as well as on the server, with the SAME schema, so
 * the problem appears next to the field instead of after a round trip — and so
 * this form can never let through something the API will then refuse for
 * reasons the form has no words for.
 *
 * Two error slots, because they are answerable differently: `issue` is what
 * the person can fix in the form right now, and `formError` is what the server
 * refused.
 */
export function useItemSave(itemId?: string) {
  const editing = Boolean(itemId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [issue, setIssue] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>): Promise<{ id?: string }> =>
      editing
        ? api.patch<{ id?: string }>(`/api/items/${itemId ?? ""}`, {
            ...payload,
            id: itemId,
          })
        : api.post<{ id?: string }>("/api/items", payload),
    onSuccess: (result) => {
      // A new item can create nothing, but an edited one can move between
      // categories and sets, so both lists go stale either way.
      void queryClient.invalidateQueries({ queryKey: keys.taxonomy });
      void queryClient.invalidateQueries({ queryKey: keys.itemNames });
      void queryClient.invalidateQueries({ queryKey: keys.groups });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(editing ? "Збережено" : "Товар додано");
      void navigate(`/items/${editing ? (itemId ?? "") : (result.id ?? "")}`);
    },
    onError: (cause) => {
      setFormError(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
    },
  });

  function submit(values: Values) {
    setIssue(null);
    setFormError(null);

    const payload = {
      name: values.name,
      categoryId: values.categoryId,
      locationId: values.locationId || undefined,
      groupId: values.groupId || undefined,
      unit: values.unit,
      minQty: values.minQty,
      barcode: values.barcode.trim() || undefined,
      notes: values.notes.trim() || undefined,
      shareToOff: values.shareToOff,
    };

    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) {
      setIssue(messageFor(parsed.error.issues[0]?.message) ?? null);
      return;
    }
    save.mutate(payload);
  }

  return { submit, issue, formError, saving: save.isPending };
}
