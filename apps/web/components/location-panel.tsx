"use client";

import { SettingsListPanel, type SettingsRow } from "@supplies/ui/settings-list-panel";
import { useActionRunner } from "@/lib/use-action-runner";
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
  const run = useActionRunner();

  return (
    <SettingsListPanel
      title="Місця зберігання"
      dndId="settings-locations"
      rows={rows}
      addPlaceholder="Нове місце"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — місце за замовчуванням для нових товарів."
      onReorder={(ids) => run(() => reorderLocationsAction(ids))}
      onSetDefault={(id) => run(() => setDefaultLocationAction(id))}
      onDelete={(id) => run(() => deleteLocationAction(id))}
      onAdd={(name) => run(() => saveLocationAction({ name }))}
    />
  );
}
