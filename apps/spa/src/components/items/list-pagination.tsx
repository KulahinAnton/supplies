import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, type PerPage } from "@supplies/core/item-list-params";
import { Button } from "@supplies/ui/button";

/**
 * Feature 28 — the pager and the page-size control.
 *
 * Rendered whenever there is anything at all, not only when there are several
 * pages: the page-size control is how you get *back* to seeing everything, so
 * hiding it on short lists would strand anyone who chose 10 and then filtered
 * down to 8. The pager itself still hides when there is one page, because a
 * disabled pair of arrows says nothing.
 */
export function ListPagination({
  from,
  to,
  total,
  page,
  pageCount,
  perPage,
  onPage,
  onPerPage,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  perPage: PerPage | "all";
  onPage: (page: number) => void;
  onPerPage: (perPage: PerPage | "all") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        {from}–{to} з {total}
      </p>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          На сторінці
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={String(perPage)}
            onChange={(event) => {
              const value = event.target.value;
              onPerPage(value === "all" ? "all" : (Number(value) as PerPage));
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
            <option value="all">усі</option>
          </select>
        </label>

        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              aria-label="Попередня сторінка"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              size="icon"
              variant="outline"
              aria-label="Наступна сторінка"
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
