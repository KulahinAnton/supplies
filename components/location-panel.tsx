"use client";

import {
  SettingsListPanel,
  type SettingsRow,
} from "@/components/settings-list-panel";
import {
  deleteLocationAction,
  reorderLocationsAction,
  saveLocationAction,
  setDefaultLocationAction,
} from "@/lib/actions/settings";

/**
 * Feature 15 — storage locations. Identical behaviour to categories minus the
 * expiry window, so it is the shared panel with nothing added.
 */
export function LocationPanel({ rows }: { rows: SettingsRow[] }) {
  return (
    <SettingsListPanel
      title="Місця зберігання"
      dndId="settings-locations"
      rows={rows}
      addPlaceholder="Нове місце"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — місце за замовчуванням для нових товарів."
      onReorder={reorderLocationsAction}
      onSetDefault={setDefaultLocationAction}
      onDelete={deleteLocationAction}
      onAdd={(name) => saveLocationAction({ name })}
    />
  );
}
