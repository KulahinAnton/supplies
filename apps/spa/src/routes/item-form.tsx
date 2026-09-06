import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { UNITS, type Unit } from "@supplies/core/units";
import { itemSchema } from "@supplies/core/validation/item";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { ItemDetail, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * Create and edit, one form.
 *
 * It validates with `itemSchema` from `@supplies/core/validation/item` — the
 * same object the Next app's form resolves against and the same one the API
 * validates the request with. That is worth more than the typing it saves: the
 * client and the server cannot disagree about what a valid item is, so this
 * form can never let through something the API will then refuse for reasons
 * the form has no words for.
 *
 * Its errors are message KEYS, not sentences, which is why they render through
 * `MESSAGES` rather than being printed.
 */
const UNIT_LABELS: Record<Unit, string> = {
  PIECE: "шт.",
  PACK: "упак.",
  GRAM: "г",
  KILOGRAM: "кг",
  MILLILITRE: "мл",
  LITRE: "л",
};

/**
 * A plain `<select>`, not the `Select` primitive.
 *
 * The Next form uses shadcn's, and matching it is on the Phase 2.9 list — but
 * `select` was one of the twelve primitives deleted when `packages/ui` was
 * extracted, and re-adding it belongs in the commit that actually aligns this
 * screen rather than in the one that moves the files. Styled with the same
 * tokens meanwhile, so it does not look like a different app.
 */
const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

type FormState = {
  name: string;
  categoryId: string;
  locationId: string;
  unit: Unit;
  minQty: string;
  barcode: string;
  notes: string;
};

/**
 * Loads, then hands the form its starting values as props.
 *
 * The obvious shape — one component with `useState` and an effect that
 * copies the loaded item into it — is what React's
 * `react-hooks/set-state-in-effect` rule exists to stop, and it was right to:
 * that renders once with empty fields, once more with real ones, and needs a
 * guard so the copy does not clobber what the person has typed. Waiting for
 * the data and seeding state lazily has none of those problems.
 */
export function ItemFormRoute() {
  const { id } = useParams();
  const editing = Boolean(id);

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });

  const existing = useQuery({
    queryKey: keys.item(id ?? ""),
    queryFn: () => api.get<ItemDetail>(`/api/items/${id ?? ""}`),
    enabled: editing,
  });

  if (taxonomy.isPending || (editing && existing.isPending)) return <Spinner />;
  if (taxonomy.isError) return <ErrorNote error={taxonomy.error} />;
  if (editing && existing.isError) return <ErrorNote error={existing.error} />;
  if (!taxonomy.data) return null;

  const row = existing.data?.item;
  // Feature 15.2 — the starred category and location are pre-selected.
  const category =
    taxonomy.data.categories.find((c) => c.isDefault) ?? taxonomy.data.categories[0];
  const location = taxonomy.data.locations.find((l) => l.isDefault);

  const initial: FormState = row
    ? {
        name: row.name,
        categoryId: row.category.id,
        locationId: row.location?.id ?? "",
        unit: row.unit,
        minQty: row.minQty,
        barcode: row.barcode ?? "",
        notes: row.notes ?? "",
      }
    : {
        name: "",
        categoryId: category?.id ?? "",
        locationId: location?.id ?? "",
        unit: "PIECE",
        minQty: "0",
        barcode: "",
        notes: "",
      };

  return (
    <ItemForm
      // §3.2 — locked once the item has batches, because changing it would
      // silently reinterpret every quantity already recorded.
      unitLocked={(row?.batches.length ?? 0) > 0}
      itemId={id}
      initial={initial}
      taxonomy={taxonomy.data}
    />
  );
}

function ItemForm({
  itemId,
  initial,
  taxonomy,
  unitLocked,
}: {
  itemId?: string;
  initial: FormState;
  taxonomy: Taxonomy;
  unitLocked: boolean;
}) {
  const editing = Boolean(itemId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [issue, setIssue] = useState<MessageKey | null>(null);

  const save = useMutation({
    /**
     * Create answers with the new id, update answers `{ ok: true }`. Narrowed
     * to one shape here so `onSuccess` has something to navigate from rather
     * than a union it has to re-discriminate.
     */
    mutationFn: (payload: Record<string, unknown>): Promise<{ id?: string }> =>
      editing
        ? api.patch<{ id?: string }>(`/api/items/${itemId ?? ""}`, {
            ...payload,
            id: itemId,
          })
        : api.post<{ id?: string }>("/api/items", payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.taxonomy });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void navigate(`/items/${editing ? (itemId ?? "") : (result.id ?? "")}`);
    },
  });

  function submit() {
    setIssue(null);
    const payload = {
      ...form,
      locationId: form.locationId || undefined,
      barcode: form.barcode.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    // Checked here as well as on the server, with the same schema, so the
    // problem appears next to the field instead of after a round trip.
    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message as MessageKey);
      return;
    }
    save.mutate(payload);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {editing ? "Редагувати товар" : "Новий товар"}
      </h1>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Назва</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Категорія</Label>
            <select
              id="category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className={SELECT_CLASS}
            >
              {taxonomy.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Місце зберігання</Label>
            <select
              id="location"
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">—</option>
              {taxonomy.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unit">Одиниця</Label>
              {/* §3.2 — locked once the item has batches, because changing it
                  would silently reinterpret every quantity already recorded.
                  The API refuses it; disabling it here means nobody is invited
                  to make a change that cannot be saved. */}
              <select
                id="unit"
                value={form.unit}
                disabled={unitLocked}
                onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}
                className={SELECT_CLASS}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minQty">Мінімум (0 — не нагадувати)</Label>
              <Input
                id="minQty"
                inputMode="decimal"
                value={form.minQty}
                onChange={(e) => setForm({ ...form, minQty: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="barcode">Штрихкод</Label>
            <Input
              id="barcode"
              inputMode="numeric"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </div>

          {issue ? <p className="text-sm text-destructive">{MESSAGES[issue]}</p> : null}
          <ErrorNote error={save.error} />

          <div className="flex gap-2">
            <Button onClick={submit} disabled={save.isPending}>
              Зберегти
            </Button>
            <Button variant="outline" onClick={() => void navigate(-1)}>
              Скасувати
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
