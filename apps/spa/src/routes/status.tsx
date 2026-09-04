import { useQuery } from "@tanstack/react-query";
import { API_URL, apiFetch, type Health, type Meta, type Ready } from "../api/client";
import { formatQuantityWithUnitLong } from "@supplies/core/format";
import { Decimal } from "@supplies/core/decimal";

/**
 * Phase 2.1 — the scaffold's proof of life, and deliberately not a mock.
 *
 * There is no auth and there are no data endpoints yet (Phase 1.2 onward), so
 * the only honest thing this page can show is whether the three pieces are
 * actually talking: React Router routing, TanStack Query fetching, the API
 * answering, and CORS permitting it. Every number below is fetched.
 *
 * The formatted quantity at the bottom is the other half of the point. It is
 * rendered by `@supplies/core/format` — the same function the Next app and the
 * Telegram bot use — running in a browser bundle that contains no Prisma. That
 * is the whole reason Phase 0 existed.
 */
export function StatusRoute() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/health"),
    refetchInterval: 10_000,
  });
  const ready = useQuery({
    queryKey: ["ready"],
    queryFn: () => apiFetch<Ready>("/health/ready"),
    refetchInterval: 10_000,
  });
  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => apiFetch<Meta>("/api/meta"),
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Стан API</h2>
        <p className="text-sm text-neutral-500">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5">{API_URL}</code>
        </p>

        <dl className="grid gap-2 sm:grid-cols-2">
          <Row
            label="Процес"
            state={health.isPending ? "…" : health.isError ? "недоступний" : "працює"}
            ok={health.isSuccess}
            detail={health.data ? `${health.data.uptime} с` : health.error?.message}
          />
          <Row
            label="База даних"
            state={
              ready.isPending ? "…" : ready.data?.database ? "підключена" : "недоступна"
            }
            ok={ready.data?.database === true}
            detail={ready.error?.message}
          />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Одиниці з API</h2>
        <p className="text-sm text-neutral-500">
          Список приходить з <code>@supplies/core/units</code> — той самий, який
          валідують zod-схеми.
        </p>
        {meta.isError ? (
          <p className="text-sm text-red-600">{meta.error.message}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(meta.data?.units ?? []).map((unit) => (
              <li
                key={unit}
                className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
              >
                {unit}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Рушій у браузері</h2>
        <p className="text-sm text-neutral-500">
          Відформатовано через <code>@supplies/core/format</code>, без Prisma в
          бандлі:
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatQuantityWithUnitLong(new Decimal("2.5"), "LITRE")}
        </p>
      </section>
    </div>
  );
}

function Row({
  label,
  state,
  ok,
  detail,
}: {
  label: string;
  state: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span
          className={`inline-block size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300"}`}
          aria-hidden
        />
        <span className="font-medium">{state}</span>
        {detail ? <span className="text-sm text-neutral-500">{detail}</span> : null}
      </dd>
    </div>
  );
}
