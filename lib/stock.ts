/**
 * The stock engine (PROJECT_PROMPT.md §3.1–§3.4). Pure: no Prisma client, no
 * React, no I/O. Every rule the app enforces about quantities lives here, and
 * §3.6 is reproduced verbatim in `lib/stock.test.ts`.
 */

import { Prisma } from "@/lib/generated/prisma/client";
import type { Unit } from "@/lib/generated/prisma/enums";
import { batchExpiryState } from "@/lib/expiry";
import { formatQuantityWithUnitLong } from "@/lib/format";
import { ruleMessage, type RuleMessage } from "@/lib/messages";
import { compareDateOnly } from "@/lib/period";

type Decimal = Prisma.Decimal;

const ZERO = new Prisma.Decimal(0);

/** Stock level, §3.4. */
export type StockState = "OUT" | "LOW" | "OK";

/** The batch fields the engine reads. Real `StockBatch` rows satisfy this. */
export type StockBatchInput = {
  id: string;
  quantity: Decimal;
  expiresAt: Date | null;
  createdAt: Date;
};

/** The item fields the engine reads. */
export type StockItemInput = {
  minQty: Decimal;
  unit: Unit;
};

/** A batch still holding something. Zeroed batches stay as history (§3.3). */
function isLive(batch: StockBatchInput): boolean {
  return batch.quantity.greaterThan(ZERO);
}

/** Total stock: the sum of live batches (§3.1). Never stored on the item. */
export function itemQuantity(batches: readonly StockBatchInput[]): Decimal {
  return batches.reduce(
    (total, batch) => (isLive(batch) ? total.plus(batch.quantity) : total),
    ZERO,
  );
}

/**
 * Stock that may actually be used: total minus anything already expired (§3.3).
 * This is what a consume is checked against — the expired litre of milk is
 * still in the fridge, but you cannot drink it.
 */
export function availableQuantity(
  batches: readonly StockBatchInput[],
  today: Date,
  warnDays = 0,
): Decimal {
  return batches.reduce((total, batch) => {
    if (!isLive(batch)) return total;
    if (batchExpiryState(batch.expiresAt, today, warnDays) === "EXPIRED") {
      return total;
    }
    return total.plus(batch.quantity);
  }, ZERO);
}

/**
 * §3.4. Note this reads TOTAL stock, not available: an item whose only stock
 * is expired reads OK/LOW by quantity while the expiry dashboard screams about
 * it separately. The two axes are deliberately independent — merging them
 * would hide "you have 10 bottles, 2 of which went off".
 */
export function stockState(
  item: StockItemInput,
  batches: readonly StockBatchInput[],
): StockState {
  const quantity = itemQuantity(batches);
  if (quantity.lessThanOrEqualTo(ZERO)) return "OUT";
  // minQty 0 opts the item out of low-stock nagging entirely.
  if (item.minQty.greaterThan(ZERO) && quantity.lessThanOrEqualTo(item.minQty)) {
    return "LOW";
  }
  return "OK";
}

/** True for the states that make an item a shopping-list candidate (§3.4). */
export function needsRestock(state: StockState): boolean {
  return state === "OUT" || state === "LOW";
}

/**
 * FEFO order (§3.3): dated batches first, soonest expiry first; then undated
 * batches, oldest first. Expired batches are NOT in this list — they are
 * skipped entirely and must be discarded explicitly as WASTE.
 */
export function fefoOrder(
  batches: readonly StockBatchInput[],
  today: Date,
): StockBatchInput[] {
  return batches
    .filter(
      (batch) =>
        isLive(batch) &&
        batchExpiryState(batch.expiresAt, today, 0) !== "EXPIRED",
    )
    .sort((a, b) => {
      if (a.expiresAt && b.expiresAt) {
        const byDate = compareDateOnly(a.expiresAt, b.expiresAt);
        if (byDate !== 0) return byDate;
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

/** One line of a consume plan: take `take` units out of `batchId`. */
export type ConsumeDraw = {
  batchId: string;
  take: Decimal;
  /** Quantity the batch is left with — 0 means it becomes history. */
  remaining: Decimal;
};

export type ConsumePlan =
  | { ok: true; draws: ConsumeDraw[] }
  | { ok: false; error: RuleMessage };

/**
 * Plan a consume of `quantity` units (§3.3).
 *
 * All-or-nothing: if the non-expired stock cannot cover the request, the whole
 * thing is rejected with the shortfall named, rather than silently taking what
 * is there. A half-applied consume would leave the family believing they still
 * have something they do not.
 */
export function planConsume(
  item: StockItemInput,
  batches: readonly StockBatchInput[],
  quantity: Decimal,
  today: Date,
): ConsumePlan {
  if (quantity.lessThanOrEqualTo(ZERO)) {
    return { ok: false, error: ruleMessage("stock.quantityPositive") };
  }

  const ordered = fefoOrder(batches, today);
  const available = ordered.reduce((sum, batch) => sum.plus(batch.quantity), ZERO);

  if (available.lessThan(quantity)) {
    return {
      ok: false,
      error: ruleMessage("stock.shortfall", {
        missing: formatQuantityWithUnitLong(quantity.minus(available), item.unit),
        available: formatQuantityWithUnitLong(available, item.unit),
      }),
    };
  }

  const draws: ConsumeDraw[] = [];
  let outstanding = quantity;

  for (const batch of ordered) {
    if (outstanding.lessThanOrEqualTo(ZERO)) break;
    const take = Prisma.Decimal.min(batch.quantity, outstanding);
    draws.push({
      batchId: batch.id,
      take,
      remaining: batch.quantity.minus(take),
    });
    outstanding = outstanding.minus(take);
  }

  return { ok: true, draws };
}

/**
 * Absolute-quantity correction of a single batch (Feature 4). Returns the
 * signed delta to record as a CORRECTION movement.
 */
export function planCorrection(
  batch: StockBatchInput,
  newQuantity: Decimal,
): { ok: true; delta: Decimal } | { ok: false; error: RuleMessage } {
  if (newQuantity.lessThan(ZERO)) {
    return { ok: false, error: ruleMessage("stock.correctionNegative") };
  }
  return { ok: true, delta: newQuantity.minus(batch.quantity) };
}

/**
 * Discarding a batch (§3.3) — the only way expired stock leaves. Returns the
 * negative delta for the WASTE movement.
 */
export function planDiscard(
  batch: StockBatchInput,
): { ok: true; delta: Decimal } | { ok: false; error: RuleMessage } {
  if (!isLive(batch)) {
    return { ok: false, error: ruleMessage("stock.batchEmpty") };
  }
  return { ok: true, delta: batch.quantity.negated() };
}
