/**
 * Feature 12.2 — ordering the stock list. Pure, so the tie-break rules are
 * stated once and tested.
 *
 * Sorting happens over rows already fetched, not as another query: the list is
 * small, the filters are already client-side, and changing the order must not
 * cost a round trip.
 */

export const ITEM_SORTS = [
  "name",
  "expiring",
  "freshest",
  "newest",
  "oldest",
] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/**
 * Two axes live in one menu — when a batch expires, and when the item was
 * added — so the labels must say which. «Спочатку нові» read as either until
 * expiry sorting existed; «Нещодавно додані» cannot.
 */
export const ITEM_SORT_LABELS: Record<ItemSort, string> = {
  name: "За назвою",
  expiring: "Спочатку прострочені",
  freshest: "Спочатку з довгим терміном",
  newest: "Нещодавно додані",
  oldest: "Давно додані",
};

export function isItemSort(value: unknown): value is ItemSort {
  return typeof value === "string" && (ITEM_SORTS as readonly string[]).includes(value);
}

export type SortableItem = {
  name: string;
  /** Epoch milliseconds — `createdAt` does not survive the client boundary. */
  createdAtMs: number;
  /**
   * Soonest expiry among live batches, ISO, or null when the item has no
   * dated stock. A string for the same reason: Date does not survive the
   * server/client boundary intact.
   */
  nextExpiryIso: string | null;
};

const byName = (a: SortableItem, b: SortableItem) =>
  a.name.localeCompare(b.name, "uk-UA");

/**
 * Null for "no date to sort by", including a value that will not parse — a
 * corrupt date must push an item to the end of the list, never to the top
 * where it would masquerade as the most urgent thing in the house.
 */
function expiryMs(item: SortableItem): number | null {
  if (!item.nextExpiryIso) return null;
  const ms = Date.parse(item.nextExpiryIso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Every mode falls back to name, so the order is **total**: two items created
 * in the same second (the seed does exactly that) must not shuffle between
 * renders. Returns a new array — the input is left alone.
 */
export function sortItems<T extends SortableItem>(
  items: readonly T[],
  sort: ItemSort,
): T[] {
  const sorted = [...items];

  switch (sort) {
    /**
     * Earliest expiry first, so the most overdue item is at the top and the
     * next thing to go off is right behind it — one order answering both
     * "what have we lost?" and "what must we use?".
     *
     * Undated items sink to the bottom. They are not urgent; they are
     * unknown, and putting an unknown above a carton that expired last week
     * would bury the thing the person opened this screen to find.
     */
    case "expiring":
      return sorted.sort((a, b) => {
        const left = expiryMs(a);
        const right = expiryMs(b);
        if (left === null && right === null) return byName(a, b);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right || byName(a, b);
      });
    /**
     * The mirror: longest shelf life first, for "what can wait?".
     *
     * Undated items still sink, exactly as in "expiring" — the rule is that
     * no date means unknown, and unknown never outranks a date in either
     * direction. Floating them to the top here would be just as wrong, only
     * less obviously so.
     */
    case "freshest":
      return sorted.sort((a, b) => {
        const left = expiryMs(a);
        const right = expiryMs(b);
        if (left === null && right === null) return byName(a, b);
        if (left === null) return 1;
        if (right === null) return -1;
        return right - left || byName(a, b);
      });
    case "newest":
      return sorted.sort(
        (a, b) => b.createdAtMs - a.createdAtMs || byName(a, b),
      );
    case "oldest":
      return sorted.sort(
        (a, b) => a.createdAtMs - b.createdAtMs || byName(a, b),
      );
    case "name":
    default:
      return sorted.sort(byName);
  }
}
