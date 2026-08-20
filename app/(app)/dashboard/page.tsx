import Link from "next/link";
import { CalendarClock, PackageX, ShoppingCart } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getDashboard } from "@/lib/queries";
import { todayUTC } from "@/lib/period";
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
          <CardContent className="pt-0">
            {expiring.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Нічого не псується найближчим часом.
              </p>
            ) : (
              <ul className="divide-y">
                {expiring.map((item) => (
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
                {restock.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/items/${item.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatQuantityWithUnit(item.quantity, item.unit)}
                          {item.minQty.greaterThan(0)
                            ? ` · мінімум ${formatQuantityWithUnit(item.minQty, item.unit)}`
                            : null}
                        </div>
                      </div>
                      <StockBadge state={item.stock} />
                    </Link>
                  </li>
                ))}
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
