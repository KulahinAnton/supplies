import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { findSimilar, type NamedItem } from "@supplies/core/duplicates";
import { defaultRowId } from "@supplies/core/ordering";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { Textarea } from "@supplies/ui/textarea";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { GroupView, ItemDetail, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";
import { BarcodeField } from "../components/item-form/barcode-field";
import { DuplicateWarning } from "../components/item-form/duplicate-warning";
import { SelectField } from "../components/item-form/select-field";
import { StockRulesFields } from "../components/item-form/stock-rules-fields";
import type { Values } from "../components/item-form/types";
import { useBarcodeFormLookup } from "../hooks/use-barcode-form-lookup";
import { useItemSave } from "../hooks/use-item-save";

/**
 * Loads, then hands the form its starting values as props.
 *
 * The obvious shape — one component with `useState` and an effect that copies
 * the loaded item into it — is what React's `react-hooks/set-state-in-effect`
 * rule exists to stop, and it was right to: that renders once with empty
 * fields, once more with real ones, and needs a guard so the copy does not
 * clobber what the person has typed. Waiting for the data and seeding state
 * lazily has none of those problems.
 */
export function ItemFormRoute() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const editing = Boolean(id);

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

  const initial: Values = {
    name: row?.name ?? search.get("name") ?? "",
    // Feature 15.2 — a new item opens on the starred category and location.
    // An existing item keeps its own, obviously.
    categoryId: row?.categoryId ?? defaultRowId(taxonomy.data.categories, true) ?? "",
    locationId: row?.locationId ?? defaultRowId(taxonomy.data.locations, false) ?? "",
    groupId: row?.groupId ?? "",
    unit: row?.unit ?? "PIECE",
    minQty: row?.minQty ?? "0",
    // Feature 21 — carried from a scan on /items that matched nothing.
    barcode: row?.barcode ?? search.get("barcode") ?? "",
    notes: row?.notes ?? "",
    shareToOff: false,
  };

  return (
    <ItemForm
      itemId={id}
      initial={initial}
      taxonomy={taxonomy.data}
      itemGroups={groups.data ?? []}
      existingItems={names.data ?? []}
      // §3.2 — the unit is locked once the item has batches, because changing
      // it would silently reinterpret every quantity already recorded.
      hasBatches={(row?.batches.length ?? 0) > 0}
      // Only for a NEW item: arriving from a scan should behave like scanning
      // here, and an existing item's code has already been looked up once.
      autoLookup={!editing ? (search.get("barcode") ?? undefined) : undefined}
    />
  );
}

function ItemForm({
  itemId,
  initial,
  taxonomy,
  itemGroups,
  existingItems,
  hasBatches,
  autoLookup,
}: {
  itemId?: string;
  initial: Values;
  taxonomy: Taxonomy;
  itemGroups: GroupView[];
  existingItems: NamedItem[];
  hasBatches: boolean;
  autoLookup?: string;
}) {
  const editing = Boolean(itemId);
  const navigate = useNavigate();

  const [values, setValues] = useState(initial);
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { submit, issue, formError, saving } = useItemSave(itemId);

  const barcode = useBarcodeFormLookup({
    autoLookup,
    onCode: (code) => setValues((current) => ({ ...current, barcode: code })),
    // Only into an empty field — see the note in the hook.
    onSuggestName: (name) =>
      setValues((current) => (current.name.trim() ? current : { ...current, name })),
  });

  /**
   * Feature 16.1 — recomputed as the name changes; excludes the item being
   * edited so it never flags itself. Matching runs on the client against names
   * already fetched: the list is small, and a warning that needs a round trip
   * arrives too late to be read.
   */
  const similar = findSimilar(values.name, existingItems, itemId);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">
        {editing ? "Редагувати" : "Новий товар"}
      </h1>

      <div className="space-y-2">
        <Label htmlFor="name">Назва</Label>
        <Input
          id="name"
          placeholder="Вода негазована 1,5 л"
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
        />
        <DuplicateWarning matches={similar} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="categoryId"
          label="Категорія"
          value={values.categoryId}
          onChange={(value) => set("categoryId", value)}
        >
          {taxonomy.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="locationId"
          label="Де зберігається"
          value={values.locationId}
          onChange={(value) => set("locationId", value)}
        >
          <option value="">Не вказано</option>
          {taxonomy.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </SelectField>
      </div>

      <StockRulesFields
        values={values}
        itemGroups={itemGroups}
        hasBatches={hasBatches}
        onChange={set}
      />

      <BarcodeField
        value={values.barcode}
        lookup={barcode.lookup}
        looking={barcode.looking}
        shareToOff={values.shareToOff}
        onChange={(value) => set("barcode", value)}
        onLookUp={barcode.lookUp}
        onShareChange={(share) => set("shareToOff", share)}
      />

      <div className="space-y-2">
        <Label htmlFor="notes">Нотатки</Label>
        <Textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>

      {issue ? <p className="text-sm text-destructive">{issue}</p> : null}
      {formError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={() => submit(values)} disabled={saving}>
          {saving ? "Зберігаємо…" : "Зберегти"}
        </Button>
        <Button variant="ghost" onClick={() => void navigate(-1)}>
          Скасувати
        </Button>
      </div>
    </div>
  );
}
