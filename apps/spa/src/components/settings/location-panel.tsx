import { SettingsListPanel } from "@supplies/ui/settings-list-panel";
import { api } from "../../api/client";
import type { Taxonomy } from "../../api/types";
import { useWrite } from "../../hooks/use-settings-write";

/** Feature 15 — identical to categories minus the expiry window. */
export function LocationPanel({ locations }: { locations: Taxonomy["locations"] }) {
  const { write } = useWrite();

  return (
    <SettingsListPanel
      title="Місця зберігання"
      dndId="settings-locations"
      rows={locations.map((location) => ({
        id: location.id,
        name: location.name,
        itemCount: location._count.items,
        isDefault: location.isDefault,
      }))}
      addPlaceholder="Нове місце"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — місце за замовчуванням для нових товарів."
      onReorder={(ids) => write(() => api.post("/api/settings/locations/reorder", { ids }))}
      onSetDefault={(id) => write(() => api.post(`/api/settings/locations/${id}/default`))}
      onDelete={(id) => write(() => api.del(`/api/settings/locations/${id}`))}
      onAdd={(name) => write(() => api.post("/api/settings/locations", { name }))}
    />
  );
}
