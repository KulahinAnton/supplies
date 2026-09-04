import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { ItemDetail } from "../api/types";
import { formatDate, formatQuantityWithUnit } from "@supplies/core/format";
import { batchExpiryState } from "@supplies/core/expiry";
import { todayUTC } from "@supplies/core/period";
import { Button, Card, ErrorNote, ExpiryBadge, Spinner, StockBadge } from "../components/ui";

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
        <Link to="/items" className="text-sm text-neutral-500 hover:underline">
          ← Запаси
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{row.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span data-testid="item-quantity" className="text-xl tabular-nums">
            {formatQuantityWithUnit(detail.quantity, row.unit)}
          </span>
          <StockBadge state={detail.stock} />
          <ExpiryBadge state={detail.expiry} />
        </div>
      </div>

      <Card className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Кількість</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2">
          <Button onClick={() => take.mutate(amount)} disabled={busy}>
            Взяли
          </Button>
          <Button variant="ghost" onClick={() => restock.mutate(amount)} disabled={busy}>
            Поповнити
          </Button>
        </div>

        {/* The API sends a message key and its params; this renders what came
            back, which is the same Ukrainian the web app shows. */}
        <ErrorNote error={take.error ?? restock.error} />
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">
          Партії ({row.batches.length})
        </h2>
        <ul className="space-y-2">
          {row.batches.map((batch) => (
            <li key={batch.id}>
              <Card className="flex items-baseline justify-between gap-3 py-3">
                <span className="tabular-nums">
                  {formatQuantityWithUnit(batch.quantity, row.unit)}
                </span>
                <span className="flex items-center gap-2 text-sm text-neutral-500">
                  {batch.expiresAt ? formatDate(new Date(batch.expiresAt)) : "без дати"}
                  <ExpiryBadge
                    state={batchExpiryState(
                      batch.expiresAt ? new Date(batch.expiresAt) : null,
                      today,
                      warnDays,
                    )}
                  />
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
