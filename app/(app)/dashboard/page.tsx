import Link from "next/link";
import { CalendarClock, PackageX, ShoppingCart } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getDashboard } from "@/lib/queries.rsc";
import type { ItemView } from "@/lib/queries";
import { todayUTC } from "@/lib/period";
import { splitExpiring } from "@/lib/expiry";
import { cn } from "@/lib/utils";
import { formatDateTime, formatQuantityWithUnit } from "@/lib/format";
import { ExpiryBadge, StockBadge } from "@/components/state-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REASON_LABEL = {
  PURCHASE: "додав",
  CONSUME: "взяв",
  WASTE: "викинув",
  CORRECTION: "виправив",
} as const;

export default async function DashboardPage() {
  const session = await requireSession();
  const { expiring, restock, recent, expiryWarnDays, hasCategoryOverrides } =
    await getDashboard(session.householdId);
  const today = todayUTC();
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
              <p className="py-6 text-center text-sm text-muted-foreground">
                Нічого не псується найближчим часом.
              </p>
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
                href="/shopping"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ShoppingCart className="size-3.5" />
                до списку
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {restock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Усе на місці.
              </p>
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
                        {entry.minQty.greaterThan(0) && entry.unit
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
                          href={`/items/${entry.id}`}
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
            <p className="py-6 text-center text-sm text-muted-foreground">
              Поки нічого не відбувалося.
            </p>
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
                    <Link
                      href={`/items/${movement.item.id}`}
                      className="hover:underline"
                    >
                      {movement.item.name}
                    </Link>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums">
                      {formatQuantityWithUnit(movement.delta, movement.item.unit)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(movement.occurredAt)}
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
  items: ItemView[];
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
              href={`/items/${item.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatQuantityWithUnit(item.quantity, item.unit)}
                </div>
              </div>
              <ExpiryBadge
                state={item.expiry}
                date={item.nextExpiry}
                today={today}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
