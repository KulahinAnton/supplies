import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../api/client";
import { keys } from "../api/keys";
import type { ItemView } from "../api/types";
import { formatQuantityWithUnit } from "@supplies/core/format";
import { Card, ErrorNote, Spinner } from "../components/ui";

type Dashboard = {
  expiring: ItemView[];
  restock: ItemView[];
};

/**
 * «Огляд». Feature 30's split is preserved: expired and expiring-soon are two
 * lists, because "what do I need to use faster" and "what has already gone off"
 * are different questions and one combined list answers neither.
 *
 * The split itself is `splitExpiring` from `@supplies/core/expiry` — the same
 * pure function the Next app and the Telegram digest call.
 */
export function DashboardRoute() {
  const dashboard = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

  if (dashboard.isPending) return <Spinner />;
  if (dashboard.isError) return <ErrorNote error={dashboard.error} />;

  const expired = dashboard.data?.expiring.filter((i) => i.expiry === "EXPIRED") ?? [];
  const soon = dashboard.data?.expiring.filter((i) => i.expiry === "SOON") ?? [];
  const restock = dashboard.data?.restock ?? [];

  return (
    <div className="space-y-6">
      <Group title="Прострочено" items={expired} empty="Нічого не зіпсувалося." />
      <Group title="Скоро зіпсується" items={soon} empty="Нічого не горить." />
      <Group title="Закінчується" items={restock} empty="Усього вистачає." />
    </div>
  );
}

function Group({
  title,
  items,
  empty,
}: {
  title: string;
  items: ItemView[];
  empty: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500">
        {title} {items.length > 0 ? `(${items.length})` : null}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/items/${item.id}`}>
                <Card className="flex items-baseline justify-between gap-3 py-3 transition hover:border-emerald-300">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular-nums text-sm text-neutral-600">
                    {formatQuantityWithUnit(item.quantity, item.unit)}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
