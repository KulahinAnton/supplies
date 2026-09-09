import { useQuery } from "@tanstack/react-query";
import type { Household, Taxonomy } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { TaxonomyList } from "@/components/settings/taxonomy-list";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Feature 13 + 15 — categories: order, a starred default for new items, and
 * the one thing locations do not have, a per-category expiry window.
 */
export default function CategoriesScreen() {
  const { write, refusal, pending } = useWrite();

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });

  if (taxonomy.isPending || household.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (!taxonomy.data || !household.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={taxonomy.error ?? household.error} />
      </Screen>
    );
  }

  const warnDays = household.data.expiryWarnDays;

  return (
    <Screen edges={["left", "right"]}>
      <TaxonomyList
        rows={taxonomy.data.categories.map((category) => ({
          id: category.id,
          name: category.name,
          itemCount: category._count.items,
          isDefault: category.isDefault,
          warnDays: category.expiryWarnDays,
        }))}
        addPlaceholder="Нова категорія"
        defaultHint={`Зірочка — категорія за замовчуванням для нових товарів. Порожнє поле днів означає «як усюди», тобто за ${warnDays} дн. — вкажіть своє число, щоб, наприклад, про ліки нагадувало за два тижні.`}
        warnDaysPlaceholder={warnDays}
        pending={pending}
        refusal={refusal}
        onAdd={(name) => void write(() => api.post("/api/settings/categories", { name }))}
        onSave={(row, edits) =>
          void write(() =>
            api.post("/api/settings/categories", {
              id: row.id,
              name: edits.name,
              // Empty means "inherit", which the API reads as an absent field
              // rather than as zero — zero would mean "warn on the day".
              expiryWarnDays: edits.warnDays === "" ? undefined : edits.warnDays,
            }),
          )
        }
        onSetDefault={(id) =>
          void write(() => api.post(`/api/settings/categories/${id}/default`))
        }
        onDelete={(id) => void write(() => api.del(`/api/settings/categories/${id}`))}
        onReorder={(ids) =>
          void write(() => api.post("/api/settings/categories/reorder", { ids }))
        }
      />
    </Screen>
  );
}
