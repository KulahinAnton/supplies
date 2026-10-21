import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { defaultRowId } from "@supplies/core/ordering";
import type { NamedItem } from "@supplies/core/duplicates";
import type { GroupView, Taxonomy } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { ItemForm } from "@/components/item-form/item-form";
import type { ItemFormValues } from "@/hooks/use-item-save";

/**
 * «Новий товар».
 *
 * `name` and `barcode` arrive as params when this is reached from a scan that
 * matched nothing — the code is already in hand and retyping it would be the
 * app forgetting what it just read.
 */
export default function NewItemScreen() {
  const { name, barcode } = useLocalSearchParams<{
    name?: string;
    barcode?: string;
  }>();

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });
  // Feature 16.1 — every item name in the household, for the duplicate check.
  const names = useQuery({
    queryKey: keys.itemNames,
    queryFn: () => api.get<NamedItem[]>("/api/items/names"),
  });

  if (taxonomy.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (taxonomy.isError || !taxonomy.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={taxonomy.error} />
      </Screen>
    );
  }

  const initial: ItemFormValues = {
    name: name ?? "",
    // Feature 15.2 — a new item opens on the starred category and location.
    categoryId: defaultRowId(taxonomy.data.categories, true) ?? "",
    locationId: defaultRowId(taxonomy.data.locations, false) ?? "",
    groupId: "",
    unit: "PIECE",
    minQty: "0",
    barcode: barcode ?? "",
    notes: "",
    shareToOff: false,
  };

  return (
    <Screen edges={["left", "right"]}>
      <ItemForm
        initial={initial}
        taxonomy={taxonomy.data}
        itemGroups={groups.data ?? []}
        existingItems={names.data ?? []}
        hasBatches={false}
      />
    </Screen>
  );
}
