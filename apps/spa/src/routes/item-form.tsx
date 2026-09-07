import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { findSimilar, type NamedItem } from "@supplies/core/duplicates";
import { UNIT_PLURAL } from "@supplies/core/format";
import { MESSAGES, type MessageKey } from "@supplies/core/messages";
import { defaultRowId } from "@supplies/core/ordering";
import type { Unit } from "@supplies/core/units";
import { itemSchema } from "@supplies/core/validation/item";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Button } from "@supplies/ui/button";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { Textarea } from "@supplies/ui/textarea";
import { api, ApiError } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { GroupView, ItemDetail, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * What a barcode turned out to be — the shape `@supplies/db/barcode-service`
 * answers with, which the API passes through unchanged.
 */
type BarcodeLookup =
  | { kind: "existing"; itemId: string; name: string }
  | { kind: "product"; suggestedName: string }
  | { kind: "unknown"; manufacturer: string | null; canShare: boolean };

type Values = {
  name: string;
  categoryId: string;
  locationId: string;
  groupId: string;
  unit: Unit;
  minQty: string;
  barcode: string;
  notes: string;
  shareToOff: boolean;
};

const UNIT_OPTIONS: { value: Unit; label: string }[] = (
  Object.keys(UNIT_PLURAL) as Unit[]
).map((unit) => ({ value: unit, label: UNIT_PLURAL[unit].many }));

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

/** Zod messages are keys (§8) — the form is the place that renders them. */
function messageFor(key?: string): string | undefined {
  if (!key) return undefined;
  return MESSAGES[key as MessageKey] ?? key;
}

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
  const queryClient = useQueryClient();

  const [values, setValues] = useState(initial);
  const [issue, setIssue] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<BarcodeLookup | null>(null);
  const [looking, setLooking] = useState(false);
  /** Last code already looked up, so a blur without an edit does not refetch. */
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /**
   * Feature 16.1 — recomputed as the name changes; excludes the item being
   * edited so it never flags itself. Matching runs on the client against names
   * already fetched: the list is small, and a warning that needs a round trip
   * arrives too late to be read.
   */
  const similar = findSimilar(values.name, existingItems, itemId);

  /**
   * A scan writes the code, then asks the server what it is. The name is only
   * pre-filled when the field is still EMPTY — silently overwriting something
   * the user typed would be worse than not helping at all.
   */
  async function onBarcodeScanned(code: string) {
    setValues((current) => ({ ...current, barcode: code }));
    setLookedUp(code);
    setLookup(null);
    setLooking(true);

    try {
      const result = await api.get<BarcodeLookup>(
        `/api/barcode/${encodeURIComponent(code)}`,
      );
      setLookup(result);
      if (result.kind === "product") {
        setValues((current) =>
          current.name.trim() ? current : { ...current, name: result.suggestedName },
        );
      }
    } catch {
      // A miss is not an error — Open Food Facts has patchy Ukrainian
      // coverage, and an empty form is a perfectly good outcome.
      setLookup(null);
    } finally {
      setLooking(false);
    }
  }

  /**
   * Feature 21 — arriving here from a scan should behave like scanning here.
   * The field is already filled, so the blur handler that normally starts the
   * lookup never fires; without this someone would have to click into the
   * barcode box and back out to get the name suggestion they just earned.
   *
   * Mount only, and once: `lookedUp` stops any re-render re-asking.
   */
  useEffect(() => {
    if (!autoLookup) return;
    const handle = setTimeout(() => void onBarcodeScanned(autoLookup), 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>): Promise<{ id?: string }> =>
      editing
        ? api.patch<{ id?: string }>(`/api/items/${itemId ?? ""}`, {
            ...payload,
            id: itemId,
          })
        : api.post<{ id?: string }>("/api/items", payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.taxonomy });
      void queryClient.invalidateQueries({ queryKey: keys.itemNames });
      void queryClient.invalidateQueries({ queryKey: keys.groups });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(editing ? "Збережено" : "Товар додано");
      void navigate(`/items/${editing ? (itemId ?? "") : (result.id ?? "")}`);
    },
    onError: (cause) => {
      setFormError(
        cause instanceof ApiError ? cause.message : "Щось пішло не так. Спробуйте ще раз.",
      );
    },
  });

  function submit() {
    setIssue(null);
    setFormError(null);

    const payload = {
      name: values.name,
      categoryId: values.categoryId,
      locationId: values.locationId || undefined,
      groupId: values.groupId || undefined,
      unit: values.unit,
      minQty: values.minQty,
      barcode: values.barcode.trim() || undefined,
      notes: values.notes.trim() || undefined,
      shareToOff: values.shareToOff,
    };

    /**
     * Checked here as well as on the server, with the SAME schema, so the
     * problem appears next to the field instead of after a round trip — and
     * so this form can never let through something the API will then refuse
     * for reasons the form has no words for.
     */
    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) {
      setIssue(messageFor(parsed.error.issues[0]?.message) ?? null);
      return;
    }
    save.mutate(payload);
  }

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

        {/*
          Feature 16.1 — warn while typing, never block. Most duplicates exist
          because someone could not find the item they already had.
        */}
        {similar.length > 0 ? (
          <div className="rounded-md bg-warning/12 px-3 py-2 text-sm">
            <p className="text-warning-foreground dark:text-warning">
              {similar.length === 1
                ? "Схоже, такий товар уже є:"
                : "Схоже, такі товари вже є:"}
            </p>
            <ul className="mt-1 space-y-0.5">
              {similar.slice(0, 3).map((match) => (
                <li key={match.id}>
                  <Link
                    to={`/items/${match.id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    {match.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              Якщо це той самий товар — краще поповнити його запас.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Категорія</Label>
          <select
            id="categoryId"
            className={SELECT_CLASS}
            value={values.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
          >
            {taxonomy.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="locationId">Де зберігається</Label>
          <select
            id="locationId"
            className={SELECT_CLASS}
            value={values.locationId}
            onChange={(event) => set("locationId", event.target.value)}
          >
            <option value="">Не вказано</option>
            {taxonomy.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="unit">Одиниця виміру</Label>
          <select
            id="unit"
            className={SELECT_CLASS}
            disabled={hasBatches}
            value={values.unit}
            onChange={(event) => set("unit", event.target.value as Unit)}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {hasBatches ? (
            <p className="text-xs text-muted-foreground">
              Одиницю не можна змінити, поки є партії — інакше наявні кількості
              означали б інше.
            </p>
          ) : null}
        </div>

        {/*
          Feature 26 — when the item belongs to a set, the SET carries the
          threshold. Showing this field anyway would be showing a setting that
          silently does nothing, which is worse than not offering it.
        */}
        {values.groupId ? (
          <div className="space-y-2">
            <Label>Мінімальний запас</Label>
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Задається для набору — у «Налаштування → Набори товарів».
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="minQty">Мінімальний запас</Label>
            <Input
              id="minQty"
              inputMode="decimal"
              value={values.minQty}
              onChange={(event) => set("minQty", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Нижче цього — потрапляє до списку покупок. 0 — не нагадувати,
              навіть коли товар закінчиться.
            </p>
          </div>
        )}

        {itemGroups.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="groupId">Набір</Label>
            <select
              id="groupId"
              className={SELECT_CLASS}
              value={values.groupId}
              onChange={(event) => set("groupId", event.target.value)}
            >
              <option value="">Без набору</option>
              {itemGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Взаємозамінні товари рахуються разом — мінімум один на весь набір.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="barcode">Штрихкод</Label>
        <div className="flex gap-2">
          <Input
            id="barcode"
            inputMode="numeric"
            placeholder="Необов'язково"
            value={values.barcode}
            onChange={(event) => set("barcode", event.target.value)}
            onBlur={(event) => {
              // Typing or pasting a code should do exactly what scanning does —
              // the camera is a convenience, not the only way in.
              const code = event.target.value.trim();
              if (code && code !== lookedUp) void onBarcodeScanned(code);
            }}
          />
          <BarcodeScanButton onScan={(code) => void onBarcodeScanned(code)} />
        </div>

        {/*
          Feature 10 — a scan is only worth the camera if it saves typing, so it
          fills the name from Open Food Facts. The lookup NEVER blocks: a miss
          (their Ukrainian coverage is patchy) just leaves the field as you
          found it.
        */}
        {lookup ? (
          <p
            className={
              lookup.kind === "existing"
                ? "text-sm text-warning-foreground dark:text-warning"
                : "text-sm text-muted-foreground"
            }
          >
            {lookup.kind === "existing" ? (
              <>
                Такий штрихкод уже має{" "}
                <Link
                  to={`/items/${lookup.itemId}`}
                  className="text-primary underline underline-offset-4"
                >
                  {lookup.name}
                </Link>
                . Можливо, варто просто поповнити його запас.
              </>
            ) : lookup.kind === "product" ? (
              "Назву підставлено з Open Food Facts — перевірте й виправте за потреби."
            ) : lookup.manufacturer ? (
              /*
                Feature 20 — GS1 Ukraine knows who licensed the number even when
                no product database knows the product. Naming the maker is a
                real head start on typing the name; claiming it IS the name
                would be a lie, so it is worded as a separate fact.
              */
              <>
                Цього штрихкоду немає у відкритих базах. За даними GS1 Україна,
                виробник —{" "}
                <strong className="font-medium">{lookup.manufacturer}</strong>.
                Введіть назву вручну.
              </>
            ) : (
              "Цього штрихкоду немає у відкритих базах. Введіть назву вручну."
            )}
          </p>
        ) : null}

        {/*
          Feature 18.2 — opt-in, unchecked by default. Publishing a product to
          Open Food Facts sends data to a third party, which must be a decision
          rather than a side effect of saving an item. Only offered when the
          lookup missed AND credentials exist, so it never silently does
          nothing.
        */}
        {lookup?.kind === "unknown" && lookup.canShare ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={values.shareToOff}
              onChange={(event) => set("shareToOff", event.target.checked)}
            />
            <span className="text-muted-foreground">
              Поділитися назвою й штрихкодом з Open Food Facts — щоб наступного
              разу цей товар знайшовся сам, і не лише у вас.
            </span>
          </label>
        ) : null}
        {looking ? (
          <p className="text-sm text-muted-foreground">Шукаємо товар…</p>
        ) : null}
      </div>

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
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Зберігаємо…" : "Зберегти"}
        </Button>
        <Button variant="ghost" onClick={() => void navigate(-1)}>
          Скасувати
        </Button>
      </div>
    </div>
  );
}
