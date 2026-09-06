import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Switch } from "@supplies/ui/switch";
import { cn } from "@supplies/ui/utils";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { Household, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

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
 *
 * Phase 2.9 — the Next page also has: adding categories and locations, per
 * category warn-day overrides, drag-to-reorder, household members and
 * invites, the Telegram link, and «Надіслати дайджест». Reading and changing
 * is here; creating is not, yet.
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
  if (household.isError) return <ErrorNote error={household.error} />;
  if (taxonomy.isError) return <ErrorNote error={taxonomy.error} />;
  if (!household.data || !taxonomy.data) return null;

  const settings = household.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Налаштування</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Господарство</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <Row
            label="Попереджати за (днів)"
            hint="Скільки днів наперед вважається «скоро зіпсується»"
          >
            <Input
              type="number"
              min={1}
              max={365}
              defaultValue={settings.expiryWarnDays}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== settings.expiryWarnDays) {
                  saveHousehold.mutate({ expiryWarnDays: value });
                }
              }}
              className="w-20"
            />
          </Row>

          <Row
            label="Година щоденного дайджесту"
            hint="За київським часом — Telegram-бот надсилає підсумок"
          >
            <Input
              type="number"
              min={0}
              max={23}
              defaultValue={settings.digestHour}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (value !== settings.digestHour) {
                  saveHousehold.mutate({ digestHour: value });
                }
              }}
              className="w-20"
            />
          </Row>

          <Row
            label="Помічник зі стравами"
            hint="Feature 32.1 — вимкнено за замовчуванням, бо кожне натискання коштує грошей"
          >
            <Switch
              checked={settings.aiEnabled}
              onCheckedChange={(checked) => saveHousehold.mutate({ aiEnabled: checked })}
            />
          </Row>

          <ErrorNote error={saveHousehold.error} />
        </CardContent>
      </Card>

      <TaxonomySection
        title="Категорії"
        rows={taxonomy.data.categories}
        onRemove={(id) => removeCategory.mutate(id)}
        onStar={(id) => starCategory.mutate(id)}
        error={removeCategory.error ?? starCategory.error}
      />

      <TaxonomySection
        title="Місця зберігання"
        rows={taxonomy.data.locations}
        onRemove={(id) => removeLocation.mutate(id)}
        error={removeLocation.error}
      />
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm">
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {children}
    </label>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {/* The refusal is the interesting case: a row still in use cannot be
            deleted, and saying so is more useful than hiding the button. */}
        <ErrorNote error={error} />
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-sm">
                {row.name}
                {row.isDefault ? (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    за замовчуванням
                  </span>
                ) : null}
              </span>
              <span className="flex gap-1">
                {onStar ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Зробити типовою"
                    onClick={() => onStar(row.id)}
                  >
                    <Star
                      className={cn("size-4", row.isDefault && "fill-current text-primary")}
                    />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Видалити"
                  onClick={() => onRemove(row.id)}
                >
                  <X className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
