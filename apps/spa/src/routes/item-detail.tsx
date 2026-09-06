import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Pencil } from "lucide-react";
import { Link, useParams } from "react-router";
import { batchExpiryState } from "@supplies/core/expiry";
import { formatDate, formatQuantityWithUnit } from "@supplies/core/format";
import { todayUTC } from "@supplies/core/period";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { ItemDetail } from "../api/types";
import { EmptyNote, ErrorNote, Spinner } from "../components/feedback";

/**
 * One item: what there is, when it goes off, and the two things you actually
 * do — «Взяли» and «Поповнити».
 *
 * The two mutations are the whole Phase 2 thesis in miniature. In the Next app
 * these are server actions ending in `revalidatePath`; here they are POSTs
 * ending in `invalidateQueries`, and the list of what goes stale is
 * `stockWriteInvalidates` rather than a decision made twice.
 *
 * FEFO is not implemented here and must never be. «Взяли» sends a quantity and
 * the API's write path decides which batches it comes out of — the same code
 * the web app and the Telegram bot call.
 */
export function ItemDetailRoute() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("1");

  const item = useQuery({
    queryKey: keys.item(id),
    queryFn: () => api.get<ItemDetail>(`/api/items/${id}`),
    enabled: Boolean(id),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.item(id) });
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const take = useMutation({
    mutationFn: (quantity: string) =>
      api.post("/api/stock/consume", { itemId: id, quantity }),
    onSuccess: invalidate,
  });

  const restock = useMutation({
    mutationFn: (quantity: string) =>
      api.post("/api/stock/add", { itemId: id, rows: [{ quantity }] }),
    onSuccess: invalidate,
  });

  if (item.isPending) return <Spinner />;
  if (item.isError) return <ErrorNote error={item.error} />;
  if (!item.data) return null;

  const { item: row, warnDays } = item.data;
  const detail = item.data;
  const today = todayUTC();
  const busy = take.isPending || restock.isPending;

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/items"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Запаси
        </Link>

        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Редагувати"
            nativeButton={false}
            render={<Link to={`/items/${row.id}/edit`} />}
          >
            <Pencil className="size-4" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span data-testid="item-quantity" className="text-xl tabular-nums">
            {formatQuantityWithUnit(detail.quantity, row.unit)}
          </span>
          <StockBadge state={detail.stock} />
          {/*
            The item-level chip needs the soonest date among the batches, and
            `getItemDetail` does not send one — it sends the batches. `null`
            makes `ExpiryBadge` render nothing rather than a phrase it cannot
            justify; the dated chips are on the batch rows below, which is
            where the information actually is.
          */}
          <ExpiryBadge state={detail.expiry} date={null} today={today} />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="amount">Кількість</Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => take.mutate(amount)} disabled={busy}>
              Взяли
            </Button>
            <Button
              variant="outline"
              onClick={() => restock.mutate(amount)}
              disabled={busy}
            >
              Поповнити
            </Button>
          </div>

          {/* The API sends a message key and its params; this renders what came
              back, which is the same Ukrainian the web app shows. */}
          <ErrorNote error={take.error ?? restock.error} />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Партії ({row.batches.length})
        </h2>
        {row.batches.length === 0 ? (
          <EmptyNote>Жодної партії — цього товару зараз немає.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {row.batches.map((batch) => {
              const expiresAt = batch.expiresAt ? new Date(batch.expiresAt) : null;
              return (
                <li key={batch.id}>
                  <Card size="sm">
                    <CardContent className="flex items-center justify-between gap-3">
                      <span className="tabular-nums">
                        {formatQuantityWithUnit(batch.quantity, row.unit)}
                      </span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {expiresAt ? formatDate(expiresAt) : "без дати"}
                        {/*
                          Feature 13 — `warnDays` is the item's window, which
                          its category may have overridden. The state is
                          computed here by the same pure function the Next app
                          calls rather than sent per batch, so the inheritance
                          rule has one implementation.
                        */}
                        <ExpiryBadge
                          state={batchExpiryState(expiresAt, today, warnDays)}
                          date={expiresAt}
                          today={today}
                        />
                      </span>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
