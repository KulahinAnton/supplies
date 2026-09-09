import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { itemSchema } from "@supplies/core/validation/item";
import { UNIT_PLURAL } from "@supplies/core/format";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import type { Unit } from "@supplies/core/units";
import { api, ApiError } from "@/lib/api/client";
import { keys, stockWriteInvalidates } from "@/lib/api/keys";

export type ItemFormValues = {
  name: string;
  categoryId: string;
  locationId: string;
  groupId: string;
  unit: Unit;
  minQty: string;
  barcode: string;
  notes: string;
  shareToOff: boolean;
};

export const UNIT_OPTIONS: { value: Unit; label: string }[] = (
  Object.keys(UNIT_PLURAL) as Unit[]
).map((unit) => ({ value: unit, label: UNIT_PLURAL[unit].many }));

/** Zod messages are keys (§8) — the form is the place that renders them. */
export function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

/**
 * Validating and saving an item, for both «Новий товар» and «Редагувати».
 *
 * The validation runs here as well as on the server, with the **same schema**,
 * so the problem appears next to the field instead of after a round trip — and
 * so this form can never let through something the API will then refuse for
 * reasons the form has no words for.
 *
 * Two error slots, because they are answerable differently: `issue` is what
 * the person can fix in the form right now, and `formError` is what the server
 * refused. The SPA's hook of the same name draws the same line; what differs
 * is only that a success navigates with `router.replace` instead of a toast —
 * on a phone the form was pushed over the item, and going Back to a form you
 * have just saved is nobody's intent.
 */
export function useItemSave(itemId?: string) {
  const editing = Boolean(itemId);
  const router = useRouter();
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
      const id = editing ? (itemId ?? "") : (result.id ?? "");
      router.replace({ pathname: "/items/[id]", params: { id } });
    },
    onError: (cause) => {
      setFormError(
        cause instanceof ApiError
          ? cause.message
          : "Щось пішло не так. Спробуйте ще раз.",
      );
    },
  });

  function submit(values: ItemFormValues) {
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
