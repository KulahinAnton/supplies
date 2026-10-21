import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import type { NamedItem } from "@supplies/core/duplicates";
import type { ItemDetail } from "@supplies/core/contracts/items";
import type { GroupView, Taxonomy } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { ItemForm } from "@/components/item-form/item-form";
import type { ItemFormValues } from "@/hooks/use-item-save";

/**
 * «Редагувати» — the same form as `items/new`, seeded from the item.
 *
 * It waits for all three requests rather than rendering a form with empty
 * pickers that fill in a moment later; a select that changes what it is
 * showing while somebody is reading it is worse than a spinner.
 */
export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });
  const names = useQuery({
    queryKey: keys.itemNames,
    queryFn: () => api.get<NamedItem[]>("/api/items/names"),
  });
  const existing = useQuery({
    queryKey: keys.item(id ?? ""),
    queryFn: () => api.get<ItemDetail>(`/api/items/${id ?? ""}`),
  });

  if (taxonomy.isPending || existing.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (taxonomy.isError || existing.isError || !taxonomy.data || !existing.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={taxonomy.error ?? existing.error} />
      </Screen>
    );
  }

  const row = existing.data.item;
  const initial: ItemFormValues = {
    name: row.name,
    categoryId: row.categoryId,
    locationId: row.locationId ?? "",
    groupId: row.groupId ?? "",
    unit: row.unit,
    minQty: row.minQty,
    barcode: row.barcode ?? "",
    notes: row.notes ?? "",
    shareToOff: false,
  };

  return (
    <Screen edges={["left", "right"]}>
      <ItemForm
        itemId={row.id}
        initial={initial}
        taxonomy={taxonomy.data}
        itemGroups={groups.data ?? []}
        existingItems={names.data ?? []}
        // §3.2 — the unit is locked once the item has batches.
        hasBatches={row.batches.length > 0}
      />
    </Screen>
  );
}
