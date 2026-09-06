import { useQuery } from "@tanstack/react-query";
import { CalendarClock, PackageX, ShoppingCart } from "lucide-react";
import { Link } from "react-router";
import { toDecimal } from "@supplies/core/decimal";
import { splitExpiring } from "@supplies/core/expiry";
import { formatDateTime, formatQuantityWithUnit } from "@supplies/core/format";
import { todayUTC } from "@supplies/core/period";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { ExpiryBadge, StockBadge } from "@supplies/ui/state-badges";
import { cn } from "@supplies/ui/utils";
import { api } from "../api/client";
import type { MovementReason } from "@supplies/core/units";
import { keys } from "../api/keys";
import {
  reviveItemView,
  type Dashboard,
  type RevivedItemView,
} from "../api/types";
import { EmptyNote, ErrorNote, Spinner } from "../components/feedback";

const REASON_LABEL: Record<MovementReason, string> = {
  PURCHASE: "додав",
  CONSUME: "взяв",
  WASTE: "викинув",
  CORRECTION: "виправив",
};

/**
 * «Огляд» — ported from `apps/web/app/(app)/dashboard/page.tsx`.
 *
 * The first pass of this screen rendered three plain lists and called it
 * equivalent. It was not, in two ways worth separating:
 *
 * - **Missing content.** No expiry or stock badges, no «Останні дії», no
 *   warn-days caption, no minimum on the restock rows, and group rows linked
 *   to `/items/<group id>`, which is not a page — a group has no detail view.
 * - **A duplicated rule.** Feature 30's split was re-derived here with an
 *   inline `filter(i => i.expiry === "EXPIRED")` instead of calling
 *   `splitExpiring`. That is a second implementation of a rule in the layer
 *   nobody was watching, and it is exactly what `packages/core` exists to
 *   prevent. It now calls the same function the Next app and the Telegram
 *   digest call.
 */
export function DashboardRoute() {
  const dashboard = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

  if (dashboard.isPending) return <Spinner />;
  if (dashboard.isError) return <ErrorNote error={dashboard.error} />;
  if (!dashboard.data) return null;

  const { expiryWarnDays, hasCategoryOverrides, restock, recent } = dashboard.data;
  const today = todayUTC();
  // `nextExpiry` is a Date on the server and a string over the wire; the badge
  // and `formatExpiryLabel` both want the Date back.
  const expiring = dashboard.data.expiring.map(reviveItemView);
  // Feature 30 — `expiring` arrives sorted by urgency; the split keeps that
  // order inside each half.
  const { expired, soon } = splitExpiring(expiring);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Огляд</h1>
        <p className="text-sm text-muted-foreground">
          Що псується і що закінчується — станом на сьогодні.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-warning" />
              Псується
            </CardTitle>
            {/*
              Feature 13 — the number here is the household default. Once a
              category overrides it, saying it plainly would be a lie, so the
              label admits that some categories differ.
            */}
            <span className="text-xs text-muted-foreground">
              попередження за {expiryWarnDays} дн.
              {hasCategoryOverrides ? " (деякі категорії — інакше)" : ""}
            </span>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {expiring.length === 0 ? (
              <EmptyNote>Нічого не псується найближчим часом.</EmptyNote>
            ) : (
              <>
                {/*
                  Feature 30 — two sections, because the two halves call for
                  opposite actions: bin the first, eat the second. Expired
                  goes on top; it is the half with nothing left to decide.
                */}
                <ExpirySection
                  title="Прострочено"
                  tone="destructive"
                  items={expired}
                  today={today}
                />
                <ExpirySection
                  title="Спожити найближчим часом"
                  tone="warning"
                  items={soon}
                  today={today}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageX className="size-4 text-destructive" />
              Закінчується
            </CardTitle>
            {restock.length > 0 ? (
              <Link
                to="/shopping"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ShoppingCart className="size-3.5" />
                до списку
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {restock.length === 0 ? (
              <EmptyNote>Усе на місці.</EmptyNote>
            ) : (
              <ul className="divide-y">
                {restock.map((entry) => {
                  const detail = (
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {entry.name}
                        {/* Feature 26 — say it is a set, or "0" reads as one product. */}
                        {entry.kind === "group" ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            набір · {entry.memberCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.unit
                          ? formatQuantityWithUnit(entry.quantity, entry.unit)
                          : "—"}
                        {/*
                          `toDecimal`, not `Number(...) > 0`. A quantity is a
                          `Decimal(12,3)` that arrives as a string because JSON
                          has no decimal type, and the house rule is that it
                          goes back through the engine's own type rather than
                          through a float — even for a comparison this forgiving.
                          The Next app writes `minQty.greaterThan(0)` and means
                          exactly this.
                        */}
                        {toDecimal(entry.minQty).greaterThan(0) && entry.unit
                          ? ` · мінімум ${formatQuantityWithUnit(entry.minQty, entry.unit)}`
                          : null}
                      </div>
                    </div>
                  );

                  return (
                    <li key={`${entry.kind}:${entry.id}`}>
                      {/* A group has no page of its own to link to. */}
                      {entry.kind === "item" ? (
                        <Link
                          to={`/items/${entry.id}`}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent"
                        >
                          {detail}
                          <StockBadge state={entry.state} />
                        </Link>
                      ) : (
                        <div className="-mx-2 flex items-center justify-between gap-3 px-2 py-2.5">
                          {detail}
                          <StockBadge state={entry.state} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Останні дії</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <EmptyNote>Поки нічого не відбувалося.</EmptyNote>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((movement) => (
                <li
                  key={movement.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{movement.user.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {REASON_LABEL[movement.reason]}
                    </span>{" "}
                    <Link to={`/items/${movement.item.id}`} className="hover:underline">
                      {movement.item.name}
                    </Link>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums">
                      {formatQuantityWithUnit(movement.delta, movement.item.unit)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(new Date(movement.occurredAt))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Feature 30 — one half of the «Псується» card.
 *
 * Renders nothing when its half is empty, so a household with only expired
 * items sees one heading rather than an empty section explaining what it does
 * not have.
 */
function ExpirySection({
  title,
  tone,
  items,
  today,
}: {
  title: string;
  tone: "destructive" | "warning";
  items: RevivedItemView[];
  today: Date;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div
        className={cn(
          "mb-0.5 flex items-center gap-1.5 text-xs font-semibold",
          tone === "destructive"
            ? "text-destructive"
            : "text-warning-foreground dark:text-warning",
        )}
      >
        {title}
        <span className="font-normal text-muted-foreground">· {items.length}</span>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/items/${item.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatQuantityWithUnit(item.quantity, item.unit)}
                </div>
              </div>
              <ExpiryBadge state={item.expiry} date={item.nextExpiry} today={today} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
