import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { Link, useParams } from "react-router";
import { toDecimal } from "@supplies/core/decimal";
import { formatQuantityWithUnit, UNIT_SHORT } from "@supplies/core/format";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Button } from "@supplies/ui/button";
import { Card, CardContent } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { StockBadge } from "@supplies/ui/state-badges";
import { api } from "../api/client";
import { keys, stockWriteInvalidates } from "../api/keys";
import type { GroupDetail } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * One set — ported from `apps/web/app/(app)/groups/[id]/page.tsx` and
 * `components/group-members.tsx`, which are one screen split across a server
 * page and a client component. Here they are one component, because the data
 * arrives from a query either way.
 *
 * Feature 26.2 — the membership editor deliberately cannot create items. A set
 * is a way of counting things you already track; letting it mint new items
 * would put a second, thinner item form in front of the reader and produce
 * items with no category, no location and no stock.
 */
export function GroupDetailRoute() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [scanMiss, setScanMiss] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: keys.group(id),
    queryFn: () => api.get<GroupDetail>(`/api/groups/${id}`),
    enabled: Boolean(id),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: keys.group(id) });
    void queryClient.invalidateQueries({ queryKey: keys.groups });
    // Membership changes which minimum applies to an item, so it changes the
    // restock list and the badges — Feature 26.1.
    for (const key of stockWriteInvalidates) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const add = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/api/settings/groups/${id}/items`, { itemId }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.del(`/api/settings/groups/items/${itemId}`),
    onSuccess: invalidate,
  });

  /**
   * `detail.data?.candidates` on its own is a fresh `[]` on every render while
   * the query is loading, which would make the memo below recompute forever.
   * Keying it on the query's own data — a stable reference once resolved — is
   * what makes the memoisation real rather than decorative.
   */
  const candidates = detail.data?.candidates;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !candidates) return [];
    return candidates.filter((row) => row.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [candidates, query]);

  if (detail.isPending) return <Spinner />;
  if (detail.isError) return <ErrorNote error={detail.error} />;
  if (!detail.data) return null;

  const { group, view, members } = detail.data;
  const pending = add.isPending || remove.isPending;

  /**
   * Scanning finds an item the household already has. A code we do not know is
   * NOT an invitation to create one here — say so and stop.
   */
  function onScan(code: string) {
    const found = candidates?.find((row) => row.barcode === code);
    if (!found) {
      setScanMiss(code);
      return;
    }
    setScanMiss(null);
    if (found.compatible) add.mutate(found.id);
  }

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        nativeButton={false}
        render={<Link to="/groups" />}
      >
        <ArrowLeft className="size-4" />
        Набори
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <p className="text-sm text-muted-foreground">
          Взаємозамінні товари — рахуються разом.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {/* No members means no unit to count in; do not invent one. */}
              {view.unit ? formatQuantityWithUnit(view.quantity, view.unit) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {toDecimal(view.minQty).greaterThan(0)
                ? `мінімум ${view.minQty}${view.unit ? ` ${UNIT_SHORT[view.unit]}` : ""} на весь набір`
                : "мінімум не задано — набір не нагадує про себе"}
            </div>
          </div>
          {/* An empty set has no meaningful state to show. */}
          {members.length > 0 ? <StockBadge state={view.state} /> : null}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setScanMiss(null);
              }}
              placeholder="Знайти товар за назвою…"
              className="pl-9"
              type="search"
            />
          </div>
          <BarcodeScanButton onScan={onScan} />
        </div>

        <ErrorNote error={add.error ?? remove.error} />

        {scanMiss ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Штрихкоду <span className="font-medium text-foreground">{scanMiss}</span>{" "}
            немає серед ваших товарів. Спочатку створіть товар у{" "}
            <Link to="/items/new" className="text-primary underline underline-offset-4">
              «Запаси»
            </Link>
            , потім додайте його сюди.
          </p>
        ) : null}

        {matches.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {matches.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {UNIT_SHORT[row.unit]}
                    {/* Say where it is now, so a move is never a surprise. */}
                    {row.currentGroupName ? ` · зараз у «${row.currentGroupName}»` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !row.compatible}
                  title={row.compatible ? undefined : "Інша одиниця виміру"}
                  onClick={() => add.mutate(row.id)}
                >
                  <Plus className="size-3.5" />
                  Додати
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/*
        The search term deliberately SURVIVES an add. Clearing it emptied the
        results after every single item, so filling a set of six meant typing
        «горошок» six times. An added item leaves the candidate list on its own
        once the query refetches, so what stays on screen is what is still left
        to add.
      */}
      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          У наборі поки нічого немає. Порожній набір не нагадує про себе.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <Link to={`/items/${member.id}`} className="min-w-0 hover:underline">
                <div className="truncate text-sm font-medium">{member.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatQuantityWithUnit(member.quantity, member.unit)}
                </div>
              </Link>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Прибрати ${member.name} з набору`}
                disabled={pending}
                onClick={() => remove.mutate(member.id)}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
