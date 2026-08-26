/**
 * Shopping-list candidates (PROJECT_PROMPT.md §3.4 → Feature 6). Pure.
 *
 * Candidates are SUGGESTIONS. Nothing in here writes to the list — Feature 6
 * shows them as "додати?" prompts and the family decides. Auto-inserting is a
 * deliberate non-goal: a list that fills itself stops being read.
 */

import { Prisma } from "@/lib/generated/prisma/client";
import {
  itemQuantity,
  needsRestock,
  stockState,
  type StockBatchInput,
  type StockItemInput,
  type StockState,
} from "@/lib/stock";

type Decimal = Prisma.Decimal;

export type CandidateItem = StockItemInput & {
  id: string;
  name: string;
};

export type ShoppingCandidate = {
  itemId: string;
  name: string;
  state: StockState;
  quantity: Decimal;
  minQty: Decimal;
  unit: CandidateItem["unit"];
};

/**
 * Items that are OUT or LOW and are not already sitting unchecked on the list.
 *
 * `onList` is the set of item ids with an unchecked row — an item already
 * written down is not a candidate, otherwise the dashboard would nag about
 * something the family has already dealt with.
 *
 * Sorted OUT before LOW, then by name, so the empty shelves come first.
 */
export function shoppingCandidates(
  items: readonly CandidateItem[],
  batchesByItem: ReadonlyMap<string, readonly StockBatchInput[]>,
  onList: ReadonlySet<string>,
): ShoppingCandidate[] {
  const candidates: ShoppingCandidate[] = [];

  for (const item of items) {
    if (onList.has(item.id)) continue;
    const batches = batchesByItem.get(item.id) ?? [];
    const state = stockState(item, batches);
    if (!needsRestock(item, state)) continue;
    candidates.push({
      itemId: item.id,
      name: item.name,
      state,
      quantity: itemQuantity(batches),
      minQty: item.minQty,
      unit: item.unit,
    });
  }

  return candidates.sort((a, b) => {
    if (a.state !== b.state) return a.state === "OUT" ? -1 : 1;
    return a.name.localeCompare(b.name, "uk-UA");
  });
}

/** A list row is either a known item or a free-text one-off, never both. */
export function isValidListRow(row: {
  itemId: string | null;
  freeText: string | null;
}): boolean {
  const hasItem = row.itemId !== null && row.itemId !== "";
  const hasText = row.freeText !== null && row.freeText.trim() !== "";
  return hasItem !== hasText;
}
