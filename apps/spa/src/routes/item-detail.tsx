import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { toDecimal } from "@supplies/core/decimal";
import { batchExpiryState } from "@supplies/core/expiry";
import {
  UNIT_SHORT,
  formatDate,
  formatDateTime,
  formatQuantityWithUnit,
} from "@supplies/core/format";
import { sanitizeListSearch } from "@supplies/core/item-list-params";
import { todayUTC } from "@supplies/core/period";
import { fefoOrder } from "@supplies/core/stock";
import type { MovementReason, Unit } from "@supplies/core/units";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@supplies/ui/dialog";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { api, ApiError } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import {
  reviveBatch,
  type ItemDetail,
  type RevivedBatch,
  type Taxonomy,
} from "../api/types";
import { AddStockForm } from "../components/add-stock-form";
import { ErrorNote, Spinner } from "../components/feedback";

const REASON_LABEL: Record<MovementReason, string> = {
  PURCHASE: "Поповнення",
  CONSUME: "Взяли",
  WASTE: "Списано",
  CORRECTION: "Виправлення",
};

/**
 * One item — ported from `apps/web/app/(app)/items/[id]/page.tsx` with its
 * `ItemActions`, `BatchActions` and `ItemArchiveButton`.
 *
 * **FEFO is not implemented here and must never be.** «Взяли» sends a quantity
 * and the API's write path decides which batches it comes out of. The batch
 * ORDER on screen is `fefoOrder` from `@supplies/core` — the same function,
 * so the list shows the order the server will actually draw in rather than a
 * client's guess at it.
 */
export function ItemDetailRoute() {
  const { id = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: keys.item(id),
    queryFn: () => api.get<ItemDetail>(`/api/items/${id}`),
    enabled: Boolean(id),
  });

  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });

  const { write, pending } = useItemWrite(id);

  if (detail.isPending) return <Spinner />;
  if (detail.isError) return <ErrorNote error={detail.error} />;
  if (!detail.data) return null;

  const { item, warnDays, quantity, stock, expiry } = detail.data;
  const today = todayUTC();

  // Feature 27.1 — the list view this item was opened from, re-parsed rather
  // than pasted through: it arrived in a URL.
  const backSearch = sanitizeListSearch(search.get("from") ?? undefined);
  const backHref = backSearch ? `/items?${backSearch}` : "/items";

  const live = item.batches.map(reviveBatch).filter((b) => b.quantity.greaterThan(0));
  /**
   * Show the batches in the order FEFO will actually draw them, then append
   * the expired ones — which FEFO skips and which must be discarded by hand.
   * `fefoOrder` returns the engine's own row shape, so ids are mapped back to
   * the full rows to keep `addedBy` and the location.
   */
  const byId = new Map(live.map((batch) => [batch.id, batch]));
  const drawOrder = fefoOrder(live, today)
    .map((batch) => byId.get(batch.id))
    .filter((batch) => batch !== undefined);
  const drawn = new Set(drawOrder.map((batch) => batch.id));
  const expired = live.filter((batch) => !drawn.has(batch.id));
  const ordered: RevivedBatch[] = [...drawOrder, ...expired];

  return (
    <div className="space-y-5">
      <Link
        to={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Запаси
      </Link>

      {item.isArchived ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3">
          <p className="text-sm text-muted-foreground">
            Товар в архіві — прихований зі списків і нагадувань.
          </p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void write(() =>
                api.post(`/api/items/${item.id}/archive`, { archived: false }),
              ).then((refusal) => refusal && toast.error(refusal))
            }
          >
            <ArchiveRestore className="size-4" />
            Повернути з архіву
          </Button>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-sm text-muted-foreground">
            {item.category.name}
            {item.location ? ` · ${item.location.name}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <StockBadge state={stock} />
            <ExpiryBadge state={expiry} date={ordered[0]?.expiresAt ?? null} today={today} />
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Редагувати"
          nativeButton={false}
          render={<Link to={`/items/${item.id}/edit`} />}
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            {/* Feature 33 — the e2e suite asserts on this number, and a test id
                survives copy changes that a text selector would not. */}
            <div
              data-testid="item-quantity"
              className="text-3xl font-semibold tabular-nums"
            >
              {formatQuantityWithUnit(quantity, item.unit)}
            </div>
            <div className="text-xs text-muted-foreground">
              {toDecimal(item.minQty).greaterThan(0)
                ? `мінімум ${formatQuantityWithUnit(item.minQty, item.unit)}`
                : "мінімум не задано"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/*
        Both of these could be entered on the item form and then never seen
        again — the barcode was write-only, and notes existed only in the
        database. A field you can fill but not read is worse than no field.
      */}
      {item.barcode || item.notes ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            {item.barcode ? (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Штрихкод</span>
                <span className="font-mono text-sm tabular-nums select-all">
                  {item.barcode}
                </span>
              </div>
            ) : null}
            {item.notes ? (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Нотатки</span>
                {/* Preserve the line breaks the user typed. */}
                <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {item.isArchived ? null : (
        <ItemActions
          itemId={item.id}
          unit={item.unit}
          barcode={item.barcode}
          locations={taxonomy.data?.locations ?? []}
          itemLocationId={item.locationId}
          write={write}
          pending={pending}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Партії</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {ordered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Запасу немає. Натисніть «Поповнити».
            </p>
          ) : (
            <ul className="divide-y">
              {ordered.map((batch) => (
                <li
                  key={batch.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium tabular-nums">
                      {formatQuantityWithUnit(batch.quantityRaw, item.unit)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {batch.expiresAt ? `до ${formatDate(batch.expiresAt)}` : "без терміну"}
                      {/*
                        Feature 22 — only when it differs from the item's own
                        shelf. Repeating the item's location on every batch
                        would be noise; the exception is the information.
                      */}
                      {batch.location && batch.location.id !== item.locationId
                        ? ` · ${batch.location.name}`
                        : ""}
                      {" · "}
                      {batch.addedBy.name}
                    </div>
                    <ExpiryBadge
                      state={batchExpiryState(batch.expiresAt, today, warnDays)}
                      date={batch.expiresAt}
                      today={today}
                    />
                  </div>
                  <BatchActions
                    batchId={batch.id}
                    unit={item.unit}
                    currentQuantity={batch.quantityRaw}
                    write={write}
                    pending={pending}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Історія</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {item.movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Порожньо.</p>
          ) : (
            <ul className="divide-y text-sm">
              {item.movements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{REASON_LABEL[movement.reason]}</div>
                    <div className="text-xs text-muted-foreground">
                      {movement.user.name} ·{" "}
                      {formatDateTime(new Date(movement.occurredAt))}
                    </div>
                  </div>
                  <div className="shrink-0 tabular-nums">
                    {formatQuantityWithUnit(movement.delta, item.unit)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {item.isArchived ? null : (
        <div className="flex justify-center pt-2">
          <ArchiveButton
            hasStock={toDecimal(quantity).greaterThan(0)}
            pending={pending}
            onArchive={() =>
              void write(() =>
                api.post(`/api/items/${item.id}/archive`, { archived: true }),
              ).then((refusal) =>
                // Leaving the page IS the confirmation, so it must not happen
                // when the archive was refused.
                refusal ? toast.error(refusal) : void navigate("/items"),
              )
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * One mutation wrapper for the whole page, so every write invalidates the same
 * set. A stock change moves the item's quantity, its place in the list, the
 * dashboard's three buckets and the nav badges — the Next app gets that from
 * `router.refresh()`, and here it has to be named.
 *
 * **It returns the refusal rather than reporting it.** Most writes on this
 * screen happen inside a dialog with a field the message belongs next to — a
 * shortfall names exactly how much is missing (§3.3) — while discard and
 * archive have no such field and toast instead. Only the caller knows which.
 */
function useItemWrite(id: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.item(id) });
      for (const key of stockWriteInvalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  /** `null` when it worked; the Ukrainian refusal when it did not. */
  async function write(work: () => Promise<unknown>): Promise<string | null> {
    try {
      await mutation.mutateAsync(work);
      return null;
    } catch (cause) {
      // `ApiError.message` is what the API rendered from the shared catalogue
      // — the same sentence the web app shows for the same rule.
      return cause instanceof ApiError
        ? cause.message
        : "Щось пішло не так. Спробуйте ще раз.";
    }
  }

  return { write, pending: mutation.isPending };
}

type Write = (work: () => Promise<unknown>) => Promise<string | null>;

function ItemActions({
  itemId,
  unit,
  barcode,
  locations,
  itemLocationId,
  write,
  pending,
}: {
  itemId: string;
  unit: Unit;
  barcode: string | null;
  locations: { id: string; name: string }[];
  itemLocationId: string | null;
  write: Write;
  pending: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function take() {
    // The shortfall message names exactly how much is missing (§3.3), so it
    // belongs beside the field rather than in a toast.
    const refusal = await write(() =>
      api.post("/api/stock/consume", { itemId, quantity }),
    );
    setError(refusal);
    if (refusal) return;
    setQuantity("");
    setTakeOpen(false);
  }

  return (
    <div className="flex gap-2">
      <Button className="flex-1" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" />
        Поповнити
      </Button>
      <Button variant="outline" className="flex-1" onClick={() => setTakeOpen(true)}>
        <Minus className="size-4" />
        Взяли
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Поповнити запас</DialogTitle>
            <DialogDescription>
              Купили кілька партій із різними датами? Додайте кілька рядків.
            </DialogDescription>
          </DialogHeader>
          <AddStockForm
            itemId={itemId}
            unit={unit}
            barcode={barcode}
            locations={locations}
            itemLocationId={itemLocationId}
            write={write}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Скільки взяли?</DialogTitle>
            <DialogDescription>
              Спишемо з партії, яка псується найшвидше. Прострочене не чіпаємо.
            </DialogDescription>
          </DialogHeader>

          <QuantityField
            id="take-qty"
            label={`Кількість (${UNIT_SHORT[unit]})`}
            value={quantity}
            onChange={setQuantity}
          />

          {error ? <DialogError>{error}</DialogError> : null}

          <Button onClick={take} disabled={pending || quantity.trim() === ""}>
            {pending ? "Записуємо…" : "Записати"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Per-batch controls: take from THIS batch, correct, and discard. */
function BatchActions({
  batchId,
  unit,
  currentQuantity,
  write,
  pending,
}: {
  batchId: string;
  unit: Unit;
  currentQuantity: string;
  write: Write;
  pending: boolean;
}) {
  const [correctOpen, setCorrectOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [takeValue, setTakeValue] = useState("");
  const [value, setValue] = useState(currentQuantity);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<unknown>, onOk: () => void) {
    const refusal = await write(work);
    setError(refusal);
    if (!refusal) onOk();
  }

  return (
    <div className="flex gap-1">
      {/*
        Feature 24 — take from THIS batch. The item-level button is FEFO and
        refuses expired stock, which leaves someone holding an expired carton
        no way to record using it except to lie about it as waste.
      */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Взяти з цієї партії"
        onClick={() => {
          setError(null);
          setTakeOpen(true);
        }}
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Виправити кількість"
        onClick={() => setCorrectOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Списати партію"
        disabled={pending}
        onClick={() =>
          void write(() => api.post("/api/stock/discard", { batchId })).then(
            // No field for this one to sit beside — the button is the whole
            // interaction — so a refusal is a toast.
            (refusal) => refusal && toast.error(refusal),
          )
        }
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>

      <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Взяти з цієї партії</DialogTitle>
            <DialogDescription>
              Саме з цієї — навіть якщо термін уже минув.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <QuantityField
              id="take-batch-qty"
              label={`Скільки (${UNIT_SHORT[unit]})`}
              value={takeValue}
              onChange={setTakeValue}
              placeholder={currentQuantity}
            />
            <p className="text-xs text-muted-foreground">
              У партії: {currentQuantity} {UNIT_SHORT[unit]}
            </p>
          </div>

          {error ? <DialogError>{error}</DialogError> : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setTakeValue(currentQuantity)}
            >
              Усю партію
            </Button>
            <Button
              className="flex-1"
              disabled={pending || !takeValue}
              onClick={() =>
                void run(
                  () =>
                    api.post("/api/stock/consume-batch", {
                      batchId,
                      quantity: takeValue,
                    }),
                  () => {
                    setTakeOpen(false);
                    setTakeValue("");
                  },
                )
              }
            >
              {pending ? "Записуємо…" : "Взяти"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Скільки насправді?</DialogTitle>
            <DialogDescription>
              Перерахували вручну — запишемо різницю в історію.
            </DialogDescription>
          </DialogHeader>

          <QuantityField
            id="correct-qty"
            label={`Кількість (${UNIT_SHORT[unit]})`}
            value={value}
            onChange={setValue}
          />

          {error ? <DialogError>{error}</DialogError> : null}

          <Button
            disabled={pending}
            onClick={() =>
              void run(
                () => api.post("/api/stock/correct", { batchId, quantity: value }),
                () => setCorrectOpen(false),
              )
            }
          >
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Feature 3 — archive, never delete. StockMovement rows reference the item, and
 * "who used the last of it" outlives the family's interest in buying it again.
 */
function ArchiveButton({
  hasStock,
  pending,
  onArchive,
}: {
  hasStock: boolean;
  pending: boolean;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="text-muted-foreground"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Archive className="size-4" />
        В архів
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Перенести в архів?</DialogTitle>
            <DialogDescription>
              Товар зникне зі списків і нагадувань, але історія збережеться.
              Повернути можна будь-коли.
            </DialogDescription>
          </DialogHeader>

          {hasStock ? (
            <p className="rounded-md bg-warning/15 px-3 py-2 text-sm">
              У товару ще є запас. Він залишиться в базі, але ви більше не
              побачите його серед своїх запасів.
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending} onClick={onArchive}>
              {pending ? "Переносимо…" : "В архів"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Скасувати
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuantityField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}

function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
