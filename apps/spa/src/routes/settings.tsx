import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { Household, Taxonomy } from "../api/types";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";

/**
 * «Налаштування».
 *
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA, not
 * constants. The engine takes them as input, so changing the warn window here
 * changes what «Скоро зіпсується» means everywhere at once: this page, the
 * dashboard, the Telegram digest and the phone.
 *
 * Deletes are expected to be refused sometimes, and that is the interesting
 * part rather than an inconvenience. A category with items in it cannot go,
 * because the items would silently lose it — so the refusal is shown as an
 * explanation, not as a failure.
 */
export function SettingsRoute() {
  const queryClient = useQueryClient();

  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });
  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });

  const saveHousehold = useMutation({
    mutationFn: (patch: Partial<Household>) =>
      api.patch("/api/settings/household", patch),
    onSuccess: () => {
      // The warn window changes what every expiry badge says, so this is not
      // just the settings page going stale.
      void queryClient.invalidateQueries({ queryKey: keys.household });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.attention });
      void queryClient.invalidateQueries({ queryKey: keys.items() });
    },
  });

  const removeCategory = useMutation({
    mutationFn: (id: string) => api.del(`/api/settings/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.taxonomy }),
  });

  const removeLocation = useMutation({
    mutationFn: (id: string) => api.del(`/api/settings/locations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.taxonomy }),
  });

  const starCategory = useMutation({
    mutationFn: (id: string) => api.post(`/api/settings/categories/${id}/default`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.taxonomy }),
  });

  if (household.isPending || taxonomy.isPending) return <Spinner />;
  if (!household.data || !taxonomy.data) return null;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Господарство</h2>
        <Card className="space-y-3">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Попереджати за (днів)
              <span className="block text-xs text-neutral-500">
                Скільки днів наперед вважається «скоро зіпсується»
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={365}
              defaultValue={household.data.expiryWarnDays}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== household.data?.expiryWarnDays) {
                  saveHousehold.mutate({ expiryWarnDays: value });
                }
              }}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Година щоденного дайджесту
              <span className="block text-xs text-neutral-500">
                За київським часом — Telegram-бот надсилає підсумок
              </span>
            </span>
            <input
              type="number"
              min={0}
              max={23}
              defaultValue={household.data.digestHour}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== household.data?.digestHour) {
                  saveHousehold.mutate({ digestHour: value });
                }
              }}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">
              Помічник зі стравами
              <span className="block text-xs text-neutral-500">
                Feature 32.1 — вимкнено за замовчуванням, бо кожне натискання
                коштує грошей
              </span>
            </span>
            <input
              type="checkbox"
              checked={household.data.aiEnabled}
              onChange={(e) => saveHousehold.mutate({ aiEnabled: e.target.checked })}
              className="size-4"
            />
          </label>

          <ErrorNote error={saveHousehold.error} />
        </Card>
      </section>

      <TaxonomySection
        title="Категорії"
        rows={taxonomy.data.categories.map((c) => ({
          id: c.id,
          name: c.name,
          isDefault: c.isDefault,
        }))}
        onRemove={(id) => removeCategory.mutate(id)}
        onStar={(id) => starCategory.mutate(id)}
        error={removeCategory.error ?? starCategory.error}
      />

      <TaxonomySection
        title="Місця зберігання"
        rows={taxonomy.data.locations.map((l) => ({
          id: l.id,
          name: l.name,
          isDefault: l.isDefault,
        }))}
        onRemove={(id) => removeLocation.mutate(id)}
        error={removeLocation.error}
      />
    </div>
  );
}

function TaxonomySection({
  title,
  rows,
  onRemove,
  onStar,
  error,
}: {
  title: string;
  rows: { id: string; name: string; isDefault: boolean }[];
  onRemove: (id: string) => void;
  onStar?: (id: string) => void;
  error: unknown;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {/* The refusal is the interesting case: a row still in use cannot be
          deleted, and saying so is more useful than hiding the button. */}
      <ErrorNote error={error} />
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                {row.name}
                {row.isDefault ? (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                    за замовчуванням
                  </span>
                ) : null}
              </span>
              <span className="flex gap-1">
                {onStar ? (
                  <Button variant="ghost" onClick={() => onStar(row.id)}>
                    ★
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => onRemove(row.id)}>
                  ✕
                </Button>
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
