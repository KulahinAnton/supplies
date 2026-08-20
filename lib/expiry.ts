/**
 * Expiry states (PROJECT_PROMPT.md §3.5). Pure — no Prisma client, no React.
 *
 * `warnDays` is household data (`Household.expiryWarnDays`), never a constant
 * in this file: the family decides what "soon" means.
 */

import { addDays, compareDateOnly, daysBetween, toDateOnly } from "@/lib/period";

export type ExpiryState = "EXPIRED" | "SOON" | "FRESH" | "NONE";

/** Batch shape this module needs. Real `StockBatch` rows satisfy it. */
export type ExpiryBatch = {
  quantity: { isZero(): boolean; isNegative(): boolean };
  expiresAt: Date | null;
};

/**
 * Severity order for "the item takes the worst state of its batches".
 * NONE is the least severe: an undated batch is not a problem, it is an
 * absence of information.
 */
const SEVERITY: Record<ExpiryState, number> = {
  EXPIRED: 3,
  SOON: 2,
  FRESH: 1,
  NONE: 0,
};

export function batchExpiryState(
  expiresAt: Date | null,
  today: Date,
  warnDays: number,
): ExpiryState {
  if (!expiresAt) return "NONE";
  const day = toDateOnly(expiresAt);
  const from = toDateOnly(today);
  if (compareDateOnly(day, from) < 0) return "EXPIRED";
  // Inclusive on both ends: expiring today is SOON, and so is the last day of
  // the warning window.
  if (compareDateOnly(day, addDays(from, warnDays)) <= 0) return "SOON";
  return "FRESH";
}

/** Batches with no quantity left are history and never drive a warning. */
function isLive(batch: ExpiryBatch): boolean {
  return !batch.quantity.isZero() && !batch.quantity.isNegative();
}

/**
 * The worst state among an item's live batches (§3.5). An item with no live
 * batches has nothing to expire, so it reports NONE — its problem, if any, is
 * being out of stock, which is `stockState`'s business.
 */
export function itemExpiryState(
  batches: readonly ExpiryBatch[],
  today: Date,
  warnDays: number,
): ExpiryState {
  let worst: ExpiryState = "NONE";
  for (const batch of batches) {
    if (!isLive(batch)) continue;
    const state = batchExpiryState(batch.expiresAt, today, warnDays);
    if (SEVERITY[state] > SEVERITY[worst]) worst = state;
  }
  return worst;
}

/** Whole days until `expiresAt`; negative once it has passed. */
export function daysUntil(expiresAt: Date, today: Date): number {
  return daysBetween(today, expiresAt);
}

/** True for states the dashboard should surface (§3.5 → Feature 5). */
export function needsAttention(state: ExpiryState): boolean {
  return state === "EXPIRED" || state === "SOON";
}

/**
 * Sort comparator putting the most urgent batch first: expired before soon,
 * earlier dates before later, undated last. Used by the dashboard and by the
 * FEFO planner's presentation layer.
 */
export function byUrgency(a: ExpiryBatch, b: ExpiryBatch): number {
  if (a.expiresAt && b.expiresAt) return compareDateOnly(a.expiresAt, b.expiresAt);
  if (a.expiresAt) return -1;
  if (b.expiresAt) return 1;
  return 0;
}
