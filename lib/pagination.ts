/**
 * Feature 28 — page arithmetic, kept away from the query and the component.
 *
 * The interesting part is what happens when a page number cannot be honoured:
 * narrowing a filter while on page 7 leaves a page that no longer exists, and
 * an empty list with no explanation looks like the filter matched nothing.
 * Clamping into range means the user lands on the last real page instead.
 */

export type Page<T> = {
  rows: T[];
  /** The page actually shown, after clamping — not necessarily what was asked. */
  page: number;
  pageCount: number;
  /** Matching rows before paging; what "1–25 of 74" counts. */
  total: number;
  from: number;
  to: number;
};

export function paginate<T>(
  items: readonly T[],
  page: number,
  perPage: number | "all",
): Page<T> {
  const total = items.length;

  if (perPage === "all") {
    return { rows: [...items], page: 1, pageCount: 1, total, from: total ? 1 : 0, to: total };
  }

  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * perPage;
  const rows = items.slice(start, start + perPage);

  return {
    rows,
    page: current,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: start + rows.length,
  };
}
