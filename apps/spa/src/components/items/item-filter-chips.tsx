import type { ItemFilter } from "@supplies/core/item-list-params";
import { Chip } from "../chip";

const FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "attention", label: "Потребують уваги" },
  { value: "OUT", label: "Закінчились" },
  { value: "LOW", label: "Закінчуються" },
];

/**
 * The state filters and the category filters, in one scroller.
 *
 * `categories` is every category in the household rather than only those on
 * this page — the chips have to offer the ones that would filter to something
 * *else*, or narrowing the list would progressively remove the way back out
 * of it.
 */
export function ItemFilterChips({
  filter,
  category,
  categories,
  onChange,
}: {
  filter: ItemFilter;
  category: string;
  categories: string[];
  onChange: (next: { filter?: ItemFilter; category?: string }) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {FILTERS.map((option) => (
        <Chip
          key={option.value}
          active={filter === option.value}
          onClick={() => onChange({ filter: option.value })}
        >
          {option.label}
        </Chip>
      ))}

      <span className="w-px shrink-0 bg-border" />

      <Chip active={category === "all"} onClick={() => onChange({ category: "all" })}>
        Усі категорії
      </Chip>
      {categories.map((name) => (
        <Chip
          key={name}
          active={category === name}
          onClick={() => onChange({ category: name })}
        >
          {name}
        </Chip>
      ))}
    </div>
  );
}
