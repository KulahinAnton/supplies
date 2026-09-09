import { useQuery } from "@tanstack/react-query";
import type { Taxonomy } from "@supplies/core/contracts/settings";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { ErrorNote, Spinner } from "@/components/ui/feedback";
import { Screen } from "@/components/ui/screen";
import { TaxonomyList } from "@/components/settings/taxonomy-list";
import { useWrite } from "@/hooks/use-settings-write";

/**
 * Feature 15 + 22 — where things are kept.
 *
 * The same screen as categories minus the expiry window, because a shelf has
 * no opinion about shelf life. A batch may override its item's location
 * (Feature 22), which is why a location's item count is not the whole story
 * and deleting one can still be refused.
 */
export default function LocationsScreen() {
  const { write, refusal, pending } = useWrite();

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });

  if (taxonomy.isPending) {
    return (
      <Screen edges={["left", "right"]}>
        <Spinner />
      </Screen>
    );
  }
  if (!taxonomy.data) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorNote error={taxonomy.error} />
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <TaxonomyList
        rows={taxonomy.data.locations.map((location) => ({
          id: location.id,
          name: location.name,
          itemCount: location._count.items,
          isDefault: location.isDefault,
        }))}
        addPlaceholder="Нове місце"
        defaultHint="Зірочка — місце за замовчуванням для нових товарів."
        pending={pending}
        refusal={refusal}
        onAdd={(name) => void write(() => api.post("/api/settings/locations", { name }))}
        onSave={(row, edits) =>
          void write(() =>
            api.post("/api/settings/locations", { id: row.id, name: edits.name }),
          )
        }
        onSetDefault={(id) =>
          void write(() => api.post(`/api/settings/locations/${id}/default`))
        }
        onDelete={(id) => void write(() => api.del(`/api/settings/locations/${id}`))}
        onReorder={(ids) =>
          void write(() => api.post("/api/settings/locations/reorder", { ids }))
        }
      />
    </Screen>
  );
}
