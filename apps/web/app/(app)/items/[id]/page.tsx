import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getCategoriesAndLocations, getItemDetail } from "@supplies/db/queries";
import { batchExpiryState } from "@supplies/core/expiry";
import { sanitizeListSearch } from "@supplies/core/item-list-params";
import { todayUTC } from "@supplies/core/period";
import { formatDate, formatDateTime, formatQuantityWithUnit } from "@supplies/core/format";
import { fefoOrder } from "@supplies/core/stock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpiryBadge, StockBadge } from "@/components/state-badges";
import { BatchActions, ItemActions } from "@/components/item-actions";
import { ItemArchiveButton } from "@/components/item-archive-button";

const REASON_LABEL = {
  PURCHASE: "Поповнення",
  CONSUME: "Взяли",
  WASTE: "Списано",
  CORRECTION: "Виправлення",
} as const;

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** Feature 27.1 — the list view this item was opened from. */
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await requireSession();
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  // Re-parsed, never pasted through: it arrived in a URL.
  const backSearch = sanitizeListSearch(from);
  const backHref = backSearch ? `/items?${backSearch}` : "/items";
  const [detail, { locations }] = await Promise.all([
    getItemDetail(session.householdId, id),
    getCategoriesAndLocations(session.householdId),
  ]);
  if (!detail) notFound();

  const { item, warnDays, quantity, stock, expiry } = detail;
  const today = todayUTC();

  const live = item.batches.filter((batch) => batch.quantity.greaterThan(0));
  // Show the batches in the order FEFO will actually draw them, then append the
  // expired ones — which FEFO skips and which must be discarded by hand.
  // fefoOrder returns the engine's own row shape, so map ids back to the full
  // rows to keep `addedBy`.
  const byId = new Map(live.map((batch) => [batch.id, batch]));
  const drawOrder = fefoOrder(live, today)
    .map((batch) => byId.get(batch.id))
    .filter((batch) => batch !== undefined);
  const drawn = new Set(drawOrder.map((batch) => batch.id));
  const expired = live.filter((batch) => !drawn.has(batch.id));
  const ordered = [...drawOrder, ...expired];

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
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
          <ItemArchiveButton itemId={item.id} isArchived hasStock={false} />
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
            <ExpiryBadge
              state={expiry}
              date={drawOrder.concat(expired)[0]?.expiresAt ?? null}
              today={today}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Редагувати"
          nativeButton={false}
          render={<Link href={`/items/${item.id}/edit`} />}
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            {/* Feature 33 — the e2e suite asserts on this number, and a
                test id survives copy changes that a text selector would not. */}
            <div
              data-testid="item-quantity"
              className="text-3xl font-semibold tabular-nums"
            >
              {formatQuantityWithUnit(quantity, item.unit)}
            </div>
            <div className="text-xs text-muted-foreground">
              {item.minQty.greaterThan(0)
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
          locations={locations}
          itemLocationId={item.locationId}
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
              {ordered.map((batch) => {
                const state = batchExpiryState(
                  batch.expiresAt,
                  today,
                  warnDays,
                );
                return (
                  <li
                    key={batch.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium tabular-nums">
                        {formatQuantityWithUnit(batch.quantity, item.unit)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {batch.expiresAt
                          ? `до ${formatDate(batch.expiresAt)}`
                          : "без терміну"}
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
                        state={state}
                        date={batch.expiresAt}
                        today={today}
                      />
                    </div>
                    <BatchActions
                      batchId={batch.id}
                      unit={item.unit}
                      currentQuantity={batch.quantity.toString()}
                    />
                  </li>
                );
              })}
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
            <p className="py-6 text-center text-sm text-muted-foreground">
              Порожньо.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {item.movements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {REASON_LABEL[movement.reason]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {movement.user.name} · {formatDateTime(movement.occurredAt)}
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
          <ItemArchiveButton
            itemId={item.id}
            isArchived={false}
            hasStock={quantity.greaterThan(0)}
          />
        </div>
      )}
    </div>
  );
}
