import { ArrowDownUp, Search } from "lucide-react";
import { ITEM_SORTS, ITEM_SORT_LABELS, type ItemSort } from "@supplies/core/item-sort";
import { BarcodeScanButton } from "@supplies/ui/barcode-scan-button";
import { Button } from "@supplies/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";
import { Input } from "@supplies/ui/input";

/**
 * The search field, the scan button and the sort menu.
 *
 * This component is rendered unconditionally by its parent, and that is the
 * whole point. It used to sit inside a `page && (…)`, so every debounced
 * keystroke — which changes the query key — unmounted the field along with the
 * results, and the caret went with it. **A control that drives a query must
 * never be conditional on that query's data.** Keeping it in its own file is
 * how that stays true: there is no `data` in scope here to be tempted by.
 */
export function ItemSearchBar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  onScan,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
  onScan: (code: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Пошук за назвою…"
          className="pl-9"
          type="search"
          aria-label="Пошук за назвою"
        />
      </div>

      <BarcodeScanButton onScan={onScan} />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" aria-label="Сортування">
              <ArrowDownUp className="size-4" />
              <span className="hidden sm:inline">{ITEM_SORT_LABELS[sort]}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {ITEM_SORTS.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => onSortChange(option)}
              className={option === sort ? "font-semibold" : undefined}
            >
              {ITEM_SORT_LABELS[option]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
